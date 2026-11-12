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

**Seen 12/11/2026 (game date 11/04/2027), not yet investigated:** the Medical Centre lists Tuomas Collin
(first team) with a badly fractured wrist, 3 weeks, back for the PK-35 game on 25/4. The app reads him as
fit (`injured: false` in `/api/squad`), so this looks like the first injury older than a week seen live,
and the department-list path missed it. `/api/debug/injuries` couldn't be read that day: the PC was short
of memory and the injury scan's 32 MB buffers failed to allocate.

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

## 2. Home-grown status: done (read from the game's eligibility list)

**Found 08/11/2026 (game date 26/12/2026).** There is no need for the career history: the game keeps each
player's home-grown status itself, as entries in his relation list (record + `0x1B8`, the list that also
holds secondary nationalities). Type bytes `08 46` = a nation, `01 48` = a club, and the value byte is the
eligibility type: 1 = "Homegrown 15-21", 2 = "Homegrown 0-21", other values are country-specific rules.
These are exactly the *Fully Eligible* rows of the game's *Personal → Eligibility* screen, in the same order;
a club row also counts for the club's country there, and rows still in progress ("243/1095 days") are
worked out on the fly and not stored. Checked on that screen for Kuningas, Ekangamene, Darwich,
Voutilainen, Ahola and Pirinen, and against the squad's HGN tags (67 of 69; the other two, Ahola and
Pessi Lähteenmäki, are still in progress). `HOME_GROWN_RULES` in `reader.py` maps the filter's rules onto
these types (the 0-21 rules also accept 15-21 rows, since a player only gets the stronger of the two).

Still to check: whether the game's own Player Search filter *Home-Grown Status Is Trained in nation (0-21)*
also lists players who only have a 15-21 row (e.g. Mikko Kuningas for Finland). The app assumes it does.
If the game's filter is literal, change `nation0` / `club0` in `HOME_GROWN_RULES` to `(L.HG_0_21,)`.

## 2b. Condition and match sharpness: done (record + 0x114 / + 0x110)

**Found 12/11/2026 (game date 11/04/2027, a match day).** Both are u16s in the player record, 0..10000:
sharpness at `+0x110`, condition at `+0x114`. They were found by dumping the 22 first-team records and
looking for a field that split the sharp starters from the "Lacking Sharpness" subs, and one that put
Alberto Ferrer (FM: "Good, Tired") lowest among the starters. FM27 never shows either as a number (no
column, tooltip or profile panel does; the heart's tooltip gives a band, the sharpness icon five levels),
so they were checked against those for all 75 squad players (First Team, U20s, U18s). Every player's
band fits the value: condition "Fair" at 73.8%, "Good" from 78.4 to 85.4%, "Excellent" from 87.2%;
sharpness orange arrow down at 40.5%, dash 53-59.5%, one arrow 63-72%, two arrows 74.7-83%, tick from 85%.
`fm26mem/layout.py` lists the players. The scale is the one Fm-Match-Lab writes into the match engine
(condition 8000 = 80%).

Still to check: watch the values move across a day. After a match, the starters' condition should drop
and their sharpness hold or rise, and the subs' sharpness should fall. Compare `/api/squad` before and
after FM advances a day (no rescan is needed: the squad list re-reads both every time it loads).

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
