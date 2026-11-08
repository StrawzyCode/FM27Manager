"""Estimated interest of a player in joining the human club, on a transfer and on a loan - a guide,
not the game's own number.

The game decides this with a private formula it does not store anywhere. What it *does* show
(the Player Database lists, which are ordered by world reputation) is a hard ceiling: nobody whose
world reputation is more than ~100 above the club's own is ever offered, at any interest level. Below
that ceiling the estimate asks the questions a player would ask.

Transfer (a permanent move) - "is this club a step up from where I am, and would I play?"
  base level from the stature of his club against yours:
    Interested    his club is clearly smaller than yours, or he has no club (free agent)
    Persuadable   about level with yours, or a small step either way
    Doubtful      a small step down for him
    Not           a big step down, or he is simply too good for the club
  then moved by at most one level, either way, by:
    + he would walk into your XI but is not a regular at his club
    + his contract runs out within six months
    + your club is in his own country (and it is not already a step up)
    + an unambitious player (ambition <= 6) and the move is a step down
    - a key player (one of his club's five best) at a bigger club
    - a very ambitious player (ambition >= 16) and the move is not a step up
    - a very loyal player (loyalty >= 17) who has a club

Loan - "would I get games there?" Players accept a loan to a smaller club much more readily than
a permanent move, so the base thresholds are looser, then:
    + he is not a regular at his club (outside its best 11) and would be in your squad
    - a key player at his club (one of its five best): clubs don't loan those, and he won't ask
    - he would not get into your best 22 (no games for him there)
    - he is 29 or older
  A loan is impossible for a free agent (no club to loan him) or a player already out on loan.

Club stature = the average current reputation of the club's 18 best players. The game does store a
club reputation, but not for every club (Bayern, Ajax, PSV... read 0), and this one exists for all.
All the numbers below are on the game's 0-10000 reputation scale and are meant to be tuned.
"""
import numpy as np

NOT, DOUBTFUL, PERSUADABLE, INTERESTED = 0, 1, 2, 3
LOAN_IMPOSSIBLE = -1
LABELS = {NOT: 'not interested', DOUBTFUL: 'doubtful', PERSUADABLE: 'persuadable', INTERESTED: 'interested',
          LOAN_IMPOSSIBLE: 'not possible'}

STATURE_PLAYERS = 18          # how many of a club's best players define its stature
TOO_GOOD_MARGIN = 100         # world reputation above (club reputation + this) = never interested

# transfer: how far his club's stature may be above yours (negative = yours is bigger)
STEP_UP = -300                # at most this -> Interested
STEP_LEVEL = 300              # at most this -> Persuadable
STEP_DOWN = 600               # at most this -> Doubtful; beyond -> not interested
# loan: the same, looser - a season at a smaller club for games is an easy sell
LOAN_STEP_UP = 300
LOAN_STEP_LEVEL = 900
LOAN_STEP_DOWN = 1500

KEY_PLAYER_RANK = 5           # one of his club's 5 best (by current ability) = a key player
REGULAR_RANK = 11             # one of its 11 best = a regular
MY_XI, MY_SQUAD = 11, 22      # he'd start for you / he'd be in your squad: at least your 11th / 22nd best CA
AMBITIOUS, UNAMBITIOUS, VERY_LOYAL = 16, 6, 17
CONTRACT_ENDING_MONTHS = 6
LOAN_MAX_AGE = 28

# Where the stored club reputation is missing (reads 0), fall back to a fit of stored reputation against stature
REP_FROM_STATURE = (1.14, -328.0)


def club_stature(club_ptr, ca, current_rep, valid):
    """(per-player stature of the club he plays for, {club pointer: stature}, per-player rank by current
    ability inside that club - 0 = its best player). NaN stature and a huge rank for no club."""
    n = len(club_ptr)
    out = np.full(n, np.nan)
    rank_out = np.full(n, 1 << 20, dtype=np.int64)
    idx = np.flatnonzero(valid & (club_ptr != 0))
    if not len(idx):
        return out, {}, rank_out
    order = np.lexsort((-ca[idx].astype(np.int64), club_ptr[idx].astype(np.int64)))   # by club, best CA first
    idx = idx[order]
    cp = club_ptr[idx]
    starts = np.r_[0, np.flatnonzero(cp[1:] != cp[:-1]) + 1]
    counts = np.diff(np.r_[starts, len(idx)])
    rank = np.arange(len(idx)) - np.repeat(starts, counts)
    top = rank < STATURE_PLAYERS
    sums = np.add.reduceat(np.where(top, current_rep[idx], 0).astype(np.float64), starts)
    stature = sums / np.add.reduceat(top.astype(np.int64), starts)
    out[idx] = np.repeat(stature, counts)
    rank_out[idx] = rank
    return out, {int(p): float(s) for p, s in zip(cp[starts].tolist(), stature.tolist())}, rank_out


def _levels(step, up, level, down):
    out = np.full(len(step), NOT, dtype=np.int8)
    out[step <= down] = DOUBTFUL
    out[step <= level] = PERSUADABLE
    out[step <= up] = INTERESTED
    return out


def classify(world_rep, stature, rank, ca, age, ambition, loyalty, months_left, on_loan,
             same_nation, my_rep, my_stature, my_cas):
    """(transfer level, loan level) of every player, for a club of reputation `my_rep`, stature `my_stature`
    whose squad has current abilities `my_cas`. Levels are 0-3 (see the module doc); a loan level of -1
    means a loan is impossible. `months_left` is NaN where the contract end is unknown."""
    n = len(world_rep)
    free = np.isnan(stature)
    step = np.where(free, -np.inf, stature - my_stature)                  # no club: keen to sign anywhere
    cas = np.sort(np.asarray(my_cas, dtype=np.int64))[::-1]
    xi_ca = int(cas[min(MY_XI, len(cas)) - 1]) if len(cas) else 0
    squad_ca = int(cas[min(MY_SQUAD, len(cas)) - 1]) if len(cas) else 0
    ca = ca.astype(np.int64)
    would_start = ca >= xi_ca
    would_play = ca >= squad_ca
    regular = rank < REGULAR_RANK
    key = rank < KEY_PLAYER_RANK
    ending = np.nan_to_num(months_left, nan=99.0) <= CONTRACT_ENDING_MONTHS

    # --- transfer
    adj = np.zeros(n, dtype=np.int64)
    adj += would_start & ~regular & ~free
    adj += ending & ~free
    adj += same_nation & (step > STEP_UP) & ~free
    adj += (ambition <= UNAMBITIOUS) & (step > 0)
    adj -= key & (step > 0)
    adj -= (ambition >= AMBITIOUS) & (step > STEP_UP)
    adj -= (loyalty >= VERY_LOYAL) & ~free
    transfer = np.clip(_levels(step, STEP_UP, STEP_LEVEL, STEP_DOWN) + np.clip(adj, -1, 1), NOT, INTERESTED)
    transfer[free] = INTERESTED

    # --- loan
    adj = np.zeros(n, dtype=np.int64)
    adj += ~regular & would_play
    adj -= 2 * key
    adj -= ~would_play
    adj -= age > LOAN_MAX_AGE
    loan = np.clip(_levels(step, LOAN_STEP_UP, LOAN_STEP_LEVEL, LOAN_STEP_DOWN) + np.clip(adj, -2, 1), NOT, INTERESTED)
    loan[free | on_loan] = LOAN_IMPOSSIBLE

    too_good = world_rep > my_rep + TOO_GOOD_MARGIN
    transfer[too_good] = NOT
    loan[too_good & (loan != LOAN_IMPOSSIBLE)] = NOT
    return transfer.astype(np.int8), loan.astype(np.int8)


def describe(my_rep):
    """One line for the UI explaining the estimate."""
    if not my_rep:
        return ''
    return ('estimated, not read from the game: nobody above %d world reputation is interested; below that it '
            'weighs how big his club is against yours, whether he plays there and would play for you, his '
            'ambition, loyalty and contract' % (my_rep + TOO_GOOD_MARGIN))
