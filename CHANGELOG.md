# Changelog

## 0.8.0

Changes after the first look on a real tablet
- Puzzles on a tablet: the whole board is now on screen (it used to be cut off at the bottom), and the board and the side cards fill the width like on the other pages.
- The side cards now start level with the top of the board on Play, Puzzles, Analysis, Games and Review (they used to float a little above it).
- Game Review looks more like a coach: a line above the board ("Nf6 is a blunder", the best move, the evaluation), a verdict badge on the piece's square (brilliant !!, best ★, good ✓, inaccuracy ?!, mistake ?, blunder ??), and a "Show best move" button after a weak move, which goes back to the position before the move and draws the engine’s move there as a green arrow (an arrow drawn on the position after the move could point at a move that was no longer possible). "Brilliant" is new and strict: the engine's own choice that gives up a piece or more and still leaves you at least level and not already winning. The names are the ones chess.com uses; "okay" is Inaccuracy and "bad" is Mistake. Tests: `tests/review-brilliant.test.ts`, and the review and tablet browser tests.
- Tablet layout: on a landscape tablet the board is as large as the screen height allows and the side cards now fill the width that is left, instead of leaving about 270 px of empty space between them. New browser test: `npm run test:e2e:tablet`.
- New piece set, "Flat", replacing "Gloss": minimalist pieces with one flat colour, a thin outline and one quiet shaded half, no gradients. Each is recognised by its silhouette (ball-on-a-stem pawn, three-notch tower, horse head, slit mitre, five-pointed beaded crown, cross on a bell), so they stay distinguishable at small sizes. Original to MoveWise.
- Sound: the piece-placement sound is rebuilt to resemble a wooden piece set down on a wooden board: a crisp contact click, a short wooden "tock" made of quickly dying inharmonic resonances, a hollow thud of the board and a tiny settling tick. Captures are lower and heavier. Measured, not yet judged by ear. See docs/sound-and-achievements.md.

Changes after the first look on a real phone
- Piece set "Gloss": chunkier, rounded pieces with a gradient body (replaced by "Flat" in the tablet round above).
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
