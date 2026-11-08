"""Live reader for Football Manager 26 / 27's player database (read-only)."""
import datetime
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor

import numpy as np

from . import interest as interest_model
from . import layout as L
from . import permits
from .winmem import MEM_MAPPED, MEM_PRIVATE, Process, find_pids, process_image_path

GAME_EXE = 'fm.exe'
ENGINE_DLL = 'game_plugin.dll'

CHUNK = 32 * 1024 * 1024
OVERLAP = 4 * 1024 * 1024


class FMNotRunning(RuntimeError):
    pass


class LayoutError(RuntimeError):
    pass


class BatchReader:
    """Resolves many scattered pointers with few, large ReadProcessMemory calls."""

    def __init__(self, proc, gap=0x20000, max_span=24 * 1024 * 1024, workers=8):
        self.proc = proc
        self.gap = gap
        self.max_span = max_span
        self.workers = workers

    def fetch(self, addrs, size):
        """{address: bytes(size)} for every distinct non-null address that could be read."""
        a = np.unique(np.asarray(addrs, dtype=np.uint64))
        a = a[a != 0]
        if a.size == 0:
            return {}
        al = a.tolist()
        spans = []
        i, n = 0, len(al)
        while i < n:
            lo = al[i]
            j = i
            while j + 1 < n and al[j + 1] - al[j] <= self.gap and (al[j + 1] + size - lo) <= self.max_span:
                j += 1
            spans.append((lo, al[j] + size, i, j))
            i = j + 1

        out = {}

        def work(sp):
            lo, hi, i0, j0 = sp
            res = {}
            buf = self.proc.read(lo, hi - lo)
            if buf is not None and len(buf) == hi - lo:
                raw = buf.tobytes()
                for k in range(i0, j0 + 1):
                    off = al[k] - lo
                    res[al[k]] = raw[off:off + size]
            else:                                   # a hole in the span: fall back to point reads
                for k in range(i0, j0 + 1):
                    b = self.proc.read_bytes(al[k], size)
                    if b is not None and len(b) == size:
                        res[al[k]] = b
            return res

        with ThreadPoolExecutor(max_workers=self.workers) as ex:
            for res in ex.map(work, spans):
                out.update(res)
        return out


def gather(proc, addrs, size, gap=0x20000, max_span=24 * 1024 * 1024, workers=8):
    """(rows, ok): rows[i] = `size` bytes read at addrs[i] (zeros where unreadable or null).

    Vectorised sibling of BatchReader.fetch for big uniform batches: nearby addresses share
    one large read and the rows are cut out with fancy indexing instead of a Python loop."""
    a = np.asarray(addrs, dtype=np.uint64)
    rows = np.zeros((len(a), size), dtype=np.uint8)
    ok = np.zeros(len(a), dtype=bool)
    order = np.flatnonzero(a != 0)
    if not len(order):
        return rows, ok
    order = order[np.argsort(a[order], kind='stable')]
    sa = a[order].astype(np.int64)
    breaks = np.flatnonzero(np.diff(sa) > gap + size) + 1
    groups = []
    for s, e in zip(np.r_[0, breaks], np.r_[breaks, len(sa)]):
        while s < e:                                   # cap the size of a single read
            stop = int(np.searchsorted(sa, sa[s] + max_span - size, side='right'))
            stop = min(max(stop, s + 1), e)
            groups.append((int(s), stop))
            s = stop
    ar = np.arange(size)

    def work(g):
        s, e = g
        lo = int(sa[s])
        hi = int(sa[e - 1]) + size
        buf = proc.read(lo, hi - lo)
        if buf is not None and len(buf) == hi - lo:
            rel = sa[s:e] - lo
            rows[order[s:e]] = buf[rel[:, None] + ar[None, :]]
            ok[order[s:e]] = True
        else:                                          # a hole in the span: point reads
            for j in range(s, e):
                b = proc.read(int(sa[j]), size)
                if b is not None and len(b) == size:
                    rows[order[j]] = b
                    ok[order[j]] = True

    with ThreadPoolExecutor(max_workers=workers) as ex:
        list(ex.map(work, groups))
    return rows, ok


def _u16(N, off):
    return np.ascontiguousarray(N[:, off:off + 2]).view('<u2').ravel()


def _u32(N, off):
    return np.ascontiguousarray(N[:, off:off + 4]).view('<u4').ravel()


def _u64(N, off):
    return np.ascontiguousarray(N[:, off:off + 8]).view('<u8').ravel()


def _doy_to_date(day, year):
    try:
        return datetime.date(int(year), 1, 1) + datetime.timedelta(days=int(day) - 1)
    except (ValueError, OverflowError):
        return None


def _fmt_date(day, year):
    d = _doy_to_date(day, year)
    if d is None or d.year < 1950:
        return ''
    return d.strftime('%d/%m/%Y')


def _parse_lenstr(b):
    """[u32 length][utf-8 bytes] -> str, or None if it needs a longer read."""
    if not b or len(b) < 4:
        return None
    n = int.from_bytes(b[:4], 'little')
    if n == 0:
        return ''
    if n > len(b) - 4:
        return None
    return b[4:4 + n].decode('utf-8', 'replace')


DATE_SUPPORT = 10            # players that must share a date stamp before it can be "today"
MAX_REL_ENTRIES = 32         # relation entries read per player (secondary nationalities are listed first)

# Where a player stands relative to the human manager's club (see resolve_membership)
ST_NONE, ST_CURRENT, ST_LOAN_IN, ST_LOAN_OUT, ST_GONE = 0, 1, 2, 3, 4
ST_LABELS = {ST_NONE: '', ST_CURRENT: 'current', ST_LOAN_IN: 'loan_in', ST_LOAN_OUT: 'loan_out', ST_GONE: 'gone'}

INTEREST_MODES = ('tl', 'transfer', 'loan', 'none')

# Home-grown rules as the game names them: (club or nation, from age, to age, seasons needed). "Trained in
# nation (15-21)" = registered with clubs in that nation for 3 seasons (36 months) between 15 and 21.
HOME_GROWN_RULES = {
    'nation15': ('nation', 15, 21, 3),
    'club15': ('club', 15, 21, 3),
    'nation0': ('nation', 0, 21, 3),
    'club0': ('club', 0, 21, 3),
}


class Snapshot:
    """Everything decoded from one scan of the process."""

    def __init__(self, proc, N, addrs, info):
        self.proc = proc
        self.N = N
        self.addrs = addrs
        self.info = info
        self.batch = BatchReader(proc)
        self._club_cache = {}
        self._club_names = {}                 # club object pointer -> short name
        self._parent = {}                     # player index -> parent club name (while on loan)
        self.contract_owner = np.zeros(len(N), dtype=np.uint64)      # person his contract points back at
        self.contract_club_ptr = np.zeros(len(N), dtype=np.uint64)   # who holds his contract (0 = none)
        self.loan_club_ptr = np.zeros(len(N), dtype=np.uint64)       # where he is on loan (0 = not on loan)
        self.club_ptr = np.zeros(len(N), dtype=np.uint64)            # where he plays right now (0 = no club)
        self.squad_status = np.zeros(len(N), dtype=np.uint8)
        self.home_club_ptr = 0
        self.home_club_name = ''
        self.home_nation_ptr = 0
        self.home_nation_name = ''
        self.home_candidates = []             # [{'ptr', 'name', 'flagged'}] best guesses for "my club"
        self._secondary = None                # lazily read: (n, 4) secondary-nationality pointers
        self._permit = None                   # lazily computed: needs a work permit at the human club?
        self._stature = None                  # lazily computed: (per-player club stature, {club: stature}, rank in club)
        self._interest = None                 # lazily computed: (transfer, loan) interest in joining the human club
        self._months_left = None              # lazily computed: months left on each contract
        self._history = None                  # lazily read: career history (home-grown status), once calibrated
        self._club_nation = {}                # club object pointer -> nation name
        self._injuries = None                 # lazily computed: {player index: injury} for the first team
        self.home_rep = 0                     # the human club's stored reputation (0 = not stored)
        self._decode()

    # ---------------------------------------------------------------- decoding
    def _decode(self):
        N = self.N
        n = len(N)
        self.n = n
        self.ids = _u32(N, L.OFF_ID)
        self.tags = _u32(N, L.OFF_TAG)
        self.ca = _u16(N, L.OFF_CA)
        self.pa = _u16(N, L.OFF_PA)
        self.rep = np.stack([_u16(N, L.OFF_REP + 2 * i) for i in range(3)], axis=1)
        self.flags = _u16(N, L.OFF_FLAGS)
        self.value = _u32(N, L.OFF_VALUE)
        self.height = N[:, L.OFF_HEIGHT].astype(np.int32)
        self.ratings = N[:, L.OFF_RATINGS:L.OFF_RATINGS + 15]
        self.attrs = N[:, L.OFF_ATTRS:L.OFF_ATTRS + 54]
        self.personality = N[:, L.OFF_PERSONALITY:L.OFF_PERSONALITY + 8]
        self.dob_day = _u16(N, L.OFF_DOB).astype(np.int32)
        self.dob_year = _u16(N, L.OFF_DOB + 2).astype(np.int32)
        self.ptr_name = [_u64(N, o) for o in (L.OFF_NAME_FIRST, L.OFF_NAME_LAST, L.OFF_NAME_COMMON)]
        self.ptr_nation = _u64(N, L.OFF_NATION)
        self.ptr_contract = _u64(N, L.OFF_CONTRACT)
        self.ptr_loan = _u64(N, L.OFF_LOAN)
        self.ptr_relations = _u64(N, L.OFF_RELATIONS)

        # Not every slot is a player: unused slots inside the pages (FM27 has ~600) carry tag
        # 0xFFFFFFFF and no name, and a player who retires keeps his record but loses his player ID
        # (0xFFFFFFFF), so he stops being a player (he may live on as a coach).
        self.dob_ok = (self.dob_year >= 1960) & (self.dob_year <= 2015) & (self.dob_day >= 1) & (self.dob_day <= 366)
        valid = self.dob_ok & (self.tags != L.TAG_UNUSED) & (self.ids != L.ID_NONE)
        self.valid = valid
        self.retired = int((self.dob_ok & (self.tags != L.TAG_UNUSED) & (self.ids == L.ID_NONE)).sum())

        # The game date. Each simulated player carries the date the engine last updated him, so
        # "today" is the newest stamp that a real number of players share. (The most common stamp
        # is wrong in a fresh save: only the human club's squad has been updated so far and
        # everyone else still has the database's build date.)
        stamp_day = _u16(N, L.OFF_DATE_STAMP).astype(np.int64)
        stamp_year = _u16(N, L.OFF_DATE_STAMP + 2).astype(np.int64)
        ok = valid & (stamp_year >= 2000) & (stamp_year <= 2100) & (stamp_day >= 1) & (stamp_day <= 366)
        self.stamp = np.where(ok, stamp_year * 1000 + stamp_day, 0)         # sortable "last updated"
        if ok.any():
            keys, counts = np.unique(stamp_year[ok] * 1000 + stamp_day[ok], return_counts=True)
            backed = keys[counts >= DATE_SUPPORT]
            k = int(backed.max() if len(backed) else keys[int(np.argmax(counts))])
            self.game_year, self.game_day = k // 1000, k % 1000
        else:
            today = datetime.date.today()
            self.game_year, self.game_day = today.year, today.timetuple().tm_yday
        self.game_date = _doy_to_date(self.game_day, self.game_year)

        age = self.game_year - self.dob_year - (self.game_day < self.dob_day).astype(np.int32)
        self.age = np.where(valid, age, 0)
        self.my_squad = (self.flags & L.FLAG_HUMAN_CLUB) != 0

    def validate(self):
        """Sanity checks that fail loudly if a game update moved things around.

        These only look for a *wrong layout* (garbage where fields should be). Odd individual
        records - retired players, unused slots, stale duplicates - are handled quietly elsewhere
        and must never stop a scan."""
        n = self.n
        problems = []
        if n < 1000:
            problems.append('only %d player records found' % n)
        else:
            if self.dob_ok.mean() < 0.95:
                problems.append('birth dates implausible (%.1f%% valid)' % (100 * self.dob_ok.mean()))
            if (self.attrs > 100).mean() > 0.005:
                problems.append('attribute bytes out of range')
            if (self.ratings > 20).mean() > 0.005:
                problems.append('position ratings out of range')
            if ((self.ca > 200) | (self.pa > 220)).mean() > 0.02:
                problems.append('ability values out of range')
        if problems:
            raise LayoutError('Football Manager memory layout not recognised (%s). The game was probably '
                              'updated; fm26mem/layout.py needs re-calibrating.' % '; '.join(problems))

    # ---------------------------------------------------------------- names
    def resolve_names(self):
        t0 = time.time()
        ptrs = np.concatenate(self.ptr_name)
        uniq = np.unique(ptrs[ptrs != 0])
        ent = self.batch.fetch(uniq, 8)
        sptr = {e: int.from_bytes(b, 'little') for e, b in ent.items()}
        sbytes = self.batch.fetch(list(set(sptr.values())), 72)
        table = {}
        retry = []
        for e, sp in sptr.items():
            s = _parse_lenstr(sbytes.get(sp))
            if s is None:
                retry.append((e, sp))
            else:
                table[e] = s
        for e, sp in retry:                          # unusually long names
            hdr = self.proc.read_bytes(sp, 4)
            if hdr:
                n = min(int.from_bytes(hdr, 'little'), 512)
                b = self.proc.read_bytes(sp, 4 + n)
                s = _parse_lenstr(b)
                if s is not None:
                    table[e] = s
        first, last, common = ([table.get(int(p), '') if p else '' for p in col.tolist()] for col in self.ptr_name)
        self.names = [c if c else ('%s %s' % (f, l)).strip() for f, l, c in zip(first, last, common)]
        self.info['names_ms'] = int((time.time() - t0) * 1000)

        # nations (a few hundred distinct objects)
        t1 = time.time()
        nat_ptrs = np.unique(self.ptr_nation[self.ptr_nation != 0])
        objs = self.batch.fetch(nat_ptrs, 0x30)
        name_ptr = {p: int.from_bytes(b[L.NATION_NAME:L.NATION_NAME + 8], 'little') for p, b in objs.items()}
        nb = self.batch.fetch(list(set(name_ptr.values())), 72)
        self.nation_table = {}
        for p, sp in name_ptr.items():
            s = _parse_lenstr(nb.get(sp))
            self.nation_table[p] = s if s is not None else ''
        self.nations = [self.nation_table.get(int(p), '') for p in self.ptr_nation.tolist()]
        self.info['nations_ms'] = int((time.time() - t1) * 1000)

    # ------------------------------------------------------------- clubs
    def club_names(self, ptrs):
        """{club object pointer: short name}, cached across calls."""
        todo = sorted({int(p) for p in ptrs if int(p)} - set(self._club_names))
        if todo:
            cl = self.batch.fetch(todo, 0xD0)
            namep = {}
            for p, b in cl.items():
                namep[p] = (int.from_bytes(b[L.CLUB_NAME_FULL:L.CLUB_NAME_FULL + 8], 'little'),
                            int.from_bytes(b[L.CLUB_NAME_SHORT:L.CLUB_NAME_SHORT + 8], 'little'))
            sb = self.batch.fetch([x for pr in namep.values() for x in pr], 72)
            for p in todo:
                full, short = namep.get(p, (0, 0))
                self._club_names[p] = _parse_lenstr(sb.get(short)) or _parse_lenstr(sb.get(full)) or ''
        return {int(p): self._club_names.get(int(p), '') for p in ptrs if int(p)}

    def _chain_club(self, objs):
        """(club, owner) pointers behind each contract / loan agreement.

        club  = object -> holder (+0x10) -> club (+0x30)
        owner = the person the object points back at (+0x08), i.e. which record really owns it"""
        rows, ok = gather(self.proc, objs, L.HOLDER_PTR + 8)
        holder = np.where(ok, np.ascontiguousarray(rows[:, L.HOLDER_PTR:L.HOLDER_PTR + 8]).view('<u8').ravel(), 0)
        owner = np.where(ok, np.ascontiguousarray(rows[:, L.OWNER_PTR:L.OWNER_PTR + 8]).view('<u8').ravel(), 0)
        hrows, hok = gather(self.proc, holder.astype(np.uint64), L.HOLDER_CLUB + 8)
        club = np.where(hok, np.ascontiguousarray(hrows[:, L.HOLDER_CLUB:L.HOLDER_CLUB + 8]).view('<u8').ravel(), 0)
        return club.astype(np.uint64), owner.astype(np.uint64)

    def resolve_clubs(self):
        """Where every player is registered and where he plays right now.

        The game keeps two club references per player: the contract (who owns him) and, while a
        loan is running, a loan agreement (where he is). The club he plays for is the loan club
        if there is one, otherwise the contract club; no contract means no club (free agent).
        Both chains are plain pointer hops, so the whole database resolves in ~0.1 s."""
        t0 = time.time()
        self.contract_club_ptr, self.contract_owner = self._chain_club(self.ptr_contract)
        slot, ok = gather(self.proc, self.ptr_loan, L.LOAN_SLOT_AGREEMENT + 8)
        agreement = np.where(ok, np.ascontiguousarray(slot[:, L.LOAN_SLOT_AGREEMENT:L.LOAN_SLOT_AGREEMENT + 8]).view('<u8').ravel(), 0)
        self.loan_club_ptr, _ = self._chain_club(agreement.astype(np.uint64))
        self.club_ptr = np.where(self.loan_club_ptr != 0, self.loan_club_ptr, self.contract_club_ptr).astype(np.uint64)
        self.info['clubs_ms'] = int((time.time() - t0) * 1000)

    def resolve_duplicates(self):
        """Keep exactly one record per player ID.

        Retired players and unused slots are already excluded. Anything else that still shares an
        ID is a stale copy - pages left behind by a previously loaded save, a page that was being
        moved, ... - and must not be counted twice. The live copy is the one whose contract points
        back at it. Pages are also scored by how many of their contracts are live, which settles
        players with no contract (free agents), then the newest "last updated" stamp, then the
        most recently allocated copy."""
        idx = np.flatnonzero(self.valid)
        ids = self.ids[idx]
        order = np.argsort(ids, kind='stable')
        sid = ids[order]
        same = sid[1:] == sid[:-1]
        self.info['duplicates'] = 0
        if not same.any():
            return
        in_group = np.zeros(len(sid), dtype=bool)
        in_group[1:] |= same
        in_group[:-1] |= same
        members = idx[order][in_group]

        person = self.addrs.astype(np.uint64) + np.uint64(L.PRE)
        has_contract = self.ptr_contract != 0
        live = has_contract & (self.contract_owner == person)
        # pages = runs of records exactly one record apart in memory
        by_addr = np.argsort(self.addrs)
        starts = np.r_[0, np.flatnonzero(np.diff(self.addrs[by_addr]) != L.RECORD_SIZE) + 1]
        page = np.empty(self.n, dtype=np.int64)
        page[by_addr] = np.repeat(np.arange(len(starts)), np.diff(np.r_[starts, self.n]))
        npages = len(starts)
        v = self.valid
        health = (np.bincount(page[v & live], minlength=npages)
                  / np.maximum(np.bincount(page[v & has_contract], minlength=npages), 1))

        # best copy of each ID sorts last (np.lexsort: the last key is the primary one)
        o = np.lexsort((self.addrs[members], self.stamp[members], health[page[members]],
                        live[members].astype(np.int8), self.ids[members]))
        ms, sids = members[o], self.ids[members][o]
        best = np.r_[sids[1:] != sids[:-1], True]
        losers = ms[~best]
        self.valid[losers] = False
        self.info['duplicates'] = int(len(losers))

    def resolve_membership(self, home_override=None):
        """Who is really at the human manager's club right now.

        The human club is the one most flagged players currently play for (the flag itself is
        sticky and says nothing about *now*). If you have managed more than one club in a save,
        the old club's players are still flagged, so the best few candidates are kept in
        `home_candidates` and `home_override` (a club pointer from that list) can pick another.
        After that membership is purely the club the database says each player is at:
          current   - plays here and his contract is ours
          loan_in   - plays here on loan, contract belongs to another club
          loan_out  - contract is ours, currently on loan at another club
          gone      - was flagged, now belongs to another club or to nobody (sold, released,
                      turned-down youth-intake prospect, ...)"""
        self.squad_status[:] = ST_NONE
        self.home_club_ptr, self.home_club_name = 0, ''
        self.home_nation_ptr, self.home_nation_name = 0, ''
        self.home_candidates = []
        self.home_rep = 0
        self._permit = None
        self._interest = None
        self._injuries = None
        flag = self.my_squad & self.valid
        at_club = flag & (self.club_ptr != 0)
        if not at_club.any():                      # unemployed / brand new game: nothing to call "my squad"
            return
        vals, counts = np.unique(self.club_ptr[at_club], return_counts=True)
        top = [(int(vals[k]), int(counts[k])) for k in np.argsort(-counts)[:6]]
        # sold players keep the flag too, so a club only counts as a candidate if a real squad's
        # worth of flagged players is still there (i.e. you managed it)
        top = [t for t in top if t[1] >= max(10, 0.2 * top[0][1])]
        cnames = self.club_names([p for p, _ in top])
        self.home_candidates = [{'ptr': p, 'name': cnames.get(p, ''), 'flagged': c} for p, c in top]
        chosen = int(home_override) if home_override else 0
        home = np.uint64(chosen if chosen in {p for p, _ in top} else top[0][0])
        self.home_club_ptr = int(home)
        self.home_club_name = cnames.get(int(home), '')
        nb = self.proc.read_bytes(int(home) + L.CLUB_NATION, 8)
        self.home_nation_ptr = int.from_bytes(nb, 'little') if nb else 0
        self.home_nation_name = self.nation_table.get(self.home_nation_ptr, '')
        rb = self.proc.read_bytes(int(home) + L.CLUB_REPUTATION, 2)
        self.home_rep = int.from_bytes(rb, 'little') if rb else 0

        valid = self.valid
        loan_in = valid & (self.loan_club_ptr == home)
        loan_out = valid & (self.contract_club_ptr == home) & (self.loan_club_ptr != 0) & (self.loan_club_ptr != home)
        current = valid & (self.club_ptr == home) & ~loan_in
        gone = flag & ~(current | loan_in | loan_out)
        s = self.squad_status
        s[gone] = ST_GONE
        s[current] = ST_CURRENT
        s[loan_in] = ST_LOAN_IN
        s[loan_out] = ST_LOAN_OUT

    def set_home(self, club_ptr=None):
        """Treat another of the candidate clubs as 'mine' (None = automatic) and refresh the summary."""
        self.resolve_membership(club_ptr)
        self.summarize()

    def summarize(self):
        """The headline numbers the UI shows (club, squad size, loans, ...), kept in `info`."""
        counts = self.status_counts()
        i = self.info
        i['club'] = self.home_club_name
        i['club_ptr'] = self.home_club_ptr
        i['club_candidates'] = self.home_candidates
        i['club_nation'] = self.home_nation_name
        i['permit_rule'] = permits.describe(self.home_nation_name)
        rep = self.club_reputation()
        i['club_rep'] = rep
        i['interest_rule'] = interest_model.describe(rep)
        i['home_grown_ready'] = bool(self.home_grown_ready())
        i['squad'] = counts['current'] + counts['loan_in']
        i['loan_in'] = counts['loan_in']
        i['loaned_out'] = counts['loan_out']
        i['left'] = counts['moved']

    # ------------------------------------------------------ work permits
    def secondary_nations(self, k=4):
        """(n, k) nation pointers from each player's 'Secondary Nationalities' (0 = none).

        They are relation-list entries whose type bytes are 0x0809 and whose pointer is a nation.
        Read for the whole database on first use (~0.7 s) and cached for this scan."""
        if self._secondary is not None:
            return self._secondary
        n = self.n
        cont, cok = gather(self.proc, self.ptr_relations, 16)
        begin = np.ascontiguousarray(cont[:, :8]).view('<u8').ravel()
        end = np.ascontiguousarray(cont[:, 8:16]).view('<u8').ravel()
        span = end.astype(np.int64) - begin.astype(np.int64)
        cnt = np.where(cok & (span >= 16) & (span <= 400 * 16), span // 16, 0)
        begin = np.where(cnt > 0, begin, 0).astype(np.uint64)
        buf, _ = gather(self.proc, begin, MAX_REL_ENTRIES * 16)
        ent = buf.reshape(n, MAX_REL_ENTRIES, 16)
        in_range = np.arange(MAX_REL_ENTRIES)[None, :] < np.minimum(cnt, MAX_REL_ENTRIES)[:, None]
        t_hi, t_lo = L.REL_SECONDARY_NATIONALITY
        is_sec = in_range & (ent[:, :, 10] == t_hi) & (ent[:, :, 11] == t_lo)
        ptrs = np.ascontiguousarray(ent[:, :, :8]).view('<u8').reshape(n, MAX_REL_ENTRIES)
        rank = np.cumsum(is_sec, axis=1)
        out = np.zeros((n, k), dtype=np.uint64)
        for j in range(k):
            out[:, j] = (ptrs * (is_sec & (rank == j + 1))).sum(axis=1)
        self._secondary = out
        return out

    def permit_needed(self):
        """bool[n] - would the player need a work permit at the human club? (None if no club.)

        A nationality test (see permits.py): he is free when his nationality, or any secondary
        nationality, is one of the nations with free movement into the club's country."""
        if self._permit is not None:
            return self._permit
        free = permits.free_nations(self.home_nation_name)
        if not free:
            return None
        free_ptrs = np.array([p for p, nm in self.nation_table.items() if nm in free], dtype=np.uint64)
        is_free = np.isin(self.ptr_nation, free_ptrs) | np.isin(self.secondary_nations(), free_ptrs).any(axis=1)
        self._permit = ~is_free
        return self._permit

    # ------------------------------------------------------- player interest
    def stature(self):
        """(per-player stature of his club, {club pointer: stature}, his rank by CA in that club) - interest.py. Cached."""
        if self._stature is None:
            self._stature = interest_model.club_stature(self.club_ptr, self.ca, self.rep[:, 1], self.valid)
        return self._stature

    def club_reputation(self):
        """Reputation of the human club: the stored value, else estimated from its stature (0 = unknown)."""
        if not self.home_club_ptr:
            return 0
        if self.home_rep > 0:
            return int(self.home_rep)
        s = self.stature()[1].get(self.home_club_ptr)
        if s is None:
            return 0
        k, b = interest_model.REP_FROM_STATURE
        return int(min(10000, max(0, k * s + b)))

    def contract_months_left(self):
        """float[n]: months until each player's contract ends (NaN = no contract / unknown). Cached."""
        if self._months_left is not None:
            return self._months_left
        size = L.CONTRACT_EXPIRY + 4
        rows, ok = gather(self.proc, np.where(self.contract_club_ptr != 0, self.ptr_contract, 0).astype(np.uint64), size)
        day = _u16(rows, L.CONTRACT_EXPIRY).astype(np.int64)
        year = _u16(rows, L.CONTRACT_EXPIRY + 2).astype(np.int64)
        good = ok & (year >= 2000) & (year <= 2100) & (day >= 1) & (day <= 366)
        months = ((year - self.game_year) * 365 + (day - self.game_day)) / 30.44
        self._months_left = np.where(good, months, np.nan)
        return self._months_left

    def interest_levels(self):
        """(transfer, loan): int8[n] each - estimated interest in joining the human club on a permanent transfer
        and on a loan (interest.py: 3 interested, 2 persuadable, 1 doubtful, 0 not; loan -1 = impossible).
        None if there is no club to compare with."""
        if self._interest is not None:
            return self._interest
        my_rep = self.club_reputation()
        if not my_rep:
            return None
        per_player, by_club, rank = self.stature()
        my_stature = by_club.get(self.home_club_ptr)
        if my_stature is None:
            return None
        squad = self.squad_indices(include_loaned_out=False)
        self._interest = interest_model.classify(
            world_rep=self.rep[:, 2].astype(np.int64), stature=per_player, rank=rank, ca=self.ca, age=self.age,
            ambition=self.personality[:, L.PERSONALITY_ORDER.index('Ambition')].astype(np.int64),
            loyalty=self.personality[:, L.PERSONALITY_ORDER.index('Loyalty')].astype(np.int64),
            months_left=self.contract_months_left(), on_loan=self.loan_club_ptr != 0,
            same_nation=(self.ptr_nation == np.uint64(self.home_nation_ptr)) if self.home_nation_ptr else np.zeros(self.n, bool),
            my_rep=my_rep, my_stature=my_stature, my_cas=self.ca[squad])
        return self._interest

    # ------------------------------------------------------- home-grown status
    def home_grown_ready(self):
        """True once the career-history layout is known (layout.HISTORY_*), so home-grown rules can be read."""
        return L.HISTORY_PATH is not None and L.HISTORY_ENTRY_SIZE and L.HISTORY_ENTRY_YEAR is not None \
            and L.HISTORY_ENTRY_CLUB is not None

    def career_history(self):
        """(year, club, loan, count): (n, HISTORY_MAX_ENTRIES) arrays of each player's season entries plus how
        many he has; None until the layout is calibrated. Read for the whole database once per scan."""
        if self._history is not None or not self.home_grown_ready():
            return self._history
        n, k, size = self.n, L.HISTORY_MAX_ENTRIES, L.HISTORY_ENTRY_SIZE
        rec = self.addrs.astype(np.uint64)
        hdr = rec
        for hop in L.HISTORY_PATH:                     # follow the pointer chain to the vector header
            rows, ok = gather(self.proc, hdr + np.uint64(hop), 8)
            hdr = np.where(ok, np.ascontiguousarray(rows).view('<u8').ravel(), 0).astype(np.uint64)
        if not L.HISTORY_PATH:
            hdr = rec + np.uint64(L.HISTORY_HEADER)
        else:
            hdr = np.where(hdr != 0, hdr + np.uint64(L.HISTORY_HEADER), 0).astype(np.uint64)
        rows, ok = gather(self.proc, hdr, 16)
        begin = np.ascontiguousarray(rows[:, :8]).view('<u8').ravel()
        end = np.ascontiguousarray(rows[:, 8:]).view('<u8').ravel()
        span = end.astype(np.int64) - begin.astype(np.int64)
        count = np.where(ok & (span > 0) & (span % size == 0), np.minimum(span // size, k), 0)
        buf, _ = gather(self.proc, np.where(count > 0, begin, 0).astype(np.uint64), k * size)
        ent = buf.reshape(n, k, size)
        live = np.arange(k)[None, :] < count[:, None]
        y = L.HISTORY_ENTRY_YEAR
        year = np.where(live, ent[:, :, y].astype(np.int32) | (ent[:, :, y + 1].astype(np.int32) << 8), 0)
        c = L.HISTORY_ENTRY_CLUB
        club = np.where(live, np.ascontiguousarray(ent[:, :, c:c + 8]).view('<u8').reshape(n, k), 0).astype(np.uint64)
        loan = (ent[:, :, L.HISTORY_ENTRY_LOAN] != 0) & live if L.HISTORY_ENTRY_LOAN is not None else np.zeros((n, k), bool)
        self._history = (year, club, loan, count)
        return self._history

    def club_nations(self, ptrs):
        """{club object pointer: nation name of the association it plays under}, cached."""
        todo = sorted({int(p) for p in ptrs if int(p)} - set(self._club_nation))
        if todo:
            got = self.batch.fetch(todo, L.CLUB_NATION + 8)
            for p in todo:
                b = got.get(p)
                nat = int.from_bytes(b[L.CLUB_NATION:L.CLUB_NATION + 8], 'little') if b else 0
                self._club_nation[p] = self.nation_table.get(nat, '')
        return {int(p): self._club_nation.get(int(p), '') for p in ptrs if int(p)}

    def home_grown(self, rule, nation=None):
        """bool[n]: does each player meet a home-grown rule (HOME_GROWN_RULES), e.g. ('nation15', 'Finland') =
        registered with clubs in Finland for at least 3 seasons between his 15th and 21st birthdays? Club rules
        are about the human club (a loan spell elsewhere doesn't count for it). None if it can't be read."""
        spec = HOME_GROWN_RULES.get(rule)
        hist = self.career_history()
        if spec is None or hist is None:
            return None
        scope, lo, hi, seasons = spec
        year, club, loan, _count = hist
        if scope == 'club':
            if not self.home_club_ptr:
                return None
            hit = (club == np.uint64(self.home_club_ptr)) & ~loan
        else:
            if not nation:
                return None
            names = self.club_nations(np.unique(club[club != 0]).tolist())
            want = nation.strip().lower()
            ptrs = np.array([p for p, nm in names.items() if nm.lower() == want], dtype=np.uint64)
            hit = np.isin(club, ptrs)
        age = year - self.dob_year[:, None]                 # his age in the year the season started
        hit &= (year > 0) & (age >= lo) & (age < hi)
        # distinct qualifying seasons (two spells in one season count once)
        yrs = np.where(hit, year, 0)
        yrs.sort(axis=1)
        distinct = ((yrs[:, 1:] != yrs[:, :-1]) & (yrs[:, 1:] > 0)).sum(axis=1) + (yrs[:, 0] > 0)
        return distinct >= seasons

    # ------------------------------------------------------------ injuries
    def injuries(self, report=None):
        """{player index: injury} for the human club's first-team players who are injured right now.

        The game keeps a first-team injury in one of two places (see layout.INJ_*): a list inside its
        medical department object (the longer-running ones, which is what the Medical Centre shows) and,
        for roughly the first week, a separate object per injury. One pass over the process finds both
        (~2 s, cached per scan); the injury's name is read from its type ("A double hernia").

        The department list is found from the entries that carry its fixed marker values, and then read
        in full: an entry whose marker differs (a filled-in date, say) is still picked up as long as it
        sits in the same list. U21/U18 injuries are not stored in either place, so those players read as
        fit. Pass a dict as `report` to get what was found, for checking against the Medical Centre."""
        if self._injuries is not None and report is None:
            return self._injuries
        out, how = {}, {}
        squad = self.squad_indices(include_loaned_out=False)
        rep = report if report is not None else {}
        rep.update({'squad': int(len(squad)), 'anchors': 0, 'departments': [], 'list_entries': [], 'cases': []})
        if len(squad):
            persons = self.addrs[squad].astype(np.uint64) + np.uint64(L.PRE)
            who = {int(p): int(i) for p, i in zip(persons, squad)}
            entries, cases = self._injury_scan(persons)
            rep['anchors'] = len(entries)
            # the department lists those entries belong to: only a vector holding a real current entry counts
            lists, vectors = {}, {}                          # (begin, end) -> department; department -> its vectors
            for addr, person, itype, owner in entries:
                if owner not in vectors:
                    vectors[owner] = self._entry_vectors(owner)
                for b, e in vectors[owner]:
                    if b <= addr < e and (addr - b) % L.INJ_ENTRY_SIZE == 0:
                        lists[(b, e)] = owner
            for (b, e), owner in sorted(lists.items()):
                raw = self.proc.read_bytes(b, e - b)
                if not raw or len(raw) != e - b:
                    continue
                rep['departments'].append({'department': hex(owner), 'list': hex(b), 'entries': (e - b) // L.INJ_ENTRY_SIZE})
                for off in range(0, e - b, L.INJ_ENTRY_SIZE):
                    ent = raw[off:off + L.INJ_ENTRY_SIZE]
                    person = int.from_bytes(ent[L.INJ_ENTRY_PERSON:L.INJ_ENTRY_PERSON + 8], 'little')
                    itype = int.from_bytes(ent[L.INJ_ENTRY_TYPE:L.INJ_ENTRY_TYPE + 8], 'little')
                    state = int.from_bytes(ent[L.INJ_ENTRY_STATE:L.INJ_ENTRY_STATE + 4], 'little')
                    i = who.get(person)
                    name = self._injury_name(itype) if i is not None else ''
                    if report is not None:
                        rep['list_entries'].append({'player': self.names[i] if i is not None else None, 'injury': name,
                                                    'state': hex(state), 'counted': bool(i is not None and name and state != 0xFFFFFFFF)})
                    if i is None or i in out or state == 0xFFFFFFFF or not name:
                        continue                            # not one of ours, over, or not an injury entry after all
                    out[i], how[i] = name, 'list'
            today = self.game_date
            for person, itype, date, days in cases:
                i = who.get(person)
                if i is None or today is None:
                    continue
                start = _doy_to_date(date & 0x1FF, date >> 16)
                current = start is not None and start <= today < start + datetime.timedelta(days=days)
                name = self._injury_name(itype)
                if report is not None:
                    rep['cases'].append({'player': self.names[i], 'injury': name, 'start': str(start), 'days': days,
                                         'current': bool(current)})
                if i in out or not current or not name:
                    continue                                # already over (its object stays in memory) or not started
                out[i], how[i] = name, 'recent'
        rep['injured'] = [{'player': self.names[i], 'injury': nm, 'from': how[i]} for i, nm in out.items()]
        self._injuries = out
        return out

    def _injury_scan(self, persons):
        """One pass over the process for both kinds of first-team injury record whose player is one of
        `persons`. Returns (entries, cases): entries = [(address, person, type, department)] from the
        department's list, cases = [(person, type, start date word, planned days)] from the per-injury
        objects. The fixed marker values are tested first, so most of memory is rejected cheaply.

        A list entry is anchored by the u32 0x4FFFF at +0x30 with a date followed by 0xFFFFFFFF just
        before it (+0x28; normally the empty date 01/01/1900, but any plausible date is accepted)."""
        marker2 = np.uint64(L.INJ_ENTRY_MARKER2_VALUE)
        m, st, ow = L.INJ_ENTRY_MARKER // 8, L.INJ_ENTRY_STATE // 8, L.INJ_ENTRY_OWNER // 8
        again, cdate, cdays, cwho = (L.INJ_CASE_TYPE_AGAIN // 8, L.INJ_CASE_DATE // 8,
                                     L.INJ_CASE_DAYS // 8, L.INJ_CASE_PERSON // 8)
        over = np.uint64(0xFFFFFFFF)
        tasks = []
        for base, size, _prot, _t in self.proc.regions(types=(MEM_PRIVATE, MEM_MAPPED), writable_only=True, min_size=64 * 1024):
            off = 0
            while off < size:
                tasks.append((base + off, min(CHUNK + 0x100, size - off)))
                off += CHUNK

        def scan_chunk(task):
            addr, n = task
            arr = self.proc.read(addr, n)
            if arr is None or len(arr) < 0x100:
                return [], []
            a64 = arr[:len(arr) // 8 * 8].view(np.uint64)
            entries, cases = [], []
            lim = len(a64) - ow - 1
            k = np.flatnonzero(a64[m + 1:lim + m + 1] == marker2) + m      # k = the date slot (+0x28)
            if k.size:
                d = a64[k]
                day = d & np.uint64(0xFFFF)
                year = (d >> np.uint64(16)) & np.uint64(0xFFFF)
                k = k[((d >> np.uint64(32)) == over) & (day >= 1) & (day <= 366) & (year >= 1900) & (year <= 2100)]
                e = k - m
                keep = np.isin(a64[e], persons) & ((a64[e + st] & over) != over)
                entries = [(addr + int(x) * 8, int(a64[x]), int(a64[x + 1]), int(a64[x + ow])) for x in e[keep]]
            n2 = len(a64) - cwho - 1
            c = np.flatnonzero((a64[cdate:cdate + n2] >> np.uint64(32)) == over)      # the date word ends in 0xFFFFFFFF
            if c.size:
                c = c[(a64[c] == a64[c + again]) & (a64[c] > np.uint64(0x10000)) & (a64[c + 1] == 0)]
                c = c[np.isin(a64[c + cwho], persons)] if c.size else c
                cases = [(int(a64[x + cwho]), int(a64[x]), int(a64[x + cdate]) & 0xFFFFFFFF, int(a64[x + cdays]) & 0xFFFF) for x in c]
            return entries, cases

        entries, cases = {}, set()
        with ThreadPoolExecutor(max_workers=min(8, (os.cpu_count() or 4))) as ex:
            for ents, css in ex.map(scan_chunk, tasks):
                for r in ents:
                    entries[r[0]] = r                       # the overlap between chunks reads some entries twice
                cases.update(css)
        return list(entries.values()), list(cases)

    def _entry_vectors(self, owner):
        """(begin, end) of each vector of injury entries held by a department object: three consecutive
        pointers begin <= end <= capacity whose length is a whole number of entries."""
        buf = self.proc.read_bytes(owner, 0x800)
        if not buf or len(buf) < 0x20:
            return []
        w = np.frombuffer(buf[:len(buf) // 8 * 8], dtype='<u8').astype(np.int64)
        out = []
        for k in range(len(w) - 2):
            b, e, c = int(w[k]), int(w[k + 1]), int(w[k + 2])
            if b > 0x10000 and b < e <= c and (e - b) % L.INJ_ENTRY_SIZE == 0 and e - b <= 0x10000:
                out.append((b, e))
        return out

    def _injury_name(self, ptr):
        """'A double hernia' from an injury type object (+0x20 -> [u32 length][utf-8])."""
        raw = self.proc.read_bytes(ptr + L.INJ_TYPE_NAME, 8)
        sp = int.from_bytes(raw, 'little') if raw else 0
        if sp < 0x10000:
            return ''
        text = _parse_lenstr(self.proc.read_bytes(sp, 0x80))
        if not text or not 3 <= len(text) <= 80 or not text.isprintable():
            return ''
        return text[0].upper() + text[1:]

    # ------------------------------------------------- per-subset enrichment
    def enrich(self, idx):
        """Fill club / contract details for the given player indices (cached)."""
        idx = [int(i) for i in idx]
        need = [i for i in idx if i not in self._club_cache]
        if not need:
            return
        cobj = self.batch.fetch([int(self.ptr_contract[i]) for i in need], 0x50)
        names = self.club_names([int(p) for i in need for p in (self.club_ptr[i], self.contract_club_ptr[i]) if p])
        for i in need:
            wage, expiry = 0, ''
            co = cobj.get(int(self.ptr_contract[i]))
            if co:
                wage = int.from_bytes(co[L.CONTRACT_WAGE:L.CONTRACT_WAGE + 4], 'little')
                ed = int.from_bytes(co[L.CONTRACT_EXPIRY:L.CONTRACT_EXPIRY + 2], 'little')
                ey = int.from_bytes(co[L.CONTRACT_EXPIRY + 2:L.CONTRACT_EXPIRY + 4], 'little')
                expiry = _fmt_date(ed, ey)
                if wage > 5_000_000:
                    wage = 0
            self._club_cache[i] = (names.get(int(self.club_ptr[i]), ''), wage, expiry)
            if self.loan_club_ptr[i]:
                self._parent[i] = names.get(int(self.contract_club_ptr[i]), '')

    # ------------------------------------------------------------- queries
    def position_string(self, i):
        r = self.ratings[i]
        listed = [L.POSITION_CODES[k] for k in range(15) if r[k] >= L.POSITION_LISTED_AT]
        if not listed:
            listed = [L.POSITION_CODES[int(np.argmax(r))]]
        groups = {g: set() for g in ('D', 'WB', 'DM', 'M', 'AM', 'ST')}
        gk = 'GK' in listed
        for c in listed:
            if c == 'GK':
                continue
            if c == 'SW':
                groups['D'].add('C')
            elif c in ('DL', 'DC', 'DR'):
                groups['D'].add(c[1])
            elif c in ('WBL', 'WBR'):
                groups['WB'].add(c[2])
            elif c == 'DM':
                groups['DM'].add('')
            elif c in ('ML', 'MC', 'MR'):
                groups['M'].add(c[1])
            elif c in ('AML', 'AMC', 'AMR'):
                groups['AM'].add(c[2])
            elif c == 'STC':
                groups['ST'].add('C')
        mergeable = ('D', 'WB', 'M', 'AM')
        segs = []
        for g in ('D', 'WB', 'DM', 'M', 'AM', 'ST'):
            s = frozenset(groups[g])
            if not s:
                continue
            if g in mergeable and segs and segs[-1][0][-1] in mergeable and segs[-1][1] == s:
                segs[-1][0].append(g)
            else:
                segs.append(([g], s))
        out = ['GK'] if gk else []
        for gs, s in segs:
            label = '/'.join(gs)
            out.append(label if gs == ['DM'] else '%s (%s)' % (label, ''.join(x for x in 'RLC' if x in s)))
        return ', '.join(out)

    @staticmethod
    def foot_band(raw):
        for lo, name in L.FOOT_BANDS:
            if raw >= lo:
                return name
        return 'Very Weak'

    def player(self, i, with_attrs=True):
        """One player as a JSON-ready dict (call enrich() first for club/wage/expiry)."""
        club, wage, expiry = self._club_cache.get(i, ('', 0, ''))
        a = self.attrs[i]
        status = int(self.squad_status[i])
        parent = self._parent.get(i, '')
        d = {
            'id': int(self.ids[i]),
            'name': self.names[i],
            'age': int(self.age[i]),
            'dob': _fmt_date(self.dob_day[i], self.dob_year[i]),
            'pos': self.position_string(i),
            'nation': self.nations[i],
            'club': club,
            'ca': int(self.ca[i]),
            'pa': int(self.pa[i]),
            'value': int(self.value[i]) if self.value[i] != 0xFFFFFFFF else 0,
            'wage': int(wage),
            'expires': expiry,
            'height': int(self.height[i]),
            'rep': [int(x) for x in self.rep[i]],
            'status': ST_LABELS[status],
            'loanFrom': parent if status == ST_LOAN_IN else '',     # a loan-in is another club's player
            'parent': parent,                                        # contract holder while on loan anywhere
            'needsPermit': None if self._permit is None else bool(self._permit[i]),
            'interest': None if self._interest is None else int(self._interest[0][i]),       # on a transfer
            'loanInterest': None if self._interest is None else int(self._interest[1][i]),   # on a loan (-1 = impossible)
            'ratings': [int(x) for x in self.ratings[i]],
        }
        if self._injuries is not None and status in (ST_CURRENT, ST_LOAN_IN):     # only these are in the first-team list
            d['injured'] = i in self._injuries
            d['injury'] = self._injuries.get(i, '')
        if with_attrs:
            d['attrs'] = [int(x) for x in a]
            d['pers'] = [int(x) for x in self.personality[i]]
        return d

    def squad_indices(self, include_loaned_out=False):
        """Players who are at the human manager's club right now (plus, optionally, our players
        who are out on loan). Anyone who has left is excluded."""
        keep = [ST_CURRENT, ST_LOAN_IN] + ([ST_LOAN_OUT] if include_loaned_out else [])
        return np.flatnonzero(np.isin(self.squad_status, keep) & self.valid)

    def status_counts(self):
        s = self.squad_status[self.valid]
        out = {ST_LABELS[c]: int((s == c).sum()) for c in (ST_CURRENT, ST_LOAN_IN, ST_LOAN_OUT, ST_GONE)}
        # of the flagged players who are no longer here, those who now belong to another club
        out['moved'] = int(((self.squad_status == ST_GONE) & self.valid & (self.club_ptr != 0)).sum())
        return out

    def query(self, min_age=None, max_age=None, min_pa=None, min_ca=None, exclude_squad=True,
              position=None, nation=None, text=None, limit=2000,
              min_value=None, max_value=None, exclude_permit=False, interest_mode=None, interest_level=None,
              home_grown=None, sort='pa'):
        """Indices of the best matching players, ranked by potential then current ability
        (sort='ca': by current ability then potential).

        min_value / max_value are transfer values in the game's base currency;
        exclude_permit drops players who would need a work permit at the human club;
        interest_mode / interest_level filter on the estimated interest in joining it, like the game's
        Player Interest filter: 'tl' (a transfer or a loan), 'transfer', 'loan' at interest_level or keener
        (3 = interested, 2 = persuadable or better, 1 = doubtful or better), or 'none' (neither);
        home_grown = (rule, nation name[, negate]) keeps players who meet (or, negated, don't meet) that
        home-grown rule (see home_grown()); ignored while the career history can't be read."""
        m = self.valid.copy()
        if interest_mode in INTEREST_MODES:
            lv = self.interest_levels()
            if lv is not None:
                t, ln = lv
                need = max(1, min(3, int(interest_level or 1)))
                if interest_mode == 'tl':
                    m &= np.maximum(t, ln) >= need
                elif interest_mode == 'transfer':
                    m &= t >= need
                elif interest_mode == 'loan':
                    m &= ln >= need
                else:                                   # 'none': wouldn't consider either
                    m &= np.maximum(t, ln) < interest_model.DOUBTFUL
        if home_grown:
            rule, hg_nation, negate = (tuple(home_grown) + (False,))[:3]
            ok = self.home_grown(rule, hg_nation)
            if ok is not None:
                m &= ~ok if negate else ok
        if min_value is not None or max_value is not None:
            val = np.where(self.value == 0xFFFFFFFF, 0, self.value).astype(np.int64)    # 0xFFFFFFFF = unknown
            if min_value is not None:
                m &= val >= int(min_value)
            if max_value is not None:
                m &= val <= int(max_value)
        if exclude_permit:
            need = self.permit_needed()
            if need is not None:
                m &= ~need
        if exclude_squad:       # our own players, loan-ins and loan-outs; sold players are fair game again
            m &= ~np.isin(self.squad_status, (ST_CURRENT, ST_LOAN_IN, ST_LOAN_OUT))
        if min_age is not None:
            m &= self.age >= min_age
        if max_age is not None:
            m &= self.age <= max_age
        if min_pa is not None:
            m &= self.pa >= min_pa
        if min_ca is not None:
            m &= self.ca >= min_ca
        if position:
            pc = {'GK': [0], 'DL': [2], 'DC': [3], 'DR': [4], 'DM': [5], 'ML': [6], 'MC': [7], 'MR': [8],
                  'AML': [9], 'AMC': [10], 'AMR': [11], 'ST': [12], 'WBL': [13], 'WBR': [14]}.get(position)
            if pc:
                m &= self.ratings[:, pc[0]] >= L.POSITION_LISTED_AT
        if nation:
            nl = nation.lower()
            nat_mask = np.array([nl in (x or '').lower() for x in self.nations], dtype=bool)
            m &= nat_mask
        if text:
            tl = text.lower()
            m &= np.array([tl in x.lower() for x in self.names], dtype=bool)
        idx = np.flatnonzero(m)
        ca, pa = self.ca[idx].astype(np.int64), self.pa[idx].astype(np.int64)
        order = np.lexsort((-pa, -ca)) if sort == 'ca' else np.lexsort((-ca, -pa))      # last key is the primary one
        return idx[order[:limit]] if len(idx) > limit else idx[order]


class FM26Reader:
    """Reads the running Football Manager's player database. FM26 and FM27 share one layout, so
    the same reader handles both (the newest game that is running and has a save loaded wins)."""

    def __init__(self):
        self.proc = None
        self.pid = None
        self.snapshot = None

    # ---------------------------------------------------------- connection
    @staticmethod
    def games():
        """Running Football Manager processes, newest game first: [(pid, 'FM27', exe path)]."""
        found = []
        for pid in find_pids(GAME_EXE):
            path = process_image_path(pid)
            m = re.search(r'Football Manager (\d+)', path, re.I)       # the Steam install folder
            found.append((int(m.group(1)) if m else 0, pid, path))
        found.sort(key=lambda t: (-t[0], t[1]))
        return [(pid, 'FM%d' % ver if ver else 'FM', path) for ver, pid, path in found]

    def find_game(self):
        g = self.games()
        return g[0][0] if g else None

    def game_label(self):
        g = self.games()
        return g[0][1] if g else ''

    def connect(self, pid=None):
        if pid is None:
            pid = self.find_game()
        if pid is None:
            raise FMNotRunning('Football Manager (fm.exe) is not running.')
        if self.proc is None or self.pid != pid:
            if self.proc:
                self.proc.close()
            self.proc = Process(pid)
            self.pid = pid
        return self.proc

    def build_id(self):
        try:
            mods = self.proc.modules()
            fm = mods.get(GAME_EXE)
            # modBaseAddr isn't a file path; use the engine DLL size as a cheap fingerprint
            eng = mods.get(ENGINE_DLL)
            return '%s-%s' % (fm[1] if fm else '?', eng[1] if eng else '?')
        except Exception:
            return '?'

    # --------------------------------------------------------------- scan
    def scan(self, progress=None):
        games = self.games()
        if not games:
            raise FMNotRunning('Football Manager (fm.exe) is not running.')
        first_error = None
        for pid, label, _path in games:            # newest game first; skip one that has no save loaded
            try:
                snap = self._scan_stable(self.connect(pid))
            except (LayoutError, OSError) as e:
                first_error = first_error or e
                continue
            snap.info['game'] = label
            self.snapshot = snap
            return snap
        raise first_error

    def _scan_stable(self, proc, attempts=3):
        """One scan, retried briefly when it catches the game in the middle of something (a save
        still loading, a page being moved) or comes back with far fewer players than last time.
        Whatever the game is doing - menus, matches, saving, day processing - the database pages
        stay in memory, so a second look a moment later normally succeeds."""
        prev = 0
        if self.snapshot is not None and self.snapshot.info.get('pid') == proc.pid:
            prev = int(self.snapshot.valid.sum())
        best, error = None, None
        for k in range(attempts):
            try:
                snap = self._scan(proc)
            except LayoutError as e:
                error = e
                if 'No player records' in str(e) and k >= 1:
                    break                           # nothing loaded: don't keep hammering the game
                time.sleep(1.5)
                continue
            if best is None or snap.info['players'] > best.info['players']:
                best = snap
            if not prev or best.info['players'] >= 0.97 * prev:
                break
            time.sleep(0.7)                         # lost a chunk of the database: look again
        if best is None:
            raise error
        return best

    def _scan(self, proc):
        t0 = time.time()
        eng = proc.modules().get(ENGINE_DLL)
        lo, hi = (eng[0], eng[0] + eng[1]) if eng else (0x7FF000000000, 0x800000000000)

        regions = proc.regions(types=(MEM_PRIVATE, MEM_MAPPED), writable_only=True, min_size=256 * 1024)
        tasks = []
        for base, size, _prot, _t in regions:
            off = 0
            while off < size:
                n = min(CHUNK + OVERLAP, size - off)
                tasks.append((base + off, n))
                off += CHUNK
        total_bytes = sum(n for _, n in tasks)

        def scan_chunk(task):
            addr, n = task
            arr = proc.read(addr, n)
            if arr is None or len(arr) < (L.STRIDE_QWORDS + 8) * 8:
                return None
            n8 = len(arr) // 8
            raw = arr[:n8 * 8]
            a64 = raw.view(np.uint64)
            a, b = a64[:-L.STRIDE_QWORDS], a64[L.STRIDE_QWORDS:]
            # the same engine vtable pointer repeating exactly one record apart
            cand = np.flatnonzero((a == b) & (a >= lo) & (a < hi))
            if not cand.size:
                return None
            u32 = raw.view(np.uint32)
            ids = u32[2 * cand + 3]
            keep = ids != 0
            cand, ids = cand[keep], ids[keep]
            if not cand.size:
                return None
            return addr + cand.astype(np.int64) * 8, a[cand], ids

        with ThreadPoolExecutor(max_workers=min(8, (os.cpu_count() or 4))) as ex:
            results = [r for r in ex.map(scan_chunk, tasks) if r is not None]
        t_scan = time.time()
        if not results:
            raise LayoutError('No player records found - is a save loaded (not just the main menu)?')

        addr = np.concatenate([r[0] for r in results])
        vts = np.concatenate([r[1] for r in results])
        cids = np.concatenate([r[2] for r in results])
        addr, ui = np.unique(addr, return_index=True)
        vts, cids = vts[ui], cids[ui]
        # Several vtables repeat once per record; the person one is the one whose
        # "ID" slot (+0xC) is unique per record (the others point at attribute bytes).
        vals, counts = np.unique(vts, return_counts=True)
        best, best_score = None, -1.0
        for v, c in zip(vals.tolist(), counts.tolist()):
            if c < 1000:
                continue
            ids_v = cids[vts == v]
            score = (len(np.unique(ids_v)) / len(ids_v)) * c
            if score > best_score:
                best, best_score = v, score
        if best is None:
            raise LayoutError('No player records found - is a save loaded (not just the main menu)?')
        vt = np.uint64(best)
        addr = addr[vts == vt]

        # group into runs spaced exactly one record apart; add the final record of each run
        d = np.diff(addr)
        starts = np.r_[0, np.flatnonzero(d != L.RECORD_SIZE) + 1]
        ends = np.r_[starts[1:], len(addr)]
        runs = []
        for s, e in zip(starts, ends):
            first, last = int(addr[s]), int(addr[e - 1])
            hdr = proc.read_bytes(last + L.RECORD_SIZE, 0x14)
            extra = 1 if (hdr and int.from_bytes(hdr[:8], 'little') == int(vt)
                          and int.from_bytes(hdr[0xC:0x10], 'little') != 0) else 0
            runs.append((first, int(e - s) + extra))
        total = sum(c for _, c in runs)

        N = np.empty((total, L.RECORD_SIZE), dtype=np.uint8)
        bases = np.empty(total, dtype=np.int64)
        offs, o = [], 0
        for first, c in runs:
            offs.append(o)
            o += c

        def read_run(item):
            (first, c), o0 = item
            start = first - L.PRE
            buf = proc.read_exact(start, c * L.RECORD_SIZE)
            if buf is None:
                return False
            N[o0:o0 + c] = buf.reshape(c, L.RECORD_SIZE)
            bases[o0:o0 + c] = start + np.arange(c, dtype=np.int64) * L.RECORD_SIZE
            return True

        with ThreadPoolExecutor(max_workers=8) as ex:
            ok = list(ex.map(read_run, zip(runs, offs)))
        if not all(ok):
            keep = np.zeros(total, dtype=bool)
            for (first, c), o0, good in zip(runs, offs, ok):
                if good:
                    keep[o0:o0 + c] = True
            N, bases = N[keep], bases[keep]
        t_read = time.time()

        info = {
            'pid': proc.pid, 'build': self.build_id(), 'regions': len(regions),
            'scanned_mb': int(total_bytes / 1048576), 'pages': len(runs),
            'scan_ms': int((t_scan - t0) * 1000), 'read_ms': int((t_read - t_scan) * 1000),
        }
        snap = Snapshot(proc, N, bases, info)
        snap.validate()
        with ThreadPoolExecutor(max_workers=2) as ex:      # names and clubs are independent reads
            for f in [ex.submit(snap.resolve_names), ex.submit(snap.resolve_clubs)]:
                f.result()
        snap.resolve_duplicates()
        if int(snap.valid.sum()) < 1000:
            raise LayoutError('Only %d usable player records found - is a save fully loaded?' % int(snap.valid.sum()))
        snap.resolve_membership()
        info['total_ms'] = int((time.time() - t0) * 1000)
        info['players'] = int(snap.valid.sum())
        info['retired'] = snap.retired
        info['game_date'] = snap.game_date.strftime('%d/%m/%Y') if snap.game_date else ''
        snap.summarize()
        return snap
