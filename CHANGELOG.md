# Changelog

## 0.8.0

Changes after the first look on a real phone
- New piece set, "Gloss": chunkier, rounded pieces with a heavy outline, a gradient body, a shaded side and a bright highlight. The silhouettes are original to MoveWise, not traced from or copied from any other set.
- On a phone the moves now sit in one scrolling row directly under the board, with previous, next and flip buttons, so the game can be followed without scrolling. The full list stays in the side panel on larger screens.
- Sound: the piece-placement sound is now a soft, warm thump instead of a sharp hollow knock (slower attack, lower and rounder, with a quiet wooden overtone so it still comes through a phone speaker). Measured, not yet judged by ear. See docs/sound-and-achievements.md.
- Trainer on a phone: the "Before you play that move" warning, with Let me reconsider and Play the move anyway, now appears right under the board and is on screen without scrolling. New browser test: `npm run test:e2e:phone`.
- A small vibration when a piece moves (Settings, on by default, phones only). Android uses the Vibration API. iPhone has no such API, so a light tap is attempted for your own moves only; that is a workaround and was not tested on a real device.
- Board: a piece that had already slid across the board slid again when the next move was played, so pieces seemed to jump back and forth. Each move now slides exactly once. New browser test: `npm run test:e2e:board`.
- Spoken coaching: installed voices the system labels Enhanced, Premium, Natural or Neural are now offered first when you have not picked a voice yourself. The default voices on phones are often the plainest ones. See docs/trainer.md for how to install better voices.

Pre-release hardening (no new features)
- Accessibility: fixed the issues axe-core found (captured-piece labels, Profile definition lists, missing page headings on game screens, heading order on Analysis and in the Trainer panel, a keyboard-unreachable scrolling table). See docs/accessibility.md.
- Stockfish bot levels now say that they were not measured game by game in MoveWise.
- Settings no longer said that bots always use the built-in engine.
- Added tests: speech against the real browser API (no voices available), backup and restore of Trainer settings and Trainer games, and the old-backup import path. Added keyboard and axe audit scripts.

Added
- Mistake Notebook: positions from your own games, saved automatically (selectively) or by hand from Game Review, practised with hints and scheduled with spaced repetition. Filters, insights, export and import. Practice positions from older versions are carried over. See docs/notebook.md.
- Play with Trainer: the Trainer warns before a serious blunder (Let me reconsider or Play the move anyway), comments on key moments, and is always unranked. See docs/trainer.md.
- Optional spoken coaching with the browser's built-in speech synthesis only: on-device voices, male or female preference, preview, replay, stop, volume, honest fallback messages. Off by default.
- Bot ladder of 25 levels, 100 to 2500 in steps of 100. 100 to 900 are practice only; 1000 and above are competitive. Levels up to 1300 use the built-in engine, 1400 and above use Stockfish with its strength limiter. See docs/bots.md for the evidence and its limits.
- A results screen after every game with an invitation to review, and separate statistics for competitive, practice and Trainer games.
- Home page: what you can do now, what to practise, how you are improving.
- Navigation of six items: Play, Puzzles, Learn, Game Review, Mistake Notebook, Profile.
- GitHub Pages deployment workflow, a sub-path test, and installation and deployment notes.

Changed
- The old seven levels map to ladder levels so saved games keep a sensible opponent: Complete Beginner to Bot 400, Easy to 700, Casual to 1000, Intermediate to 1400, Advanced to 1800, Expert and Maximum to 2000. Only Advanced was measured against Stockfish; the others are approximations.
- The MoveWise Rating now uses the ladder strengths. Practice bots and Trainer games never change it.
- Academy: the Lucena lesson uses a genuine Lucena position with an engine-checked bridge line; the Philidor lesson has a checked position and a first-rank exercise; the opposition lesson has an exercise whose only winning move is checked; triangulation is described honestly.
- The offline-status chip no longer widens the page on a 360 px screen.

Data
- IndexedDB version 6 (adds the notebook store). Backups stay at version 3 with optional fields, so older files import and older apps ignore the new fields.
