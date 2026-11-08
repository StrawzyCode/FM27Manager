# Still to check against the live game

These parts were written and tested on a **synthetic** FM process (no game running), so they need a
session on the Windows laptop with FM27 open. Run the app from source so changes are instant:

```bat
pip install -r requirements.txt
python server.py
```

All of these are read-only; nothing is written to the game.

## Session of 08/11/2026 (KäPa save, game date 19/12/2026)

**Scan bug found and fixed first.** The app read only 32,456 players and called 40 sixteen-year-olds
(the youth intake) "the squad"; none of the real first team was there. The save holds ~78k of its 111k
players as *one contiguous 72 MB run* instead of separate 1,024-slot pages, and the last record's 968-byte
window ends 0x50 bytes past the committed memory. `_scan` read each run with one exact read, so that read
failed and the whole run was dropped. `read_run` now keeps every record it could read (and a final one
that only misses the unused tail of its window); `tests/fakefm.py` reproduces the layout. After the fix:
110,739 players, squad of 69 = FM's First Team 18 + U20s 15 + U18s 17 + KäPa/NoLe 19 (its other 8 are NoLe
players, correctly left out). This is very likely what was behind "injured players were missing".

## 1. Injuries: does it now catch every injured first-team player?

**Checked 08/11/2026:** FM shows one injured player, Elias Jantunen (KäPa/NoLe squad, "Inj"); the
Medical Centre's senior list is empty. The app finds exactly him ("A moderate groin strain", from a
per-injury record: start 15/12, 40 days), so the recent-injury path also covers B-team players. Still
open: no injury was older than a week, so the department-list path (`anchors` was 0) couldn't be checked
live. Redo step 2 when an injury has been running for more than a week. (FM's Filter pop-ups, e.g.
the Medical Centre's U20/U18 boxes, don't take clicks from desktop automation; use the squad tabs.)

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

**Checked 08/11/2026: not found yet.** Ground truth: Mikko Kuningas (ID 33058923, born 30/07/1997) has 18
rows under Career → Career Stats: PEPO 2012-14, FC Lahti 2015-17 (plus FC Lahti Akatemia "no longer
exists" in 2015 and 2016), FC Inter 2018-19, FC Lahti 2020, Orange County 2021-22, FC Lahti 2023, KäPa 2024,
Crema 2024/25, KäPa 2025-26; apps 19 / 2 / 0 for PEPO 2014 / 2013 / 2012. What was ruled out:
- every pointer in his record, followed 3 hops with vectors read in full, for club pointers *or* club
  IDs (u32 at club + 0x08: PEPO 13755, FC Lahti 483, FC Inter 6513, Orange County 12410, Crema 15182) next
  to a season year. The only hits are the relations list (+0x1B8: favourite / disliked clubs, no years),
  the contract and club objects;
- all 49 places that point at his person object, and all 54 references to the Orange County / Crema
  objects: none have 2021/22 or 2024/25 nearby (except +0x248, the previous club);
- fixed-stride runs of 2012/2013/2014 anywhere in memory near his record, person or those clubs.

So the history is probably a separate table keyed by player ID (or holds clubs another way, e.g. by
team object, since a defunct club is listed). Next: search for the u32 ID 33058923 next to year / apps
values (2014 + 19 apps + 7 goals).

Also: FM's *Inf* column shows **HGN** for every KäPa player whose column isn't taken by another tag
(Wnt, Lst, Yth, Inj), including 15- and 16-year-old intake players such as Mico Lottonen (15). Three
seasons aged 15-20 can't produce that, so check FM's actual rule before trusting `HOME_GROWN_RULES`.

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

**Checked 08/11/2026 (only partly).** The save had a Player Database search with *Transfer or loan →
Doubtful*: 625 players, mostly 17-22 at Swedish clubs. Its criteria couldn't be read (Edit Search
doesn't open from desktop automation), and FM's list is also limited to your scouting knowledge, which
the app doesn't model, so the counts can't be compared. Spot check: the app rates all 23 of the 24
visible players it could match at Doubtful or better (almost all T = Doubtful, L = Doubtful; the 24th
is spelt "Ifeoulwa" in FM). But this only tests players FM includes. The app rates 70,857 of 95,801
attached players Doubtful+ (26,484 Interested) for a club of reputation 3,750, which looks too generous.
Tuning needs FM's *rejections*: run a narrow FM search by hand (one nation and age band, *Scouted
players only* off), note who drops out between Interested / Persuadable / Doubtful, and compare with
`/api/pool`.
