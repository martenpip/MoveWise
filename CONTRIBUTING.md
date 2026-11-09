# Contributing to MoveWise

MoveWise exists so that anyone can learn chess for free. Contributions that make it clearer, more correct, more accessible or more useful for learners are welcome.

## Ground rules

1. **Correctness first.** Anything touching chess rules must keep `tests/perft.test.ts` and `tests/rules.test.ts` passing. New rules behaviour needs a test.
2. **Offline and private by default.** No analytics, no remote fonts/scripts, no network calls for normal use. `tests/e2e/offline.mjs` asserts zero external requests; keep it green.
3. **No fake features.** Don't add buttons that do nothing, placeholder statistics or hard-coded "analysis". If something is unfinished, say so in the UI and in the README status table.
4. **Teach the why.** Educational text should explain ideas, be original (don't copy lessons from other sites), and never make a beginner feel foolish.
5. **Ratings are honest.** Never present the MoveWise rating as FIDE/online, never show statistics that are not computed from saved data, and keep sample sizes visible.
6. **Licences matter.** Check the licence of any dependency, dataset or asset before adding it and record it in `THIRD_PARTY_NOTICES.md`. Don't add anything that can't be redistributed under the project licence.

## Workflow

```bash
npm install
npm run check          # typecheck + unit tests + sound render + build + offline e2e (both)
npm run test:contrast  # text contrast in both themes
```

- Keep chess logic in `src/chess` and engine logic in `src/engine`; neither may import from `src/ui`.
- Engine work runs only in the Web Worker. Cancel through `EngineClient.cancel()`.
- Prefer small, focused pull requests with a clear description of the behaviour change.

## Sounds and achievements

- A sound is added in `src/audio/` (name, priority, recipe) and must be triggered by a chess-state transition or a user action, never by rendering. `npm run test:sound` fails if it is silent, clips or duplicates another sound. See [docs/sound-and-achievements.md](docs/sound-and-achievements.md).
- An achievement is a stable id plus a pure function of saved data, added with `registerAchievements` (or in `achievementDefs.ts`). Ids are never reused. Achievements for a feature that does not exist stay inactive (`FEATURES`) and must not be rewarded from stray records. Never reward something that rating noise alone can produce.
- Both need unit tests; anything user-visible needs a step in `tests/e2e/sound-achievements.mjs`.

## Good first areas

Lessons and puzzle content (original, with legal solution lines validated by tests; they should write `ActivityEvent` records so the profile can show them), additional piece sets (add data in `src/ui/pieceShapes.ts`), board arrows and annotations, opening recognition, accessibility improvements, and engine strength calibration.
