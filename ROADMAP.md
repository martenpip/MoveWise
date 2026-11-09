# Roadmap

MoveWise v0.8.0 is the last planned feature release. The list below is what exists, what is deliberately limited, and what is not planned. It is a statement of where things stand, not a promise of future work.

## Done
- Phases 1 to 3: play, analysis, profile, sound, achievements, Game Review, the puzzle trainer, Stockfish analysis, the offline PWA.
- Phase 4 (v0.7 and v0.7.1): the Academy, 9 courses and 113 lessons. Limits are listed in [docs/academy.md](docs/academy.md).
- Phase 5 (v0.8.0): the Mistake Notebook with spaced repetition ([docs/notebook.md](docs/notebook.md)), Play with Trainer and optional spoken coaching ([docs/trainer.md](docs/trainer.md)), a 25-level bot ladder from 100 to 2500 with separate practice and competitive categories ([docs/bots.md](docs/bots.md)), a post-game results screen, a six-item navigation and a Home page that answers what to do next, what to practise and how you are improving, GitHub Pages deployment ([docs/deploy.md](docs/deploy.md)).

## Known limits
- Bot ratings are approximate MoveWise bot ratings, not Elo or FIDE ratings. Levels 1400 and above use Stockfish's strength limiter, whose floor is 1320, so there is no Stockfish-limited level below 1400.
- Spoken coaching depends on the voices the browser has installed. It was tested with a fake speech synthesiser, not with real voices on every platform.
- The Trainer and Game Review judge moves with an engine at limited depth. They can be wrong.
- Triangulation in the Academy is taught with one engine-checked demonstration. A position where triangulation is the only winning method was not found, and the lesson says so ([docs/academy.md](docs/academy.md)).
- Puzzle motif detectors do not exist for deflection, attraction, interference, clearance and in-between moves, so those labels are not applied automatically.
- No clocks or time controls, no multi-PV, no piece sets beyond the one shipped, no board editor.

## Not planned
Accounts, cloud sync, remote AI, cloud text-to-speech, ads or trackers.
