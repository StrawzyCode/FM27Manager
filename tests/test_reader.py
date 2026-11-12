"""Runs the real fm26mem reader against the synthetic process.  python tests/test_reader.py"""
import os
import struct
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fakefm  # noqa: E402

world = fakefm.build()
fakefm.install(world)

import numpy as np  # noqa: E402
from fm26mem import FM26Reader  # noqa: E402
from fm26mem import interest as I  # noqa: E402

fails = []


def check(cond, msg):
    print(('PASS ' if cond else 'FAIL ') + msg)
    if not cond:
        fails.append(msg)


r = FM26Reader()
t0 = time.time()
snap = r.scan()
print('scan %.2fs' % (time.time() - t0), {k: snap.info[k] for k in ('players', 'club', 'squad', 'loan_in', 'loaned_out', 'game_date', 'club_rep')})
check(len(snap.N) == len(world.recs) and snap.names[-1] == world.players[-1]['name'],
      'every record read, though the last one runs past the end of its memory block (%d of %d)' % (len(snap.N), len(world.recs)))
check(snap.info['club'] == 'KäPa', 'human club found')
check(snap.info['squad'] == len(world.kapa_squad), 'squad size %d == %d' % (snap.info['squad'], len(world.kapa_squad)))
check(snap.info['home_grown_ready'] is True, 'home-grown status reported as available')

# --- injuries
report = {}
inj = snap.injuries(report=report)
got = {snap.names[i]: nm for i, nm in inj.items()}
print('injured:', got)
print('report:', {k: v for k, v in report.items() if k != 'list_entries'})
check(got == world.injured_expected, 'injuries: exactly the 4 current ones (usual marker, filled date, no marker, recent)')
for nm in world.not_injured:
    check(nm not in got, 'not injured: %s' % nm)
squad_payload = [snap.player(int(i)) for i in snap.squad_indices()]
check(sum(1 for p in squad_payload if p.get('injured')) == 4, 'squad rows carry 4 injured flags')

# --- interest
t, ln = snap.interest_levels()
valid = snap.valid
print('transfer levels:', np.bincount(t[valid], minlength=4), 'loan levels (-1..3):', np.bincount(ln[valid] + 1, minlength=5))
months = snap.contract_months_left()
check(np.isfinite(months[valid & (snap.contract_club_ptr != 0)]).mean() > 0.99, 'contract months read for players with a contract')
free = valid & (snap.club_ptr == 0)
check((t[free] == I.INTERESTED).all(), 'free agents: transfer interested')
check((ln[free] == I.LOAN_IMPOSSIBLE).all(), 'free agents: loan impossible')
on_loan = valid & (snap.loan_club_ptr != 0)
check((ln[on_loan] == I.LOAN_IMPOSSIBLE).all(), 'players out on loan: loan impossible')
too_good = valid & (snap.rep[:, 2] > snap.club_reputation() + I.TOO_GOOD_MARGIN)
check((t[too_good] == 0).all() and (ln[too_good] <= 0).all(), 'too-good players never interested')

idx_q = lambda **kw: snap.query(exclude_squad=True, limit=10 ** 9, **kw)  # noqa: E731
everyone = idx_q()
tl = idx_q(interest_mode='tl', interest_level=3)
tr = idx_q(interest_mode='transfer', interest_level=3)
lo = idx_q(interest_mode='loan', interest_level=3)
lo1 = idx_q(interest_mode='loan', interest_level=1)
nc = idx_q(interest_mode='none')
print('pool sizes: all %d, t-or-l interested %d, transfer interested %d, loan interested %d, loan doubtful+ %d, not considered %d'
      % (len(everyone), len(tl), len(tr), len(lo), len(lo1), len(nc)))
check(set(tr) | set(lo) == set(tl), 'transfer-or-loan = union of transfer and loan at the same level')
check(set(lo) <= set(lo1), 'levels are cumulative')
check(not (set(nc) & set(lo1)), 'not considered excludes anyone who would consider a loan')
check(len(set(everyone)) == len(set(nc) | set(idx_q(interest_mode='tl', interest_level=1))), 'not considered + t-or-l doubtful+ = everyone')
loan_only_targets = [i for i in lo1 if t[i] == 0]
print('players who would only come on loan:', len(loan_only_targets),
      [(snap.names[i], snap.club_names([snap.club_ptr[i]])[int(snap.club_ptr[i])], int(snap.age[i]), int(snap.ca[i])) for i in loan_only_targets[:5]])
check(len(loan_only_targets) > 0, 'some players are loan-only targets (bigger clubs, not playing)')

# --- home-grown: read from the game's eligibility entries in the relation list
hg = {r: snap.home_grown(r, 'Finland') for r in ('nation15', 'nation0')}
hg_swe = snap.home_grown('nation15', 'Sweden')
hg_club15, hg_club0 = snap.home_grown('club15'), snap.home_grown('club0')
h1, h2, h3 = world.hg_swede_in_finland, world.hg_finn_in_sweden, world.hg_long_list
i1, i2, i3 = h1['idx'], h2['idx'], h3['idx']
check(snap.names[i1] == h1['name'] and snap.names[i2] == h2['name'], 'record indices line up')
check(bool(hg['nation15'][i1]) and not bool(hg_swe[i1]), 'Swede listed "Homegrown 15-21" for Finland: trained in Finland, not Sweden')
check(bool(hg_swe[i2]) and not bool(hg['nation15'][i2]), 'Finn listed 15-21 for Sweden and only 0-21 for Finland: not Finland (15-21)')
check(bool(hg['nation0'][i2]) and bool(hg['nation0'][i1]), '... Finland (0-21) accepts both the 0-21 and the 15-21 entry')
check(bool(hg_club15[i1]) and not bool(hg_club15[i2]), 'trained at club: KäPa entry yes; a favourite-club entry for KäPa no')
check(snap.nation_table.get(int(snap.secondary_nations()[i1][0])) == 'Estonia', 'secondary nationality still read (Estonia)')
check(bool(snap.home_grown('nation15', 'England')[i3]) and bool(hg_club0[i3]) and not bool(hg_club15[i3]),
      'entries past the first 32 of a long relation list are read (England 15-21, KäPa 0-21)')
i4 = world.hg_club_only['idx']
check(bool(hg['nation0'][i4]) and not bool(hg['nation15'][i4]) and not snap.home_grown('nation0', 'Ghana')[i4],
      'a club entry counts for the club\'s country: KäPa 0-21 only = Finland 0-21, whatever his nationality')
check(snap.home_grown('nation15', 'Atlantis') is not None and not snap.home_grown('nation15', 'Atlantis').any(),
      'an unknown nation matches nobody')
check(snap.home_grown('nation15', '') is None, 'no nation given: rule not applied')
n_fin = int(hg['nation15'][snap.valid].sum())
in_q = idx_q(home_grown=('nation15', 'Finland', False))
not_q = idx_q(home_grown=('nation15', 'Finland', True))
check(len(in_q) + len(not_q) == len(everyone), '"is" and "is not" split the pool')
check(len(idx_q(home_grown=('nation0', 'Finland', False))) >= len(in_q), '0-21 pool includes the 15-21 pool')
print('trained in Finland (15-21): %d players; pool split %d / %d' % (n_fin, len(in_q), len(not_q)))

# --- condition and match sharpness (record + 0x114 / + 0x110, 0..10000 -> %)
sq = snap.squad_indices()
by_idx = {p['idx']: p for p in world.players}
rows = {int(i): snap.player(int(i), with_attrs=False) for i in sq}
check(all(r['condition'] == round(by_idx[i]['condition'] / 100, 1) and r['sharpness'] == round(by_idx[i]['sharpness'] / 100, 1)
          for i, r in rows.items()), 'every squad row carries his condition and match sharpness in %% (%d rows)' % len(rows))
check(any(r['condition'] < 100 for r in rows.values()) and any(r['sharpness'] == 100 for r in rows.values()),
      'a mix of tired, rusty and fully fit players')
# a day later the game has moved them on, and the squad list re-reads them without a rescan
fa, fb = world.kapa_squad[0], world.kapa_squad[1]
world.mem.write(fa['rec'] + 0x110, struct.pack('<H', 5000))
world.mem.write(fa['rec'] + 0x114, struct.pack('<H', 8000))
world.mem.write(fb['rec'] + 0x110, struct.pack('<H', 6000))
world.mem.write(fb['rec'] + 0x14C, struct.pack('<I', 0xFFFFFFFE))      # ... but fb's record no longer holds him
refreshed = snap.refresh_fitness(sq)
ra, rb = snap.player(fa['idx'], with_attrs=False), snap.player(fb['idx'], with_attrs=False)
check(ra['sharpness'] == 50.0 and ra['condition'] == 80.0, "refresh_fitness picks up the new day's values")
check(rb['sharpness'] == round(fb['sharpness'] / 100, 1), '... but not from a record that now holds someone else')
check(refreshed == len(sq) - 1, 'refreshed %d of %d squad players' % (refreshed, len(sq)))

print('\n%d failure(s)' % len(fails))
sys.exit(1 if fails else 0)
