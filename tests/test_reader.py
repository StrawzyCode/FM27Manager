"""Runs the real fm26mem reader against the synthetic process.  python tests/test_reader.py"""
import os
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
check(snap.info['club'] == 'KäPa', 'human club found')
check(snap.info['squad'] == len(world.kapa_squad), 'squad size %d == %d' % (snap.info['squad'], len(world.kapa_squad)))
check(snap.info['home_grown_ready'] is False, 'home-grown reports not ready until calibrated')

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

# --- home-grown: not calibrated -> filter ignored, then with the test layout patched in
check(snap.home_grown('nation15', 'Finland') is None, 'home_grown() is None while uncalibrated')
check(len(idx_q(home_grown=('nation15', 'Finland', False))) == len(everyone), 'uncalibrated home-grown filter is ignored')
fakefm.patch_history_layout()
snap.info['home_grown_ready'] = snap.home_grown_ready()
hg_fin = snap.home_grown('nation15', 'Finland')
hg_swe = snap.home_grown('nation15', 'Sweden')
hg_club = snap.home_grown('club15')
h1, h2 = world.hg_swede_in_finland, world.hg_finn_in_sweden
i1, i2 = h1['idx'], h2['idx']
check(snap.names[i1] == h1['name'] and snap.names[i2] == h2['name'], 'record indices line up')
check(bool(hg_fin[i1]) and not bool(hg_swe[i1]), 'Swede with 4 Finnish seasons at 15-18: trained in Finland, not Sweden')
check(bool(hg_swe[i2]), 'Finn with 3 Swedish seasons at 15-17: trained in Sweden')
check(bool(hg_fin[i2]), '... and in Finland too: a loan at 18 + KaPa at 19, 20 = 3 Finnish seasons (loans count for nation rules)')
check(bool(hg_club[i1]), 'trained at club (KäPa 17-20 = 4 seasons)')
check(not bool(hg_club[i2]), 'not trained at club (KäPa only from 19)')
n_fin = int(hg_fin[snap.valid].sum())
in_q = idx_q(home_grown=('nation15', 'Finland', False))
not_q = idx_q(home_grown=('nation15', 'Finland', True))
check(len(in_q) + len(not_q) == len(everyone), '"is" and "is not" split the pool')
print('trained in Finland (15-21): %d players; pool split %d / %d' % (n_fin, len(in_q), len(not_q)))

print('\n%d failure(s)' % len(fails))
sys.exit(1 if fails else 0)
