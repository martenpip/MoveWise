# Third-party notices

Versions below match `package-lock.json`. Before a release, re-check licences against the exact versions in your lockfile.

## Shipped in the application bundle

| Package | Version checked | Licence | Used for |
| --- | --- | --- | --- |
| react | 19.3.1 | MIT | UI |
| react-dom | 19.3.1 | MIT | UI |
| scheduler | 0.27.0 | MIT | React internals |
| stockfish (Stockfish.js) | 19.0.1 | GPL-3.0 | Chess engine for Analysis: only `stockfish-19-lite-single.js` and `.wasm`, unmodified |

The MIT licence requires that the copyright notice and permission text travel with copies of the software. The build copies each package's own `LICENSE` file into the app as `licenses/react-LICENSE.txt`, `licenses/react-dom-LICENSE.txt` and `licenses/scheduler-LICENSE.txt`, next to the Stockfish and MoveWise licences.

### Stockfish

- **Package:** `stockfish` 19.0.1 on npm (Stockfish.js, maintained by nmrugg, wrapping Stockfish 19 by the Stockfish developers). Pinned exactly in `package.json`; resolved in `package-lock.json`.
- **Licence:** GPL-3.0. Full text in `LICENSE` (shared with MoveWise, itself GPL-3.0-or-later) and shipped as `licenses/Stockfish-COPYING.txt` in the app.
- **Shipped:** only the lite single-threaded build (`stockfish-19-lite-single.js`, `stockfish-19-lite-single.wasm`), byte-identical to the npm package. No other build is included.
- **Corresponding source:** Stockfish.js tag `v19.0.1` (commit 0d5dd7944f88c817c07a26bc4fb1905d5f9c46d6), <https://github.com/nmrugg/stockfish.js/tree/v19.0.1>; Stockfish tag `sf_19` (commit edb0d9db6731067ec50ce619ff372b463bc4dd5d), <https://github.com/official-stockfish/Stockfish/tree/sf_19>. The npm package does not record a git commit, so the link between package and tag is by version number. The same pointers ship in the app as `licenses/Stockfish-SOURCE.txt` and are linked from Settings → Engines.
- If you modify or rebuild the engine, you must publish your corresponding source under GPL-3.0.

## Development tooling (not shipped)

| Package | Version checked | Licence |
| --- | --- | --- |
| esbuild | 0.25.12 | MIT |
| typescript | 5.9.3 | Apache-2.0 |
| tsx | 4.23.15 | MIT |
| playwright | 1.63.0 | Apache-2.0 |

## Original to this project

Chess rules engine, search engine, evaluation, board component, piece set ("Gloss", drawn from scratch as code in `src/ui/pieceShapes.ts`), Glicko-2 implementation (from the published algorithm description), opening list, logomark, service worker, styles and all copy.

All sounds (`src/audio/recipes.ts`) are original: synthesised from oscillators and noise at run time, with no samples or recordings. Achievement badges are original SVG drawn in code (`src/ui/AchievementBadge.tsx`). No new dependencies were added in v0.2 or v0.3; Stockfish was added in Phase 1. The rating algorithm is Glickman's public method, implemented independently. Game Review (Phase 2, `src/review/`) adds no dependencies: its win-chance and move-accuracy formulas are the published Lichess formulas (constants only, implemented independently, no code copied), and its thresholds, tags and explanations are original.

## Puzzle data (Phase 3)

`public/puzzles/lichess-starter.json` (2,771 puzzles) is a selection from the **Lichess puzzle database**, <https://database.lichess.org/#puzzles>, which Lichess publishes under **CC0 1.0** (public domain dedication). Puzzle ids, positions, solutions, ratings and theme tags are Lichess's; MoveWise credits Lichess in the pack and on the Collection page although CC0 does not require it. Every position and solution was re-validated with MoveWise's rules engine, and non-mate puzzles were checked with Stockfish. Provenance, selection and checking are described in [docs/puzzles.md](docs/puzzles.md) and `docs/puzzle-pack-report.json` (which records the SHA-256 of every source slice). Phase 3 adds no code dependency. The Glicko-2 puzzle rating reuses MoveWise's own implementation of Glickman's published method.

## Not included

- **Chessground** (GPL-3.0): not used; the board is original.
- No fonts, icon libraries, analytics, remote scripts or audio files are included or loaded.

## Academy exercises (Phase 4)

Some Academy exercises (`src/academy/content/tactic-positions.ts`) use positions and solutions taken from the Lichess puzzle database, which Lichess releases under CC0 1.0. They are credited in the same way as the puzzle pack. Lesson text, questions and explanations are original. No new dependency was added. The v0.7.1 puzzle-motif checker (`src/puzzles/motif.ts`) and the new courses are original work and add no dependency.


## Phase 5 (v0.8.0)

The Mistake Notebook, the Trainer, the bot ladder, the Home page and the release tooling are original work and add no dependency. Spoken coaching uses the browser's built-in Web Speech API (`speechSynthesis`); MoveWise ships no voices, no speech engine and no audio files, and sends nothing to any speech service. Stockfish (already listed above) now also plays the bot levels from 1400 up through its own `UCI_LimitStrength` and `UCI_Elo` options; it is the same unmodified build. The Lucena, Philidor and opposition exercises are original positions checked with that Stockfish build. The sample games used in the README screenshots were played by MoveWise's own bots.
