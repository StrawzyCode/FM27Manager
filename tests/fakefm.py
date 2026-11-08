"""A synthetic Football Manager process for testing FM27 Plus without the game (any OS).

Builds a fake address space with the exact layout fm26mem expects (player record pages, names,
nations, clubs, contracts, loans, an injury department list, recent-injury objects and - when the
history layout is patched in - career histories) and installs a stub `fm26mem.winmem` so the real
reader and server run against it.
"""
import datetime
import os
import random
import struct
import sys
import types

import numpy as np

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE_BASE, ENGINE_SIZE = 0x7FF600000000, 0x100000
VT_PLAYER, VT_PERSON = ENGINE_BASE + 0x1000, ENGINE_BASE + 0x2000
GAME_DATE = datetime.date(2026, 7, 15)
HIST_SLOT = 0x2A8                    # where the test puts the career-history header pointer
RECORD_BLOCK = 0x60000000            # the player records' own memory block ...
RECORD_BLOCK_SHORT = 0x50            # ... which ends this many bytes before the last record's window (as in FM27)


class Mem:
    def __init__(self):
        self.regions = []

    def add(self, base, size):
        arr = np.zeros(size, dtype=np.uint8)
        self.regions.append((base, arr))
        return arr

    def read(self, addr, size):
        """Like ReadProcessMemory: a read running off the end of a region comes back short."""
        for base, arr in self.regions:
            if base <= addr < base + len(arr):
                off = addr - base
                return arr[off:off + size].copy()
        return None

    def write(self, addr, b):
        for base, arr in self.regions:
            if base <= addr and addr + len(b) <= base + len(arr):
                arr[addr - base:addr - base + len(b)] = np.frombuffer(b, dtype=np.uint8)
                return
        raise AssertionError('write outside the fake memory at %#x' % addr)


class Heap:
    def __init__(self, mem, base, size):
        self.mem = mem
        self.arr = mem.add(base, size)
        self.base = base
        self.top = base + 0x1000

    def alloc(self, size, align=16):
        self.top = (self.top + align - 1) // align * align
        a = self.top
        self.top += size
        assert self.top < self.base + len(self.arr), 'heap full'
        return a

    def w(self, addr, fmt, *vals):
        self.wb(addr, struct.pack('<' + fmt, *vals))

    def wb(self, addr, b):
        self.mem.write(addr, b)          # any region, so the player records can live in a block of their own

    def lenstr(self, s):
        b = s.encode('utf-8')
        a = self.alloc(4 + len(b) + 8)
        self.w(a, 'I', len(b))
        self.wb(a + 4, b)
        return a

    def name_entry(self, s):
        e = self.alloc(16)
        self.w(e, 'Q', self.lenstr(s))
        return e


def doy(d):
    return d.timetuple().tm_yday


class World:
    """Everything the tests want to know about the fake save."""


def build(seed=7):
    rnd = random.Random(seed)
    mem = Mem()
    heap = Heap(mem, 0x20000000, 48 * 1024 * 1024)
    w = World()
    w.mem = mem

    # nations
    nat = {}
    for k, name in enumerate(['Finland', 'Sweden', 'England', 'Brazil', 'Estonia', 'Norway', 'Ghana']):
        o = heap.alloc(0x30)
        heap.w(o + 8, 'I', 100 + k)
        heap.w(o + 0x20, 'Q', heap.lenstr(name))
        nat[name] = o
    w.nat = nat

    # clubs: (name, nation, stored reputation (0 = not stored), level used to draw its players)
    club_specs = [
        ('KäPa', 'Finland', 2500, 2500), ('HJK', 'Finland', 4500, 4500), ('FC Inter', 'Finland', 3800, 3800),
        ('Ilves', 'Finland', 3000, 3000), ('PK-35', 'Finland', 1500, 1500), ('KuPS', 'Finland', 0, 4000),
        ('Malmö', 'Sweden', 5200, 5200), ('AIK', 'Sweden', 4800, 4800), ('Arsenal', 'England', 9000, 9000),
        ('Brentford', 'England', 7000, 7000), ('Flora', 'Estonia', 2800, 2800), ('Levadia', 'Estonia', 2400, 2400),
        ('Bodø/Glimt', 'Norway', 0, 5600), ('Palmeiras', 'Brazil', 7800, 7800), ('Hearts of Oak', 'Ghana', 2000, 2000),
        ('Honka', 'Finland', 2200, 2200), ('SJK', 'Finland', 3300, 3300), ('VPS', 'Finland', 2600, 2600),
        ('Degerfors', 'Sweden', 3500, 3500), ('Tromsø', 'Norway', 4100, 4100), ('Nõmme Kalju', 'Estonia', 2300, 2300),
        ('Fulham', 'England', 7150, 7150), ('Santos', 'Brazil', 6500, 6500), ('TPS', 'Finland', 1900, 1900),
    ]
    clubs = {}
    for name, nation, rep, level in club_specs:
        c = heap.alloc(0x200)
        heap.w(c + 8, 'I', 5000 + len(clubs))
        heap.w(c + 0xC0, 'Q', heap.lenstr(name + ' FC'))
        heap.w(c + 0xC8, 'Q', heap.lenstr(name))
        heap.w(c + 0xD8, 'Q', nat[nation])
        heap.w(c + 0x168, 'H', rep)
        holder = heap.alloc(0x40)
        heap.w(holder + 0x30, 'Q', c)
        clubs[name] = {'ptr': c, 'holder': holder, 'nation': nation, 'level': level}
    w.clubs = clubs

    # records: 3 pages of 1024, back to back in a memory block of their own - the way an FM27 save can hold
    # most of its database (78k players in one run). As in the game, the block ends a little before the last
    # record's 968-byte window does, so a read of the whole run comes back short.
    n = 3 * 1024
    mem.add(RECORD_BLOCK, n * 968 - RECORD_BLOCK_SHORT)
    recs = [RECORD_BLOCK + k * 968 for k in range(n)]
    w.recs = recs
    w.players = []
    names_first = ['Aleksi', 'Eetu', 'Joona', 'Oskari', 'Lauri', 'Niko', 'Johan', 'Erik', 'Oliver', 'Kofi',
                   'Lucas', 'Mateus', 'Kaspar', 'Sander', 'Mikkel', 'Harry', 'Tom', 'Jamie', 'Kwame', 'Ville']
    names_last = ['Virtanen', 'Korhonen', 'Mäkinen', 'Nieminen', 'Andersson', 'Svensson', 'Smith', 'Jones',
                  'Silva', 'Santos', 'Tamm', 'Saar', 'Hansen', 'Berg', 'Mensah', 'Laine', 'Heikkinen', 'Koskinen']
    gd = GAME_DATE
    club_names = list(clubs)
    per_club = 120
    for k, r in enumerate(recs):
        p = {'rec': r, 'person': r + 0x140, 'idx': k}
        if k < per_club * len(club_names):
            cname = club_names[k // per_club]
            rank_in = k % per_club
        else:
            cname, rank_in = None, 0
        level = clubs[cname]['level'] if cname else 1500
        age = rnd.randint(16, 34)
        if cname == 'KäPa' and rank_in >= 32:
            cname = 'PK-35' if rank_in % 2 else 'TPS'          # keep KäPa's squad a realistic size
        ca = int(max(30, min(190, level / 50 + rnd.gauss(0, 12) - rank_in * 0.15)))
        pa = int(min(200, ca + max(0, 30 - age) * rnd.uniform(0.5, 3)))
        rep_cur = int(max(50, min(9500, ca * 38 + rnd.gauss(0, 300))))
        rep_world = int(max(20, rep_cur - rnd.randint(0, 600)))
        nation = (clubs[cname]['nation'] if cname and rnd.random() < 0.75 else rnd.choice(list(nat)))
        dob = datetime.date(gd.year - age, rnd.randint(1, 12), rnd.randint(1, 28))
        first, last = rnd.choice(names_first), rnd.choice(names_last)
        p.update(name='%s %s' % (first, last), club=cname, ca=ca, pa=pa, nation=nation, dob=dob, age=age)
        heap.w(r, 'Q', VT_PLAYER)
        ratings = [rnd.randint(1, 9) for _ in range(15)]
        ratings[rnd.choice([0, 3, 5, 7, 10, 12])] = 20
        heap.wb(r + 0x08, bytes(ratings))
        heap.wb(r + 0x17, bytes(rnd.randint(20, 95) for _ in range(54)))
        heap.w(r + 0xB8, 'HH', doy(gd), gd.year)
        heap.w(r + 0xE6, 'B', rnd.randint(168, 196))
        heap.w(r + 0xEC, 'I', int(ca ** 3 * 2))
        heap.w(r + 0x116, 'HHH', int(rep_cur * 0.9), rep_cur, rep_world)
        heap.w(r + 0x11C, 'HH', ca, pa)
        heap.w(r + 0x140, 'Q', VT_PERSON)
        heap.w(r + 0x148, 'II', k, 100000 + k)
        heap.w(r + 0x150, 'I', 100000 + k)
        heap.w(r + 0x190, 'Q', heap.name_entry(first))
        heap.w(r + 0x198, 'Q', heap.name_entry(last))
        heap.w(r + 0x1A8, 'Q', nat[nation])
        pers = [rnd.randint(3, 20) for _ in range(8)]
        heap.wb(r + 0x1B0, bytes(pers))
        p['ambition'], p['loyalty'] = pers[1], pers[2]
        heap.w(r + 0x1C8, 'HH', doy(dob), dob.year)
        if cname:
            ct = heap.alloc(0x60)
            heap.w(ct + 0x08, 'Q', r + 0x140)
            heap.w(ct + 0x10, 'Q', clubs[cname]['holder'])
            heap.w(ct + 0x20, 'I', rnd.randint(500, 20000))
            end = datetime.date(gd.year + rnd.randint(0, 4), 6, 30)
            if rnd.random() < 0.1:
                end = gd + datetime.timedelta(days=rnd.randint(20, 150))
            heap.w(ct + 0x48, 'HH', doy(end), end.year)
            heap.w(r + 0x1E8, 'Q', ct)
            p['contract'] = ct
            p['expires'] = end
        if cname == 'KäPa':
            heap.w(r + 0xA6, 'H', 0x10)
        w.players.append(p)

    def set_loan(p, to_club):
        ag = heap.alloc(0x40)
        heap.w(ag + 0x08, 'Q', p['person'])
        heap.w(ag + 0x10, 'Q', clubs[to_club]['holder'])
        slot = heap.alloc(0x10)
        heap.w(slot, 'Q', ag)
        heap.w(p['rec'] + 0x1F0, 'Q', slot)
        p['loan_to'] = to_club

    kapa = [p for p in w.players if p['club'] == 'KäPa']
    hjk = [p for p in w.players if p['club'] == 'HJK']
    set_loan(hjk[40], 'KäPa')                 # loan-ins
    set_loan(hjk[41], 'KäPa')
    set_loan(kapa[-1], 'PK-35')               # loaned out
    w.kapa_squad = [p for p in kapa if p is not kapa[-1]] + [hjk[40], hjk[41]]
    w.kapa_loaned_out = kapa[-1]
    arsenal = [p for p in w.players if p['club'] == 'Arsenal']
    set_loan(arsenal[90], 'Brentford')        # an Arsenal youngster already out on loan

    # --- the first team's injury list: a department object holding (begin, end, capacity) of 0x50-byte entries
    def inj_type(text):
        t = heap.alloc(0x40)
        heap.w(t + 0x20, 'Q', heap.lenstr(text))
        return t

    dept = heap.alloc(0x800)
    heap.w(dept, 'Q', 0x1234)                 # some unrelated fields first
    vec = heap.alloc(0x50 * 8)
    A, B, C, D, E, F, G = (w.kapa_squad[i] for i in (2, 5, 9, 12, 15, 18, 21))
    other = arsenal[3]
    entries = [
        (A, 'a twisted ankle', 0xFFFFFFFF076C0001, 0x4FFFF, 0x0005000A),   # the usual marker
        (B, 'a torn hamstring', (0xFFFFFFFF << 32) | (2026 << 16) | 190, 0x4FFFF, 0x00140019),  # a filled-in date
        (C, 'a broken leg', 0, 0, 0x003C0050),                              # marker not there at all
        (D, 'a bruised rib', 0xFFFFFFFF076C0001, 0x4FFFF, 0xFFFFFFFF),     # over
        (other, 'a groin strain', 0xFFFFFFFF076C0001, 0x4FFFF, 0x00030005),  # not ours
    ]
    for j, (pl, text, mk, mk2, state) in enumerate(entries):
        e = vec + j * 0x50
        heap.w(e + 0x00, 'Q', pl['person'])
        heap.w(e + 0x08, 'Q', inj_type(text))
        heap.w(e + 0x28, 'Q', mk)
        heap.w(e + 0x30, 'Q', mk2)
        heap.w(e + 0x40, 'I', state)
        heap.w(e + 0x48, 'Q', dept)
    heap.w(dept + 0x40, 'QQQ', vec, vec + len(entries) * 0x50, vec + 8 * 0x50)
    # a stale copy of an entry for G in freed memory (marker present, outside any list) - must be ignored
    stale = heap.alloc(0x50)
    heap.w(stale, 'Q', G['person'])
    heap.w(stale + 8, 'Q', inj_type('an old knock'))
    heap.w(stale + 0x28, 'QQ', 0xFFFFFFFF076C0001, 0x4FFFF)
    heap.w(stale + 0x40, 'I', 0x00050006)
    heap.w(stale + 0x48, 'Q', dept)

    # recent injuries: 0x78-byte objects
    def case(pl, text, start, days):
        o = heap.alloc(0x78)
        t = inj_type(text)
        heap.w(o + 0x00, 'Q', t)
        heap.w(o + 0x08, 'Q', 0)
        heap.w(o + 0x18, 'II', (start.year << 16) | doy(start), 0xFFFFFFFF)
        heap.w(o + 0x20, 'H', days)
        heap.w(o + 0x50, 'Q', t)
        heap.w(o + 0x68, 'Q', pl['person'])

    case(E, 'a sprained knee', gd - datetime.timedelta(days=3), 10)
    case(F, 'a dead leg', gd - datetime.timedelta(days=30), 10)       # over long ago
    w.injured_expected = {A['name']: 'A twisted ankle', B['name']: 'A torn hamstring',
                          C['name']: 'A broken leg', E['name']: 'A sprained knee'}
    w.not_injured = [D['name'], F['name'], G['name']]
    w.inj_players = dict(A=A, B=B, C=C, D=D, E=E, F=F, G=G)

    # career histories (only read when the test patches layout.HISTORY_*): record+HIST_SLOT -> header [begin, end)
    def history(pl, seasons):
        if not seasons:
            return
        ent = heap.alloc(0x20 * len(seasons))
        for j, (year, club, loan) in enumerate(seasons):
            heap.w(ent + j * 0x20, 'H', year)
            heap.w(ent + j * 0x20 + 8, 'Q', clubs[club]['ptr'])
            heap.w(ent + j * 0x20 + 0x10, 'B', 1 if loan else 0)
        hdr = heap.alloc(0x20)
        heap.w(hdr, 'QQ', ent, ent + 0x20 * len(seasons))
        heap.w(pl['rec'] + HIST_SLOT, 'Q', hdr)

    for p in w.players:
        if not p['club']:
            continue
        start = max(p['dob'].year + 16, gd.year - 6)
        history(p, [(y, p['club'], False) for y in range(start, gd.year + 1)])
    # two hand-made cases: a Swede trained in Finland, a Finn trained in Sweden
    h1, h2 = w.kapa_squad[3], w.kapa_squad[4]
    for pl, nation, born in ((h1, 'Sweden', 2006), (h2, 'Finland', 2005)):
        dob = datetime.date(born, 3, 1)
        heap.w(pl['rec'] + 0x1C8, 'HH', doy(dob), dob.year)
        heap.w(pl['rec'] + 0x1A8, 'Q', nat[nation])
        pl['dob'], pl['nation'], pl['age'] = dob, nation, gd.year - born
    history(h1, [(2021, 'PK-35', False), (2022, 'PK-35', False), (2023, 'KäPa', False), (2024, 'KäPa', False),
                 (2025, 'KäPa', False), (2026, 'KäPa', False)])
    history(h2, [(2020, 'Malmö', False), (2021, 'Malmö', False), (2022, 'Malmö', False), (2023, 'HJK', True),
                 (2024, 'KäPa', False), (2025, 'KäPa', False), (2026, 'KäPa', False)])
    w.hg_swede_in_finland, w.hg_finn_in_sweden = h1, h2
    return w


def install(world):
    """Stub fm26mem.winmem with a fake process backed by `world.mem`."""
    mod = types.ModuleType('fm26mem.winmem')
    mod.MEM_PRIVATE, mod.MEM_MAPPED, mod.MEM_IMAGE = 0x20000, 0x40000, 0x1000000

    class Process:
        def __init__(self, pid):
            self.pid = pid

        def close(self):
            pass

        def modules(self):
            return {'fm.exe': (0x140000000, 0x5000000), 'game_plugin.dll': (ENGINE_BASE, ENGINE_SIZE)}

        def regions(self, types=None, writable_only=True, min_size=0):
            return [(b, len(a), 0x04, mod.MEM_PRIVATE) for b, a in world.mem.regions if len(a) >= min_size]

        def read(self, addr, size):
            return world.mem.read(int(addr), int(size))

        def read_bytes(self, addr, size):
            a = self.read(addr, size)
            return None if a is None else a.tobytes()

        def read_exact(self, addr, size):
            a = self.read(addr, size)
            return a if a is not None and len(a) == size else None

    mod.Process = Process
    mod.find_pids = lambda exe: [4242]
    mod.process_image_path = lambda pid: r'C:\Program Files (x86)\Steam\steamapps\common\Football Manager 27\fm.exe'
    sys.modules['fm26mem.winmem'] = mod
    if REPO not in sys.path:
        sys.path.insert(0, REPO)
    return mod


def patch_history_layout():
    from fm26mem import layout as L
    L.HISTORY_PATH = (HIST_SLOT,)
    L.HISTORY_HEADER = 0
    L.HISTORY_ENTRY_SIZE = 0x20
    L.HISTORY_ENTRY_YEAR = 0
    L.HISTORY_ENTRY_CLUB = 8
    L.HISTORY_ENTRY_LOAN = 0x10
