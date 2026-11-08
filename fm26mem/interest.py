"""Estimated interest of a player in joining the human club - a guide, not the game's own number.

The game decides this with a private formula it does not store anywhere. What it *does* show
(the Player Database lists, which are ordered by world reputation) is a hard ceiling: nobody whose
world reputation is more than ~100 above the club's own is ever offered, at any interest level. Below
that ceiling this estimate asks the question a player would ask, "is this club a step up from
where I am?", by comparing the stature of his current club with yours:

  Interested           his club is clearly smaller than yours (a step up), or he has no club
  Slightly interested  about level with yours, or a small step either way
  Doubtful             a small step down for him
  Unlikely             a big step down, or he is simply too good for the club

Club stature = the average current reputation of the club's 18 best players. The game does store a
club reputation, but not for every club (Bayern, Ajax, PSV... read 0), and this one exists for all.
All the numbers below are on the game's 0-10000 reputation scale and are meant to be tuned.
"""
import numpy as np

UNLIKELY, DOUBTFUL, SLIGHTLY, INTERESTED = 0, 1, 2, 3
LABELS = {UNLIKELY: 'unlikely', DOUBTFUL: 'doubtful', SLIGHTLY: 'slightly interested', INTERESTED: 'interested'}

STATURE_PLAYERS = 18          # how many of a club's best players define its stature
TOO_GOOD_MARGIN = 100         # world reputation above (club reputation + this) = never interested
STEP_UP = -300                # his club is at least this far below yours -> Interested
STEP_LEVEL = 300              # up to this far above yours -> Slightly interested
STEP_DOWN = 600               # up to this far above yours -> Doubtful; beyond -> Unlikely

# Where the stored club reputation is missing (reads 0), fall back to a fit of stored reputation against stature
REP_FROM_STATURE = (1.14, -328.0)


def club_stature(club_ptr, ca, current_rep, valid):
    """(per-player stature of the club he plays for, {club pointer: stature}); NaN for no club."""
    out = np.full(len(club_ptr), np.nan)
    idx = np.flatnonzero(valid & (club_ptr != 0))
    if not len(idx):
        return out, {}
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
    return out, {int(p): float(s) for p, s in zip(cp[starts].tolist(), stature.tolist())}


def classify(world_rep, stature, my_rep, my_stature):
    """Interest level (0-3) of every player in joining a club of reputation `my_rep` / stature `my_stature`."""
    step = np.where(np.isnan(stature), -np.inf, stature - my_stature)      # no club: keen to sign anywhere
    level = np.full(len(world_rep), UNLIKELY, dtype=np.int8)
    level[step <= STEP_DOWN] = DOUBTFUL
    level[step <= STEP_LEVEL] = SLIGHTLY
    level[step <= STEP_UP] = INTERESTED
    level[world_rep > my_rep + TOO_GOOD_MARGIN] = UNLIKELY
    return level


def describe(my_rep):
    """One line for the UI explaining the estimate."""
    if not my_rep:
        return ''
    return ('estimate from reputations: nobody above %d world reputation is interested; otherwise it depends '
            'on whether his club is smaller than, level with or bigger than yours' % (my_rep + TOO_GOOD_MARGIN))
