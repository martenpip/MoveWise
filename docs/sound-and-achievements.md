# Sound and achievements (v0.3)

## Sound

### How it works
Every sound is **synthesised on the device with Web Audio**. There are no audio files, no downloads and no external URLs, so sound works offline by construction and adds nothing to the precache.

| Piece | File | Job |
| --- | --- | --- |
| Sound names, categories, priorities, preferences | `src/audio/kinds.ts` | `SoundKind`, `SoundPrefs`, `sanitizeSoundPrefs`, `gainFor` |
| Decision layer | `src/audio/manager.ts` | Whether and when a sound plays: category switches, volumes, priority, overlap, waiting for earlier sounds |
| Chess state to sound | `src/audio/moveSound.ts` | `soundForMove(info)` and `replaySound(moves, from, to, prefs)` |
| Recipes | `src/audio/recipes.ts` | One function per sound. Runs on any `BaseAudioContext`, so tests render it in an `OfflineAudioContext` |
| Browser backend | `src/audio/webaudio.ts` | The real `AudioContext`, autoplay handling, a compressor on the output bus |

The manager has no Web Audio code in it (it talks to a small `SoundBackend` interface), which is why its rules are unit-tested with a fake backend.

### Sounds are driven by real state, not by the UI
`Game.play()` asks the rules engine what the move did and returns `MoveInfo { capture, castle, promotion, check, checkmate }`. A sound is chosen from that, with priority checkmate > check > promotion > castle > capture > move. A capturing promotion is one promotion sound, not two. A move that mates is checkmate, not check. Human moves and bot moves go through the same path.

### When nothing plays
- On load, on resume of a saved game, and when a game is opened: silent. Nothing is triggered by rendering.
- Jumping to a position (first/last, clicking the move list) is silent. Only a **single step forward** sounds, and only if "Sound when stepping forward" is on. Stepping back or taking back sounds only if "Sound when stepping back" is on (off by default).
- Master off silences everything, including previews' category checks (a preview still respects master and volume, but ignores the board/interface/achievement switches so you can hear what you are about to turn on).

### Overlap
- Sounds closer than 70 ms apart: an equal or weaker one is dropped; a stronger one plays.
- Priorities: select 1.5, interface 1, illegal/move/capture/castle/game result 2, promotion/check 2.5, checkmate 3, achievements 4.
- An achievement sound waits for a ringing board sound to fade (at most 2.5 s) instead of stepping on it.

### Autoplay
Browsers only allow audio after a user gesture. The backend creates or resumes the `AudioContext` on the first `pointerdown`, `keydown` or `touchstart`. Sounds requested before the context is running are **dropped, not queued**, so they never play late. Consequence: the very first click on a page may be silent.

### Settings
Settings → Sound: master switch; board, interface and achievement switches; optional piece-pickup tick; replay and take-back switches; master, board and interface volume sliders (releasing a slider plays a sample); preview buttons for the main sounds; "Reset sound preferences". Preferences are saved in IndexedDB with the other settings, are part of backups, and apply immediately. Default master volume is 70%.

### Adding a sound
1. Add the name to the right list in `kinds.ts` (and `SOUND_META` with its priority).
2. Add a recipe case in `recipes.ts` returning its length in seconds.
3. Run `npm run test:sound`. It renders every sound offline and fails if one is silent, clips, rings longer than declared, or is nearly identical to another.
4. Call `playSound('yourKind')` from the UI. Use a chess-state transition, never a render.

## Achievements

### Model
- The **registry** (`src/profile/achievementDefs.ts`, `getAchievementDefs()`) holds definitions with stable ids. A definition is a pure function from saved data to `{ current, target, unit, at }`.
- **Unlocks are stored**: `AchievementState { version, initialisedAt, unlocked: [{ id, unlockedAt, recordedAt }] }` in IndexedDB (key `achievements`), exported and imported with backups (backup version 3; versions 1 and 2 still import).
- `syncAchievements(prev, data, now)` is pure and **idempotent**: calling it twice with the same data reports nothing the second time. `checkAchievements(store)` runs it against storage and is queued per store, so two quick calls can never announce the same unlock twice.
- **Migration:** the first time it runs on a device, existing history is recorded **silently** with its original dates. Older backups without achievements are re-derived the same way.
- **Permanence:** an unlock is never removed, not by deleting games, restarting the rating, or a time-zone change. Importing merges (an unlock in either place is kept, at its earliest time).

### What counts
- Only finished games the player played against a bot count (wins, losses, draws and resignations). **Games imported from PGN files never count** (they have no human side), and a game restored from a MoveWise backup keeps counting because it is the player's own history.
- Results streaks are consecutive finished games; a draw ends a winning or losing run.
- **Rating achievements ignore noise:** they need at least 10 rated games, and "Level Up" needs the milestone on two games in a row; "Personal Best" needs the new peak to beat the old one by 25 points; "Improvement" needs +150 over a 20-game window.
- **Training days** are local calendar days (the calendar-day number is computed from local year/month/day, so daylight-saving changes cannot split or merge days). Several games on one day are one day.
- **Puzzle, lesson and review achievements are inactive** (`FEATURES` in `src/profile/features.ts` is false for each). They appear greyed with "Not available yet" and the reason; stray records for a missing feature earn nothing. Flip the flag when the feature ships.

### Adding achievements later
```ts
import { registerAchievements } from './profile/achievements';
registerAchievements([{ id: 'my-new-id', category: 'tactics', title: '…', description: '…', condition: '…',
  icon: 'star', rarity: 'common', requires: 'puzzles', evaluate: (ctx) => ({ current, target, unit: 'x', at }) }]);
```
Ids must be unique and never reused. Duplicates throw. Core definitions live in `achievementDefs.ts`; the Profile page, notifications and backups pick up new ones automatically.

### Presentation
- Profile → Achievements: filter (All / Unlocked / Locked), grouped by category, each card with badge, description, state, unlock date or progress ("23 / 50", bar, percentage). Selecting one opens a detail dialog (condition, status, rarity, progress). Esc closes it and focus returns.
- Unlock notification: a toast with the badge, name, description and "View details". Up to three at once, then "…and N more". It does not block play (it is not modal and ignores pointer events outside itself). Rare unlocks get a longer sound and confetti. With `prefers-reduced-motion` all animation and confetti are removed.
- Sounds: a normal unlock, a fuller rare unlock, a game-result sound, and a notice sound with a toast for a **personal best**. Turning achievement sounds off keeps the visual notification.
- The first-run migration, an import, and a backup restore never announce anything.

## Tests
| What | Where |
| --- | --- |
| Sound manager, move classification, replay rules, preference sanitising and persistence | `tests/sound.test.ts` |
| Every synthesised sound rendered offline in Chromium and measured | `tests/sound-render.mjs` (`npm run test:sound`) |
| Achievement thresholds, progress, idempotence, persistence, migration, export/import, inactive features, registry, streaks across DST, time-zone changes | `tests/achievements.test.ts` |
| Real browser, network off: which sound plays for each move type including bot moves, no sound on load, no duplicate replay sounds, mute and category switches, persistence, preview, reset, unlock toast with and without achievement sound, backup round trip, reduced motion | `tests/e2e/sound-achievements.mjs` (`npm run test:e2e:sound`) |

## Limitations (please read)
- **The board sounds were softened after a first listen on a phone.** The first version was a sharp, hollow "knock" that was described as a tin can being slammed down. The move sound is now a soft thump: a rounded low body with a slower attack (no click at the start), a quiet wooden overtone that a phone speaker can actually reproduce, a muffled touch of felt, and a very quiet second note as the piece settles. Measured against the old sound: the peak is lower (0.35 against 0.50), the peak-to-average ratio is half (about 10 against 20, so it is much less spiky), and the energy sits lower and warmer (centre of the spectrum about 320 Hz against 445 Hz, with a body of 64% under 300 Hz and 36% above). Captures, castling, check, checkmate and promotion use the same thump, lower and heavier for captures. These are measurements, not a verdict: whether it now sounds good is still a matter of ear. Tune `knock()` in `recipes.ts`.
- **Nobody except one person on one phone has listened to the sounds.** They were designed against measured spectra, envelopes, loudness and clipping checks, and the tests check that each is audible, distinct and well-behaved. Whether they sound pleasant on real speakers is unverified. Recipes are parameterised (`knock()` in `recipes.ts`) so they are easy to tune by ear.
- The first click on a page may be silent while the browser lets the audio start. Sounds that arrive before it is running are dropped on purpose.
- The e2e tests prove which sound is *requested* from the real audio backend at the right moment in a running AudioContext. They cannot prove audible output.
- The old on/off sound setting from v0.2 is not carried over; everyone starts with the new defaults.
- "First Lesson" and "Student of Chess" were merged into one, and some v0.2 achievement ids were replaced. v0.2 never stored unlocks, so nothing stored is affected.
- Backups are trusted: a hand-edited backup can contain fake games or unlocks. This is a local app with no leaderboard, so nothing is gained by it.
- Streaks use the **current** local calendar. If you travel, past days keep the dates they were played on (stored as timestamps), and an unlock already earned is never taken away.
