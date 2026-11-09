# Bot levels and their ratings

MoveWise has 25 bot levels, **Bot 100 to Bot 2500 in steps of 100**. The numbers are **approximate MoveWise bot ratings**. They are not Elo, FIDE, chess.com or Lichess ratings, they were not measured against people, and they should not be compared with those.

| Levels | Category | Plays with | Counts toward your MoveWise Rating |
| --- | --- | --- | --- |
| 100 to 900 | Practice | the built-in engine | No |
| 1000 to 1300 | Competitive | the built-in engine | Yes |
| 1400 to 2500 | Competitive | Stockfish 19 (lite) with its strength limiter, 400 ms per move | Yes |

Play with Trainer games never count, at any level. Practice, competitive and Trainer games have separate statistics on the Profile page.

## How the levels are made

**Levels 100 to 1300 (built-in engine).** The built-in engine searches to a fixed depth and then picks among its candidate moves with a randomness setting ("mistake temperature"). Each level is a pair of (depth, temperature), listed in `src/engine/levels.ts`. The pairs were chosen like this:

1. 22 configurations of the engine (depth 1 to 4, several temperatures each) played about 600 games against one another (`scripts/calibration/family.mts`; raw games in `docs/calibration-ladder/fam_*.jsonl`).
2. A Bradley-Terry maximum-likelihood fit (`scripts/calibration/fit-ladder.mts`) placed all 22 on one scale. The scale was anchored by pinning one member to 1410, a rough value taken from its 5 out of 8 against Stockfish limited to 1320.
3. For each of the 13 rungs, the settings were read off the fitted curve, interpolating the temperature between measured configurations (log scale).

**Levels 1400 to 2500 (Stockfish).** These use Stockfish's own `UCI_LimitStrength` and `UCI_Elo` options at the level's number, with 400 ms per move. Stockfish's limiter accepts 1320 to 3190, which is why the built-in engine covers everything below 1400. These levels are "Stockfish held back to that setting". They are sound on average but can play odd moves a person of that strength would not, and the limiter's scale is the engine's own (calibrated by its authors on engine-versus-engine games), not a human scale. Strength also depends on the device, because the move time is fixed: a slower device searches less.

Stockfish is never silently replaced. If it cannot start, Stockfish levels say so and the game does not start on a weaker engine under a stronger name.

## Evidence

All games are in `docs/calibration-ladder/`. Games longer than 140 plies, or with a lead of 10 pawns held for 10 plies, were adjudicated by material.

**Rung against the rung 200 below it** (`verify-*.jsonl`; stronger rung's result; W-D-L):

| Pair | Games | W-D-L | Score | Implied gap (Elo model) |
| --- | --- | --- | --- | --- |
| 100 v 300 | 12 | 11-0-1 | 0.92 | 417 |
| 200 v 400 | 12 | 7-1-4 | 0.63 | 89 |
| 300 v 500 | 12 | 10-0-2 | 0.83 | 280 |
| 400 v 600 | 12 | 9-0-3 | 0.75 | 191 |
| 500 v 700 | 12 | 10-0-2 | 0.83 | 280 |
| 600 v 800 | 12 | 11-0-1 | 0.92 | 417 |
| 700 v 900 | 12 | 7-5-0 | 0.79 | 232 |
| 800 v 1000 | 12 | 10-0-2 | 0.83 | 280 |
| 900 v 1100 | 12 | 7-2-3 | 0.67 | 120 |
| 1000 v 1200 | 12 | 12-0-0 | 1.00 | above 300 |
| 1100 v 1300 | 12 | 11-0-1 | 0.92 | 417 |
| All | 132 | | 0.83 | about 270 |

Reading this honestly: **the ordering holds** (every rung beat the rung 200 below it, in every pair). **The spacing is not 100 per step**: on average a rung scored 0.83 against the one 200 below, which on the usual Elo model is a gap of about 270 rather than 200, so one step is more like 100 to 170 than exactly 100. With 132 games the average has an uncertainty of roughly plus or minus 0.05 in score, and each single pair (12 games) is much looser, so individual gaps in the table are noisy. Some of this run shared the machine with other work, which can shift timed searches. A clean overall conclusion is: ordered reliably, spacing only roughly 100 per step.

**Against Stockfish limited to 1320** (150 ms per move, `anc_*.jsonl`):

| Built-in level | Games | Score for the built-in level | Rough placement on Stockfish's scale |
| --- | --- | --- | --- |
| Bot 1100 | 12 | 0.29 | about 1165 |
| Bot 1200 | 12 | 0.29 | about 1165 |
| Bot 1300 | 16 | 0.50 | about 1320 |

Bot 1100 and Bot 1200 landed at the same place, which is within the noise of 12 games each (about plus or minus 100 points) but also shows how coarse this is. Bot 1300 matching Stockfish 1320 is the anchor that the top built-in rung rests on, and it comes from 16 games.

Earlier configurations of the engine, used to check that the anchor is sensible (`a_*.jsonl`, `b_*.jsonl`): the old Beginner, Easy and Casual levels scored 0 out of 24 against Stockfish at 1320; the old Intermediate scored 5 out of 8; the old Advanced scored 8/8 against 1320, 6/6 against 1500 and 3/6 against 1800.

## Uncertainty used in the rating

When a game against a bot is rated, the bot is treated as an opponent with a rating deviation of 120 (built-in levels) or 90 (Stockfish levels) in Glicko-2 (`src/engine/ladderCalibration.ts`). These are deliberately wide, so one result against a bot moves your rating by less than it would if the bot's number were exact.

## What to trust, and what not to

- The **order** of levels is solid; the **numbers** are approximate and the built-in spacing is probably wider than the labels suggest.
- A "Bot 1000" is not "a 1000-rated person". Built-in bots make blunders of a kind people do not (they ignore recaptures at low depth, then play well); the Stockfish limiter makes a different kind of odd mistake.
- Levels 1400 and above are not tested game by game here. Their strength is what Stockfish's limiter documents; the check above reaches only up to the 1320 floor.
- Results were measured on a small cloud machine. On a much faster or slower device the time-capped built-in levels, and all Stockfish levels, will play somewhat stronger or weaker.

## Levels saved by older versions

| Old level | Now | Basis |
| --- | --- | --- |
| Complete Beginner | Bot 400 | approximate |
| Easy | Bot 700 | approximate |
| Casual | Bot 1000 | approximate |
| Intermediate | Bot 1400 | measured: close to Stockfish 1320 |
| Advanced | Bot 1800 | measured: 3/6 against Stockfish 1800 |
| Expert, Maximum | Bot 2000 | not measured; placed above Advanced |

## Re-running

```bash
npx tsx scripts/calibration/family.mts 0 2 10 out.0.jsonl     # 22-configuration round robin (shard 0 of 2)
npx tsx scripts/calibration/fit-ladder.mts 20 1410 out.0.jsonl out.1.jsonl
npx tsx scripts/calibration/ladder.mts 100 300 12 out.jsonl 21  # rung against rung
npx tsx scripts/calibration/anchor.mts r1300 1320 16 150 out.jsonl 11   # against limited Stockfish
```

The older relative calibration (`docs/calibration.md`) describes the previous seven levels and is kept for history.
