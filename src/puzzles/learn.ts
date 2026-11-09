/**
 * From Game Review to practice. A mistake from one of your own games (a `LearningItem`, see review/notebook.ts) becomes either
 *
 *  - a SCORED exercise, only when the stored engine line is a forced checkmate that the rules engine confirms (mate in 5 or
 *    fewer). The solution is then clear and checkable, so it behaves like any mate puzzle (without touching the rating), or
 *  - an UNSCORED learning position: you try to find the engine's move, are shown the verified line, and nothing is counted as
 *    a puzzle result, because one engine move is not proof that there is a single right answer.
 *
 * Both keep a reference to the original game and move. The `themes` listed are only those that the rules engine can verify in
 * the position (a mate, a fork by the best move, an undefended piece that could be taken); each comes with the fact behind it.
 */
import { Position } from '../chess/position';
import { squareName } from '../chess/types';
import type { LearningItem } from '../review/notebook';
import { describeMove } from '../review/facts';
import { isCheckmate, checkPuzzle } from './validate';
import { targetsAfter } from './explain';
import type { Puzzle } from './types';

export interface LinkedTheme {
  theme: string;
  /** The checked fact, in words. */
  reason: string;
}

export interface LearningPosition {
  /** `${gameId}:${ply}` */
  id: string;
  gameId: string;
  ply: number;
  createdAt: number;
  scored: boolean;
  /** [opponent's move, best move, ...]. */
  moves: string[];
  /** Position before the opponent's move. */
  fen: string;
  played: { uci: string; san: string };
  best: { uci: string; san: string };
  engine: string;
  winLoss: number;
  tags: string[];
  themes: LinkedTheme[];
  /** Practice record, kept for the Mistake Notebook (spaced repetition comes later). */
  tries: number;
  lastTriedAt?: number;
  solvedAt?: number;
}

export const puzzleIdOf = (lp: Pick<LearningPosition, 'gameId' | 'ply'>): string => `game:${lp.gameId}:${lp.ply}`;

export function verifiedThemes(item: LearningItem, scored: boolean): LinkedTheme[] {
  const out: LinkedTheme[] = [];
  const best = item.solution.move;
  const d = describeMove(item.fen, best);
  if (!d) return out;
  if (scored) {
    const n = Math.ceil(item.solution.line.length / 2);
    out.push({ theme: `mateIn${n}`, reason: `the engine's line is a forced checkmate in ${n}, confirmed by the rules engine` });
    out.push({ theme: 'mate', reason: 'the line ends in checkmate' });
  }
  const t = targetsAfter(item.fen, best);
  if (t.length >= 2 && d.pieceType !== 6) out.push({ theme: 'fork', reason: `${d.san} would have attacked the ${t.slice(0, 3).join(' and the ')} at once` });
  if (d.captured && d.captured !== 1) {
    const pos = new Position(item.fen);
    const enemy = pos.turn ^ 1;
    const defenders = pos.attackersOf(d.to, enemy as 0 | 1).filter((s) => s !== d.to);
    if (defenders.length === 0) out.push({ theme: 'hangingPiece', reason: `the piece you could have taken on ${squareName(d.to)} was undefended` });
  }
  return out;
}

/** Null when the item cannot be practised (it has no previous move, or the data does not replay). */
export function toLearningPosition(item: LearningItem, now: number): LearningPosition | null {
  if (!item.previous) return null;
  const line = item.solution.line.length ? item.solution.line : [item.solution.move];
  const mateMoves = [item.previous.uci, ...line];
  const mateCheck = line.length % 2 === 1 ? checkPuzzle({ id: item.id, fen: item.previous.fen, moves: mateMoves, rating: 1500, themes: [`mateIn${(line.length + 1) / 2}`] }) : { ok: false };
  const scored = item.tags.includes('missed-mate') && mateCheck.ok && (line.length + 1) / 2 <= 5;
  const moves = scored ? mateMoves : [item.previous.uci, item.solution.move];
  const basic = checkPuzzle({ id: item.id, fen: item.previous.fen, moves, rating: 1500, themes: [] });
  if (!basic.ok) return null;
  return {
    id: item.id, gameId: item.gameId, ply: item.ply, createdAt: now, scored,
    moves, fen: item.previous.fen,
    played: { uci: item.played.move, san: item.played.san },
    best: { uci: item.solution.move, san: item.solution.san },
    engine: item.engine, winLoss: item.winLoss, tags: item.tags,
    themes: verifiedThemes(item, scored), tries: 0,
  };
}

/** The exercise as a Puzzle the solver can run. Its rating is a placeholder: custom positions are never rated. */
export function learningPuzzle(lp: LearningPosition, rating: number): Puzzle {
  return {
    id: puzzleIdOf(lp), fen: lp.fen, moves: lp.moves, rating, rd: 100,
    themes: lp.themes.map((t) => t.theme), pack: 'game', kind: 'tactic',
    custom: { gameId: lp.gameId, ply: lp.ply, scored: lp.scored, played: lp.played.uci },
  };
}

/** Whether the position is a checkmate for the side to move: used by tests of the linking. */
export const endsInMate = (fen: string, moves: string[]): boolean => {
  const p = new Position(fen);
  for (const u of moves) { const m = p.parseUci(u); if (m === undefined) return false; p.makeMove(m); }
  return isCheckmate(p);
};
