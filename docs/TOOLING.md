# Tooling: what was attempted, what failed, what it affects

This iteration was built in a sandbox with **no outbound network for package managers**. Nothing new was installed, and nothing in this file claims otherwise.

## What was attempted

`npm view <pkg>` and `npm install` against `https://registry.npmjs.org` fail in that sandbox:

```
npm error code ENOTFOUND
npm error syscall getaddrinfo
npm error network request to https://registry.npmjs.org/eslint failed, reason: getaddrinfo ENOTFOUND registry.npmjs.org
```

Earlier install attempts (offline cache mode) failed with `ENOTCACHED` for every requested package. The machine's own tool folders were also searched. None of the following exist anywhere on it.

| Requested | Result | Effect on this project |
| --- | --- | --- |
| Stockfish WASM (`stockfish`) | not installable, not found locally | **Update (Phase 1): installed.** `stockfish@19.0.1` is now a pinned dependency (with a complete `package-lock.json`) and powers Analysis. The built-in engine still plays the bots. The row above describes the earlier sandbox, where it could not be installed. Originally: analysis was shallower than Stockfish's, and there is no accuracy / ACPL / blunder statistic, because nothing honest can produce it yet. The Profile page says "Not available yet". |
| chess.js, chessground | not installable | Not needed: MoveWise has its own rules engine (perft-tested) and an SVG board. This also avoids two dependencies and the GPL question for chessground. |
| ESLint, Prettier | not installable | Substitute: `tsc` in strict mode with `noUnusedLocals` / `noUnusedParameters` / `noFallthroughCasesInSwitch` (`npm run typecheck`). No automatic formatting or lint rules beyond that. An `.editorconfig` is included. |
| Vitest | not installable | Tests use the Node built-in runner via `tsx --test` (`npm test`). |
| axe-core | not installable | Substitute: `scripts/contrast-audit.mjs` checks WCAG AA text contrast on every page in both themes. This is **not** a full axe audit. It does not check ARIA structure, focus order or touch targets. |
| Icon / chart / form / UI libraries (lucide, recharts, react-hook-form…) | not installable | Icons are hand-written SVG (`src/ui/icons.tsx`). Charts are dependency-free (`src/ui/charts.tsx`). The profile form is plain React with validation. |
| `npm audit` | needs the registry | Not run. The shipped bundle's only runtime dependencies are `react` and `react-dom`. |

Local packages that happen to be present (`d3`, `zod`, `react-aria`) were deliberately **not** used. They are not in `package.json`, so a clean checkout could not resolve them, and the dependency-free versions are small and tested.

## What did work

TypeScript, esbuild, tsx and Playwright (with its Chromium) were already installed. Typecheck, the unit tests, the build and the offline end-to-end test all run.

## If you want the missing tools

Allow package installs in your network settings (a new chat picks up the change), then:

```bash
npm i -D eslint prettier vitest @axe-core/playwright @types/node
```

Stockfish now sits behind the shared `Engine` interface (`StockfishClient` over UCI). Accuracy/ACPL, blunder counts and Game Review can be built on it; they are not part of Phase 1.

## Licences

Stockfish and chessground are GPL-3.0. MoveWise is GPL-3.0-or-later, so they would be compatible, but sources and notices must ship with each release. Record any addition in `THIRD_PARTY_NOTICES.md`.

## Puzzle data (Phase 3)

`database.lichess.org` and Hugging Face were not reachable from the build environment (the network allowlist covered package registries and GitHub only). The Lichess puzzle CSV (CC0) was therefore read as byte-range slices through a public GitHub Git-LFS copy of the official export. The slices are not in the repository; `docs/puzzle-pack-report.json` records the SHA-256 of each one. Stockfish ran in Node (`tests/nodeEngine.ts`) for the verification pass. Nothing at run time depends on any of this: the pack is a static file in the app.

## Academy (Phase 4)

`scripts/pick-puzzles.mts` picks puzzles deterministically from the bundled pack for lesson exercises, `scripts/gen-tactics.mts` regenerates `tactic-positions.ts`, `scripts/validate-academy.mts` validates the curriculum, and `scripts/check-academy-engine.mts` verifies accepted moves and claims with Stockfish. No new packages.
