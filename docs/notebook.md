# Mistake Notebook

The Mistake Notebook keeps positions from your own games where a move cost you, and brings them back at spaced intervals until you can find the better move without help. Everything is stored on this device (IndexedDB). Nothing is uploaded.

## What gets saved

Saving from a Game Review is automatic by default (a switch in the Notebook turns it off) and deliberately selective. A move is saved only if all of these hold:

- it was your own move, it was a real decision (not the only legal or forced move), and the engine had a better move to compare against;
- it gave up at least the "mistake" amount of winning chances (the same thresholds Game Review uses: inaccuracy 5 points, mistake 10, blunder 15; inaccuracies are never saved automatically);
- the position was not already lost before your move, and you were not still clearly winning afterwards.

At most five positions are saved automatically from one game, worst first. In Game Review you can also save any single move by hand, or save all of a game's candidates. The same position is stored once: if it comes up again in a later game, the new game is added to its history instead of creating a duplicate.

Each entry records the position, your move, the better move, why it matters in plain words, a mistake kind and severity, themes (for example fork, hanging piece, endgame), the game it came from, and a link back to that game. Deleting a game does not delete its Notebook entries.

## How practice works

You see the position and must find a good move. Hints come in three steps: the idea to look for, then the target or key square, then which piece to move (the piece and its square, highlighted on the board, but not the destination). You can reveal the answer at any time. A different strong move is accepted if the engine judges it about as good; the page says so when this happens.

Each attempt is graded from what actually happened:

| Grade | What happened | Next review |
| --- | --- | --- |
| Failed | A wrong move was final, or the answer was shown | In 10 minutes, ease falls |
| Hard | Solved with the direct hint, or three or more wrong tries | About 1 day, then 1.2 times the last gap |
| Good | Solved with a small hint or on the second try | 1 day, then 3 days, then gap times ease |
| Easy | First try, no help | 3 days, then 7 days, then gap times ease times 1.3 |

The scheduler is a small adaptation of SM-2 (ease between 1.3 and 3.0, intervals capped at 365 days). It is pure code with unit tests; it never reads the clock itself.

A position counts as **retained** after three successful recalls in a row with a gap of at least 21 days. That is a statement about how you did on this exercise, not a claim that you will never make the mistake again.

## Views and filters

All, Due, Upcoming, Recent, Retained and Needs practice, with filters for theme, severity, status, date and game. A practice session takes at most ten positions due today.

## Insights

The Notebook points out a pattern (for example "missed several knight forks recently") only when at least three distinct saved positions of one kind fall within the last 90 days. It says what happened, not what kind of player you are, and links to Academy lessons and puzzle themes that exist in the app.

## Backup

Notebook entries are part of the export and import (an optional field, so older backup files still import). On import each entry is merged by its last-updated time, so importing never overwrites newer progress. Practice positions saved by older versions (v0.5 to v0.7) are copied into the Notebook when the database upgrades.

## Limits

- Only reviewed games produce entries, and review quality depends on the engine that ran (Stockfish when available, the built-in engine otherwise; the Review page says which).
- The explanation text is generated from facts the engine and rules code can verify. It is intentionally modest and can miss the deeper reason.
- The scheduler has not been tuned on real learner data.
