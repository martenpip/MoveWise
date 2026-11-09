# Puzzle training (v0.6)

MoveWise's puzzle trainer runs entirely on your device: choosing a puzzle, checking your moves, hints, explanations, the puzzle rating, the daily puzzle, Puzzle Rush, statistics and achievements. It needs no network, no account and no AI service. Open it from **Puzzles** in the main navigation (`#/puzzles`).

The aim is understanding, not a score. Every puzzle ends with a plain-language account of *why* the solution works, and the Profile separates "solved it" from "solved it cleanly, with no help".

## The collection

The app ships one pack, **Lichess starter collection**: **2,771 puzzles**. That number is the real count of puzzles that passed every check below; the interface always shows the live count of what is installed and never a promised total.

### Source and licence

* **Source:** the Lichess puzzle database (`lichess_db_puzzle.csv`), <https://database.lichess.org/#puzzles>. Lichess releases this database under **CC0 1.0** (public domain dedication); no attribution is legally required, but MoveWise credits Lichess on the Collection page and in the pack file.
* **What was used:** forty 1.2 MB byte-range slices of that CSV, evenly spread through the file (about 260,000 distinct puzzles after parsing). The build environment could not reach `database.lichess.org`, so the slices were fetched through a public GitHub Git-LFS copy of the official export. *That intermediate copy was not recorded in the build log, so it is not named here; the CC0 source is the official database above.* What is recorded, and checked in `docs/puzzle-pack-report.json`, is the SHA-256 of every slice that was used, the counts at each stage and every rejection reason.
* **Reproducibility:** `scripts/puzzles/build-pack.ts` rebuilds the pack from CSV slices (`npx tsx scripts/puzzles/build-pack.ts <slice-dir> --verify`). Run on different slices it will select a different, equally valid set; it does not recreate this exact file unless given the same slices.
* **What is Lichess's and what is MoveWise's:** puzzle ids (stored as `li:<id>`), positions, solutions, difficulty ratings and theme tags come from Lichess. The selection, the checks, the explanations and every other number in the app are MoveWise's own.

### How puzzles were selected and checked

1. **Parse.** Lichess's format stores the position *before* the opponent's last move; the first move of the list is that move, then your move, the reply, and so on, always ending on your move. MoveWise keeps this, so a puzzle starts the way it did in the game.
2. **Select.** Quality filter: rating deviation at most 100, popularity at least 88 and at least 300 plays on Lichess, a theme MoveWise can name, and (unless it is a mate puzzle) a line of at most 12 plies. About 96,700 of the roughly 260,000 distinct puzzles in the slices passed. From those, per-theme quotas (rarest themes first) take puzzles spread evenly across each theme's rating range, so every theme has easy and hard examples. The result is a *sample*: 2,807 candidates, ratings 399 to 2829.
3. **Rules check (all puzzles).** Legal FEN; every move legal on MoveWise's own rules engine; an even number of moves; a `mateInN` tag must match the number of your moves and the line must really end in checkmate. 46 candidates failed here and were dropped.
4. **Stockfish check (all non-mate puzzles).** Stockfish 19 searched each puzzle (depth 12, up to 250 ms). The first solution move had to be within 120 centipawns of Stockfish's own best move and leave the solver with a clear advantage (at least +100; at least −60 for "defence"/"escape to equality" puzzles). 36 of 2,807 candidates failed and were dropped (24 "no clear advantage after the solution", 12 "engine prefers a different first move"). Mate puzzles are verified by the rules engine alone: the solution ends in checkmate.
5. **At install and at load.** Every pack, including the bundled one, is re-validated when it is read. A puzzle that fails is dropped and counted; it is never shown.

### Coverage

The theme tags are Lichess's. Counts below are puzzles in the starter pack carrying the tag (a puzzle has several tags).

| Area | Themes in the app (count) |
| --- | --- |
| Basic tactics | Fork (300), Pin (251), Skewer (205), Discovered attack (204), Double check (88), X-ray (69), Trapped piece (129), Loose piece (192) |
| Removing and luring | Deflection (218), Attraction / decoy (205), Removing the defender (132), Clearance (150), Interference (81), In-between move / zwischenzug (143) |
| Sacrifices and attack | Sacrifice (414), Quiet move (126), Exposed king (140), Attack on the kingside (214) / queenside (76), Attack on f2 / f7 (64) |
| Checkmate | Mate in 1 (270), 2 (325), 3 (230), 4 (116), 5 (35); Back-rank (165); Smothered (86), Anastasia (56), Arabian (56), Hook (47), Dovetail (36), Boden (33), Double-bishop (36) |
| Defence | Defensive move (206) |
| Endgames | Endgame tactics (1,359), pawn (110), rook (117), bishop (77), knight (72), queen (68), queen and rook (47), promotion (111) |
| Other | Zugzwang (73), Advanced pawn (201), Under-promotion (22), En passant (22), Castling (14) |

**What is not covered, and why.** Lichess does not tag these, and MoveWise does not guess at them, so the app does not claim them:

* **Exchange sacrifices, king hunts, "double attack" and "discovered check" as separate themes.** The closest tags are Sacrifice, Exposed king, Fork and Discovered attack / Double check; they are labelled with those names.
* **Strategic exercises** (positional ideas without a forcing tactic). The starter pack contains tactics only. The pack format and the `kind` field leave room for them, but no source of verified strategic positions was available, so none were invented.
* **Mate in 6 or more.** Capped at five of your moves.

## Solving

* **Board.** Click or drag. Legal moves are highlighted if you have that setting on. Promotion asks which piece.
* **Several moves.** After each correct move the opponent's reply is played automatically and the puzzle continues; it is complete only when the last move of the line is played.
* **More than one solution.** A move other than the stored one is accepted when it is checkmate, or, for a non-mate puzzle, when Stockfish rates it as good as the stored move (within 50 centipawns, or both winning by 6 pawns or more). For a mate puzzle the engine must confirm mate within the remaining moves. MoveWise has no multi-line (MultiPV) search, so this is a comparison of your move against the stored one, not a search for every winning move; a very unusual winning alternative can therefore be marked wrong. When a move is refused, "Why does it fail?" shows the engine's best reply.
* **Retry.** After a wrong move the position resets and you can try again, ask for a hint, or show the solution. The first result is what counts for the rating.
* **Hints.** Three stages, all taken from the puzzle's own solution and tags, never invented: 1) the *direction* ("look for a move that makes two threats"), 2) the *motif* ("a fork"), 3) the *piece and square* to move from. The destination is only shown by "Show solution". Hint use is recorded. In a multi-move puzzle the hints restart on each of your moves; the highest level used counts.
* **Sounds** are the app's existing set (move, capture, check, checkmate, error, success, rating change).

## Explanations

After a puzzle you get a headline, a short explanation and the full line, at three levels (Beginner, Intermediate, Advanced; the choice is remembered). Everything stated comes from facts the rules engine computed from the position: whether a move gives check or captures, what it attacks afterwards, the material balance once the exchanges settle, whether the line ends in checkmate, plus one sentence about the theme's idea. Advanced adds Stockfish's evaluation of the position after your first move when the engine is available. If a fact cannot be established, it is left out: the line and the theme label are always shown, and nothing is made up. "Theme" labels are Lichess's tags and are said to be so.

## The puzzle rating

A **separate Glicko-2 rating** with its own uncertainty, never combined with your playing rating or lesson progress. It starts at 1000 with a large uncertainty and is called *provisional* until the uncertainty is small. The Profile and the hub show it as `rating ± 1.96·RD` (a 95% range).

* **Only the first attempt at each puzzle counts.** Retrying, revisiting from History, replaying the daily puzzle, Puzzle Rush and positions from your own games never change the rating, so a puzzle cannot be farmed.
* **Score of that first attempt:** clean solve 1; solved after using a hint ½; wrong move, giving up or viewing the solution 0. (The ½ for a hint is MoveWise's own rule.)
* **Difficulty matters:** the update uses the puzzle's own Lichess rating (with its published deviation, default 50). Beating a harder puzzle moves you more; losing to an easier one costs more.
* **Time is never used,** so there is no reward for speed and no penalty for thinking.
* **Peak** is recorded only after the rating has stopped being provisional, so early swings are not shown as a peak.
* The hub's "How is this worked out?" panel states these rules and the effect of the next win or loss at your level.

## Adaptive training

Per theme MoveWise tracks your recent results with a recency weight (half-life 12 attempts) and an 80% Wilson interval, and assigns a level:

| Level | Rule |
| --- | --- |
| Too few puzzles | under 5 attempts |
| Needs work | at least 5 attempts and the *upper* end of the interval under 65% |
| Improving | otherwise |
| Mastered | at least 10 attempts, the *lower* end of the interval at 70% or more, results on at least 3 different days, and at least 4 of the last 5 solved cleanly |

A strong recent run that does not meet that bar is shown as **strong run**, never as mastery. Hints, wrong moves and viewing the solution all stop an attempt counting as clean.

The next puzzle is drawn at random, weighted by: closeness to a target rating (your puzzle rating, nudged down for weak themes and up for mastered ones), novelty (unseen puzzles are favoured; one you just solved cleanly is very unlikely to repeat), and need (weak and improving themes are favoured; mastered ones rarely return unless unseen for 21 days). Every pick says why it was chosen. **Weakness training** targets your three weakest themes and falls back to a mixed set when there is no data yet. **Review mistakes** serves puzzles whose latest attempt was not clean, oldest first.

## Daily puzzle

One puzzle per local calendar day, chosen deterministically (a hash of the date over the installed collection, within about 250 points of your rating at the time it is first opened) and then **saved**, so it is identical after any reload, offline, and even after your rating changes. The first attempt that day can be rated; replays are not. Completion, its streak and history are kept and are part of backups.

## Puzzle Rush

Optional, 3, 5 or 10 minutes, no hints. It starts about 350 points below your rating and rises 40 per solve; three misses end a run; only short puzzles (up to six moves) are used. Best scores are local. **Rush never changes the puzzle rating.**

## From your own games

In Game Review, a mistake of yours can be turned into practice: **Practise this mistake** (and "Practise from this game"). It keeps a link to the game and the exact move.

* It becomes a **scored mate puzzle** only when the engine's line is a forced mate in five or fewer that the rules engine confirms. A missed mate is then a real puzzle.
* Otherwise it is an **unscored learning position**: you try to find the engine's preferred move. It carries no theme (one engine move is not evidence of a tactical skill), and appears nowhere in rating or theme statistics.
* The only themes attached are ones MoveWise could *verify* in the position (a mate, a fork where the best move attacks two or more pieces, a loose piece that could have been taken). Each is shown with the fact behind it.
* These positions never enter the puzzle rating. They are stored locally and deleted with their game. This is the foundation for the Mistake Notebook (Phase 5); spaced repetition is **not** implemented here.

## Resource packs

The **Collection** page lists installed packs with licence, attribution and source, and lets you add your own: a MoveWise pack (`.json`, `format: "movewise-puzzle-pack"`) or a Lichess-format `.csv`. Nothing is ever downloaded automatically. A pack must state its id, name, licence, attribution and source; every puzzle is replayed on the rules engine and rejected if it does not pass. Installed packs are stored in IndexedDB and can be removed; the bundled pack cannot be removed. A pack that fails entirely in a backup restore is skipped.

## Storage and backups

IndexedDB moved from version 3 to **4**, adding four stores (`puzzleDaily`, `puzzleRush`, `puzzlePacks`, `learningPositions`). Existing stores are untouched. Backups keep `version: 3` and gain an optional `puzzles` field; old backups restore as before and invalid puzzle entries are dropped on import. Puzzle attempts are `ActivityEvent`s in the existing activity store, so they travel in the same backup. An existing daily choice for a date is never overwritten by an import.

The upgrade was tested against a database written by a real v0.5 build (see below).

## Achievements

Active now: First Puzzle, Fork Master, Pinpoint Accuracy, Checkmate Hunter, Tactical Thinker, Puzzle Addict, Sharp Eyes, Tactical Growth, and new in v0.6 Daily Solver, Daily Habit (7 different days), Rush Runner (25 Rush solves) and Learning from Losses (3 exercises solved from your own games). They are computed from saved attempts only; each distinct puzzle counts once, own-game exercises do not count as puzzles, and replays add nothing.

## Tests

* `tests/puzzles-core.test.ts`, `tests/puzzles-engine.test.ts` (real Stockfish), `tests/puzzles-storage.test.ts`: data validity, solver, hints, alternatives, rating, adaptive selection, daily, Rush, learning positions, attempt records, storage, backups, achievements.
* `tests/e2e/puzzles.mjs` (`npm run test:e2e:puzzles`): offline in a real browser: open the collection, practise with all three hints, solve move by move, explanation and level, rating, reload, unrated revisit, show-solution, stable daily puzzle and completion, Rush, history, collection page, backup export, erase and restore, no external request, no page error.
* `tests/e2e/migrate-from-v05.mjs` (`npm run test:upgrade`, needs `V05_DIR`): builds the real v0.5 release, creates a game and a review in it, then opens the *same* browser profile with the new build and checks the IndexedDB upgrade and the new features on the upgraded database.

## Known limits

* Alternative solutions are judged by comparison with the stored move, not by a full multi-line search (see Solving).
* The starter pack is a sample of the Lichess database, not all of it, and has no strategic exercises, exchange-sacrifice or king-hunt themes.
* Theme tags and puzzle ratings are Lichess's. A puzzle's rating is the crowd's, not a measure of how hard it is for you; that is what your own puzzle rating adjusts for.
* The half-point for a hinted solve, the 50-centipawn alternative tolerance, the mastery bar and the Rush parameters are MoveWise's own design choices.
