# The Academy (v0.8.0)

Interactive lessons, exercises, knowledge checks and course assessments. Everything runs offline; progress is stored in IndexedDB (store `academy`; the database is at version 6 since v0.8, which added the Notebook store without touching Academy records). No account, no cloud, no remote AI.

## What is in it (derived from `src/academy/content`)

| Course | Level | Chapters | Lessons | Assessment questions |
|---|---|---|---|---|
| Chess from zero | beginner | 5 | 36 | 12 |
| Tactical awareness | intermediate | 3 | 16 | 12 |
| Positional understanding | intermediate | 2 | 15 | 10 |
| Strategic planning | intermediate | 2 | 8 | 8 |
| King safety and attacking play | intermediate | 2 | 7 | 8 |
| Calculation | advanced | 2 | 5 | 8 |
| Endgame theory | advanced | 3 | 10 | 10 |
| Advanced positional play | advanced | 2 | 8 | 8 |
| Opening understanding | advanced | 2 | 8 | 8 |

Total: **9 courses, 113 lessons.** `npm run academy:validate` re-derives these counts and checks every FEN, move line and question.

Paths: Beginner, Tactician, Strategist, Advanced.

### Completion pass (v0.7.1)

- **Strategic planning**: weaknesses, the worst piece, plans, restriction, strategic exchanges, pawn breaks, playing against weaknesses, converting an advantage. Built on real model positions (isolated pawn, Najdorf, Carlsbad, French).
- **Advanced positional play**: prophylaxis, positional and exchange sacrifices, dynamic compensation, colour complexes, restriction, structure transformation, piece coordination.
- **Opening understanding**: principles, the centre, development and tempo, common structures, typical breaks, variations, traps (Scholar's mate, Légal's mate, the Elephant Trap) and the transition to the middlegame. Move sequences are written as SAN and checked by the rules engine.
- **Tactical awareness** now has 16 lessons. The 16th is **X-ray attacks**. The original list of sixteen topics was not preserved, so this was my choice of the missing topic; if your list named a different one, say so.
- **Positional understanding** was rewritten: 15 lessons, each on a real position with an objective, a guided demo where useful, a board exercise, progressive hints, move-specific feedback and a check on that lesson's idea.
- **Endgames**: the opposition lesson now shows the same position won and drawn depending only on the move, and triangulation builds on that. See the limitation below.

### Audit in v0.8.0

- **Lucena** now uses a genuine Lucena position (pawn on d7, king d8, rook e1 cutting off the king on f7, Black rook on b2). The bridge line (Rf1+, Kg7, Rf4) and the later king walk were checked move by move for legality and the position is engine-confirmed as winning. The old position was a different, less standard setup, and its demo did not show the bridge.
- **Philidor** now has a position where the rook defence is engine-confirmed as a draw, plus an exercise for the moment the pawn reaches the sixth rank. Several rook moves hold the draw there, so the exercise accepts the first-rank rook moves and does not claim a single "only move".
- **Opposition** has a new exercise (`8/1K6/3k4/8/2P5/8/8/8`, White to move) where Kb6 is the only winning move; the engine confirms the alternatives draw.
- **Triangulation**: unchanged in substance, see below. A plain king advance is never labelled as triangulation in the lesson; the demonstration says in its own text that a plain advance also wins there.
- **Tactical labels** are tags and motif checks, not proofs; the per-theme limits are listed below. No label was strengthened in this pass.

## Limitations (read these)

- **Triangulation**: I tried to find a classical-style study (a position where only a king triangle wins and the defender cannot answer in kind) with several engine searches and did not find one I could verify, so I did not invent one. The lesson teaches the idea (tempo, why the defender must be confined) with the opposition pair, and keeps an engine-line demonstration that is labelled as such. It is not a classical study.
- **Puzzle links are checked, not proven.** `src/puzzles/motif.ts` replays each puzzle's solution and looks for the geometry of the lesson's theme (fork, pin, skewer, discovered attack, double check, back-rank mate, sacrifice, capturing the defender). Measured on the full library, the *tag-only* match would include non-matching puzzles, and even the detectors are only a necessary check: the pin detector still accepts 36% of the library, so it does not prove the pin is the key idea. Deflection, attraction, interference, clearance and in-between moves have no detector; their puzzles are tagged only. A lesson shows "confirmed" puzzles when it has at least 8 and otherwise says plainly that there are too few. Lesson puzzles used inside lessons were all confirmed (52 of 52 checkable).
- **Engine verification covers what it says**: 349 accepted exercise moves were checked and none loses material or evaluation (tolerance 60 cp, "soft" moves 250 cp, which proves they are sound, not best), and 11 lesson-level evaluation claims (winning/better/equal) were checked. Constructed teaching positions carry no engine claim. Text explanations are not engine-verified.
- The exchange-sacrifice lesson uses tactical examples from the puzzle library, because the hand-built Dragon lines I tried did not survive the engine.

## Lesson model

Lesson = steps (`read`, `demo`, and the exercises `move`, `reach`, `place`, `square`, `ask`) plus a knowledge check of 2-5 questions. Chapter checks have 4-8 questions, course assessments 8-14. Hints are progressive; wrong answers get feedback and can be revisited; checks can be retaken.

## Statuses and mastery

Not started / In progress / Completed / Mastered / Needs review. Thresholds: pass 60%, mastery 80%, placement 80%, course pass 70%, course mastery 85%. Click-through earns nothing: completion needs every exercise solved and a passed check. Mastery needs a strong check plus a confirmation (a second strong check on another day, a later chapter/assessment attempt that got that lesson's questions right, or three clean puzzle solves on the lesson's themes). "Needs review" appears when later results contradict a lesson.

Prerequisites are soft: a course can be opened early. A placement assessment (80%, only before any lesson work in that course) marks lessons as placed-out; they are shown separately and never counted as completed.

## Evidence rules

Recommendations use real data only: puzzle results, reviewed games and check scores. With too little data the app says so rather than guessing. The Game Review "Lessons that could help" card appears only when a weakness recurs in at least three reviewed games.

## Links with the Notebook and the Home page

Each lesson has concept ids (`domain.topic`), optional puzzle themes and Game Review tags. The Mistake Notebook's insights (for example "missed several knight forks") link to lessons that exist, and Home offers the lesson you started or the next one on your path. Lessons themselves are not scheduled for repetition; only Notebook positions are (see [notebook.md](notebook.md)).

## Content provenance

Lesson text, questions and explanations are original. Puzzle exercises use frozen positions from the Lichess puzzle database (CC0); see THIRD_PARTY_NOTICES.md. Accepted moves in exercises were checked with Stockfish (349 moves, none losing material or evaluation) and lesson claims were engine-verified (`npm run academy:engine`). Lichess theme tags are "tagged as", not guaranteed; see Limitations.

## Tests

`tests/academy-core.test.ts`, `academy-content.test.ts`, `academy-storage.test.ts`, `academy-engine.test.ts`, `tests/puzzles-motif.test.ts`, `tests/e2e/academy.mjs` (offline), `tests/e2e/viewports.mjs` (360-1920 px, both themes) and `tests/e2e/migrate-from-v07.mjs` (a real v0.7 build with a saved game and a completed lesson upgrades to the current build; every store and the lesson progress survive) and `tests/e2e/migrate-from-v06.mjs` (builds a real v0.6, upgrades its IndexedDB 4 to 5, and confirms all older stores are unchanged).
