# Game Review

Game Review analyses a finished game, move by move, with the engine on your device, and turns the result into something to learn from. It needs no network and sends nothing anywhere.

Open it from **Games → Review**, from a game's replay page, or at `#/games/<id>/review`.

## What it does

1. **Set-up.** You choose how thorough to be (Quick 0.5 s, Standard 1.2 s or Thorough 3 s per position, at most) and which side you played. For a game you played against a bot the side is known; for an imported game you say so, or choose "Not my game" (both sides are shown and nothing is added to your Profile). The screen states which engine will run before anything starts.
2. **Analysis.** Every position of the game (N moves means N+1 positions) is searched in turn. Progress is saved every five positions, so a stopped or interrupted review can be resumed.
3. **Review screen.** Board with an evaluation bar and arrows, an evaluation graph, a summary, a per-move explanation at three levels (beginner, intermediate, advanced), a list of key moments and a move list with verdicts. The engine's line, and the line after the move you played, can be previewed on the board.
4. **Saved.** The review is stored in IndexedDB and reopens from the Games list or the Profile. Reviews are part of backups.

## Which engine

Stockfish 19 (lite) is used whenever it is available and is selected in Settings → Engines. If it is not (the preference is "built-in", or it could not start), the built-in engine is used and every place that shows a verdict says "Built-in engine (not Stockfish)" and the summary carries a caveat. A position where the game ended (checkmate, stalemate, a draw rule) is scored by the rules of chess, not by an engine, and is recorded as `Rules of chess`. The bots and their rating calibration are untouched: review never calls the bot code path.

## What is stored, and what is derived

Only the engine's raw output is stored (`GameReview`, `src/review/types.ts`): for each position the score (White's point of view, in centipawns, with `mate` when forced), the best move, the principal variation, the depth and the engine name. Everything else (verdicts, accuracy, ACPL, tags, key moments, explanations, the summary) is recomputed by pure functions each time. Changing a threshold therefore changes what is shown, never what was measured, and nothing can drift out of step with the engine output.

## Method

* **Win chance** uses the Lichess logistic: `50 + 50 × (2 / (1 + e^(−0.00368208 × cp)) − 1)`.
* **Loss of a move** = the mover's win chance before the move (the engine's evaluation of the position) minus after it. A move equal to the engine's choice has loss 0. Negative loss is clamped to 0. A move that was the only legal move is never judged or counted.
* **Verdicts** (points of win chance lost): ≤ 1 or the engine's choice: best; < 5: good; 5 to < 10: inaccuracy; 10 to < 15: mistake; ≥ 15: blunder. *These thresholds are MoveWise's own choice.*
* **Move accuracy** = `103.1668 × e^(−0.04354 × loss) − 3.1669`, limited to 0..100 (the Lichess formula). **Game accuracy** is the mean of a volatility-weighted mean and the harmonic mean. The volatility window is `clamp(floor((n−1)/10), 2, 8)` moves and the weight `clamp(stddev, 0.5, 12)`; *these two are MoveWise's own choices.* The number is an estimate for comparing your own games. It is not a rating and is not comparable with other sites.
* **Average centipawn loss (ACPL)** = the mean centipawns given up per move, with every score first limited to ±1000.
* **Phases.** Opening: plies 1 to 20 unless the endgame has started. Endgame: combined non-pawn material of both sides ≤ 24 points (Q 9, R 5, B 3, N 3), and once reached it stays an endgame. A phase ACPL is shown only with at least 3 judged moves.
* **Key moments** are up to six of your own largest swings plus up to three opponent errors (marked as taken advantage of or not).

## Verified tags (no guessing)

A tag is attached only when the engine's stored lines, replayed with MoveWise's own rules engine, show it:

| Tag | Condition |
| --- | --- |
| Allowed a forced checkmate / Missed a forced checkmate | the line after the move (or the best line) is a forced mate for the opponent (or for the mover) |
| Left a piece to be captured | the engine's reply captures the moved piece on its destination square, it is not a pawn, and the settled material change is ≤ −2 points (and ≥ 2 worse than the best move) |
| Lost material | settled material change ≤ −2 points and ≥ 2 worse than the best move |
| Missed a way to win material | the best line wins ≥ 2 points once the exchanges settle, and the played move was ≥ 2 worse |
| Gave away an advantage | a mistake or worse, from ≥ 70% to ≤ 55% win chance |
| Found a forced mate / Found a winning idea | the move was the engine's choice and it won mate or material |

"Settled" material means the line is played until at least two plies have passed and the next move is not a capture (at most eight plies). If no tag applies, the explanation says only what the engine preferred and shows its line; it does not invent a reason. Tips appear only when a tag exists.

## Summary

The summary is rule-based with the thresholds stated in the code (`src/review/summary.ts`): strengths and weaknesses by phase (strong: ACPL ≤ 25 over ≥ 5 moves; weak: ≥ 60), a lesson (the costliest move, or an honest line if there was none), a focus, a comparison with your last reviewed games (needs at least 3), recurring patterns (a tag in at least two earlier games) and caveats (non-Stockfish engine, low depth). Every game gets a lesson and a focus.

## Profile

A completed review of your own side adds one `ReviewEvent` (id `review:<gameId>`, replaced if you re-analyse, removed if you delete the review or the game). Profile → Chess quality shows average ACPL, accuracy, blunders, mistakes, inaccuracies, missed tactics, phase ACPL, your most and least accurate reviewed games and the patterns that recur. The "Endgame Expert" achievement now counts. Reviews with "Not my game" add nothing.

## Storage

IndexedDB `DB_VERSION` 3 adds a `reviews` store (key `gameId`). Existing stores are not touched. Backups gain an optional `reviews` array (only written when non-empty); `BACKUP_VERSION` stays 3, so older backups import unchanged and invalid reviews in a backup are dropped. Deleting a game deletes its review and activity record.

## Preparing for later features

`learningItems(analysis)` (`src/review/notebook.ts`) returns the player's mistakes as items with stable ids (`<gameId>:<ply>`), position before the move, the move played, the engine's move and line, class, phase and verified tags. The planned Mistake Notebook and personalised Puzzle Trainer can be built on it without changing what is stored.

## Limits (stated honestly)

* The engine reports one line per position (no MultiPV). "Alternatives" are the engine's line versus the line after the move played. Other good moves are not listed.
* There are no "brilliant" or "great move" labels: they cannot be justified without comparing several candidate moves.
* A search of limited depth can be wrong. Treat verdicts as strong hints.
* Quick is much less reliable in sharp positions than Thorough.
* The IndexedDB 2→3 upgrade is exercised in the browser tests only (a fresh database); the node tests use the in-memory store.

## Tests

`tests/review-*.test.ts` (scoring, classification, tags, explanations, summary, runner, storage, backups, and real Stockfish positions) and `tests/e2e/review.mjs` (`npm run test:e2e:review`: import, review offline, reload, reopen, Profile, delete).
