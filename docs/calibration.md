# Bot strength calibration

The MoveWise rating needs an opponent strength for every bot level. This file records how those numbers were measured and how far to trust them.

## Method

- `scripts/calibration/play.ts`: level-versus-level games on the built-in engine (balanced style, alternating colours, from the standard start). Games longer than 110 plies, or with a 10-pawn material lead held for 10 plies, are adjudicated by material (`how` in the data says which).
- `scripts/calibration/bridges.ts`: the shipped levels are so far apart that adjacent-level matches were sweeps (8–0), and a sweep only gives a lower bound. So nine measurement-only "bridge" opponents were added: the same engine with in-between depth and randomness settings. They are never offered in the app.
- `scripts/calibration/extra.ts`: extra Expert-vs-Maximum games on an otherwise idle machine, because both levels are time-capped and CPU contention distorts them.
- `scripts/calibration/fit.ts`: a logistic (Elo) maximum-likelihood fit, with one virtual draw between adjacent levels as a weak prior and standard errors from the Fisher information. It writes `src/engine/calibration.ts`. Raw games are in `docs/calibration-*.jsonl`.

Total: 278 games (210 adjudicated).

## Result (relative to Complete Beginner = 0)

| Level | Relative strength | ± 1 s.e. | Games |
| --- | --- | --- | --- |
| Complete Beginner | 0 | 0 | 30 |
| Easy | 997 | 274 | 54 |
| Casual | 1742 | 346 | 58 |
| Intermediate | 2228 | 372 | 59 |
| Advanced | 2885 | 412 | 38 |
| Expert | 3244 | 451 | 23 |
| Maximum | 3260 | 454 | 18 |

On the profile scale these are shifted so Complete Beginner = 400 (`SCALE_ORIGIN`), and each bot's uncertainty is passed to Glicko-2 as its rating deviation (clamped to 40–250).

## What to trust, and what not to

- **Ordering is solid** from Complete Beginner to Advanced. Each level beat the one below it essentially every time.
- **The spacing is a lower bound.** The levels are far enough apart that results saturate, so the gaps are larger than the games can measure. That is why the standard errors are large and the spread (3,000+ points) is far wider than any human rating range. The numbers describe these bots against each other. They are **not** comparable with FIDE or online ratings, and not measured against Stockfish or people.
- **Expert and Maximum are statistically tied** (Expert scored 6.5 / 13 against Maximum). Maximum's extra time (5 s versus 2.5 s per move) does not currently make it measurably stronger. The README's "Maximum Strength" means the strongest setting of this engine, not a clearly stronger bot than Expert. The fit never ranks a level below the one before it, so the two are presented as equal.
- **Time-limited levels depend on device speed.** Results were measured on a 2-core sandbox. A faster device will make the higher levels stronger.
- **The scale origin is a convention.** "Complete Beginner = 400" and "new player starts at 800" are choices, not measurements.

## Re-running

```bash
npx tsx scripts/calibration/play.ts 0 2 docs/calibration-games.0.jsonl   # and shard 1; resumable
npx tsx scripts/calibration/bridges.ts 0 2 docs/calibration-bridges.0.jsonl
npx tsx scripts/calibration/fit.ts docs/calibration-games.*.jsonl docs/calibration-bridges.*.jsonl
```

Then run `npm test`: the rating tests check ordering and that suggested opponents are sensible. Do not run other heavy jobs at the same time.

## What would improve it

Playing the bots against Stockfish at fixed, known strengths (not possible here: Stockfish could not be installed), or collecting many real human results to fit the bots' strengths from the other side.
