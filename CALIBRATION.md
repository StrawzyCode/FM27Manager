# Still to check against the live game

These parts were written and tested on a **synthetic** FM process (no game running), so they need a
session on the Windows laptop with FM27 open. Run the app from source so changes are instant:

```bat
pip install -r requirements.txt
python server.py
```

All of these are read-only; nothing is written to the game.

## 1. Injuries: does it now catch every injured first-team player?

Reported problem: in the KäPa save, injured players were missing.

1. Open the Medical Centre's *Current Injuries* list in FM and note every injured player.
2. Press *Scan Game*, then open `http://127.0.0.1:47027/api/debug/injuries`. It lists:
   - `anchors`: list entries found by their marker values (0 means the department list wasn't found at all);
   - `departments`: the injury list(s) that were then read in full;
   - `list_entries`: every entry in those lists, with `counted` and the raw `state` word;
   - `cases`: the per-injury records of the last week or so, with start date, planned days and `current`;
   - `injured`: the final answer.
3. Compare. For anyone still missing:
   - not in `list_entries` or `cases` at all: the injury lives somewhere else (a U21/U18 player, or a
     third structure). Search memory for the player's person pointer (`record + 0x140`) near the injury
     type pointer to find it;
   - in `cases` with `current: false` while FM says he's injured: the planned length at `+0x20` was
     extended (a setback), so `start + days` isn't the end date. Find the real end or "days left" field;
   - in `list_entries` with `counted: false`: check the `state` word (`0xFFFFFFFF` = over).
4. Also check nobody is flagged injured who isn't (the full-list read is new).

If players are missing from the **squad itself** (not just their injuries), open
`/api/debug/squad`: `not_in_squad` lists players the game still flags as yours who aren't counted, with
the contract / loan club pointers. Compare `counts` with the squad size FM shows.

## 2. Home-grown status: find the career history

`fm26mem/layout.py` has `HISTORY_PATH = None` and the other `HISTORY_*` constants unset, so the
home-grown filter is disabled. `Snapshot.career_history()` in `reader.py` expects:

- a pointer chain from the player record (`HISTORY_PATH`, e.g. `(0x2A8,)`) to a vector header
  `[begin, end)` at `HISTORY_HEADER`;
- fixed-size season entries (`HISTORY_ENTRY_SIZE`) holding a u16 season year (`HISTORY_ENTRY_YEAR`), a
  club object pointer (`HISTORY_ENTRY_CLUB`) and, if there is one, a loan flag byte (`HISTORY_ENTRY_LOAN`).

To find it: pick a few players whose career history FM shows (Profile → History), e.g. one who has
been at 3+ clubs. Club object pointers are known (`Snapshot.club_ptr` / `contract_club_ptr`, names via
`club_names()`). For each 8-byte slot of the 968-byte record that holds a heap pointer, follow it one or
two hops and look for a `[begin, end, capacity]` triple whose entries contain those clubs' pointers next
to year-like u16 values (1990-2030) in the order FM shows. Check the same offsets on several players,
then fill in the constants. If the history isn't a plain vector (a linked list, a separate table keyed
by player ID...), adapt `career_history()`. It just has to return `(year, club, loan, count)` arrays.

Then check the rule against FM's own *Home-Grown Status* filter (Player Search → filter
*Home-Grown Status Is Trained in nation (15-21) Finland*): same players? `HOME_GROWN_RULES` in
`reader.py` uses "3 distinct seasons with the player aged 15-20 at the start of the season's year".
Calendar-year leagues (Finland) and Aug-May leagues may need the age taken at the season start.
Also check that loan spells count for the nation rule and not the club rule.

## 3. Player interest: tune the estimate against the game's lists

The transfer / loan interest in `fm26mem/interest.py` is a model, not a value read from the game.
To tune it, run the same search in FM and in the app (same age / position / nation filters):

1. FM: Player Search with *Player Interest → Transfer or loan → Interested* (then *Persuadable*,
   *Doubtful*, then *Loan only*); note the counts and a handful of names.
2. App: Scouting Pool with the same filters and the same interest option. `/api/pool?...` returns
   `interest` (transfer) and `loanInterest` per player.
3. Adjust the constants at the top of `interest.py` (`STEP_*`, `LOAN_STEP_*`, ranks, ambition/loyalty
   cut-offs) until the lists line up. Players FM shows that the app rejects (and vice versa) show which
   factor is off.
