/**
 * Practice positions saved by Game Review before the Notebook existed (`LearningPosition`) become Notebook entries, so nothing the
 * player saved is lost and there is one place for everything. The conversion keeps what is known and leaves the rest empty
 * (older positions carry no evaluations, for instance); it never invents data.
 */
import { Position } from '../chess/position';
import type { LearningPosition } from '../puzzles/learn';
import { entryIdFor } from './capture';
import { DAY_MS, newSchedule } from './srs';
import type { MistakeKind, NotebookEntry, Severity } from './types';

const kindFrom = (tags: string[], severity: Severity): MistakeKind => {
  if (tags.includes('missed-mate')) return 'missed-mate';
  if (tags.includes('allowed-mate')) return 'allowed-mate';
  if (tags.includes('hung-piece')) return 'hung-piece';
  if (tags.includes('missed-capture')) return 'missed-tactic';
  return severity === 'blunder' ? 'blunder' : severity === 'mistake' ? 'mistake' : 'inaccuracy';
};

/** Null when the stored position cannot be replayed. */
export function fromLearningPosition(lp: LearningPosition): NotebookEntry | null {
  try {
    const pos = new Position(lp.fen);
    const opp = lp.moves[0];
    const m = opp ? pos.parseUci(opp) : undefined;
    if (m === undefined) return null;
    pos.makeMove(m);
    const fen = pos.toFen();
    const side = pos.turn === 0 ? 'white' : 'black';
    const severity: Severity = lp.winLoss >= 15 ? 'blunder' : lp.winLoss >= 10 ? 'mistake' : 'inaccuracy';
    const tags = [...lp.tags];
    const srs = newSchedule(lp.createdAt);
    if (lp.tries > 0) {
      srs.attempts = lp.tries;
      srs.lastReviewed = lp.lastTriedAt ?? lp.createdAt;
      if (lp.solvedAt) {
        srs.reps = 1; srs.intervalDays = 1; srs.lastGrade = 'good'; srs.due = lp.solvedAt + DAY_MS;
        srs.history = [{ at: lp.solvedAt, grade: 'good' }];
      } else {
        srs.lastGrade = 'failed'; srs.due = srs.lastReviewed;
        srs.history = [{ at: srs.lastReviewed, grade: 'failed' }];
      }
    }
    return {
      id: entryIdFor(fen), fen, sideToMove: side, moveNumber: Number(fen.split(' ')[5]) || 1,
      previous: { fen: lp.fen, uci: opp! },
      played: lp.played, best: { uci: lp.best.uci, san: lp.best.san, line: lp.moves.slice(1), lineSan: lp.best.san },
      alternatives: [], evalBefore: null, evalAfter: null, winLoss: lp.winLoss, cpLoss: null,
      severity, kind: kindFrom(tags, severity),
      explanation: `Saved from Game Review before the Notebook existed. You played ${lp.played.san}; the engine preferred ${lp.best.san}.`,
      themes: lp.themes.map((t) => t.theme), tags, phase: null,
      origin: { gameId: lp.gameId, ply: lp.ply, label: `Game review, move ${Math.ceil(lp.ply / 2)}`, opponent: null, playedAt: null },
      occurrences: [{ gameId: lp.gameId, ply: lp.ply, uci: lp.played.uci, at: lp.createdAt }],
      engine: lp.engine, savedAt: lp.createdAt, updatedAt: lp.createdAt, srs,
    };
  } catch {
    return null;
  }
}
