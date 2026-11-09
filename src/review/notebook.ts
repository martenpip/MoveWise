/**
 * Groundwork for the Mistake Notebook and a personalised Puzzle Trainer (neither is built yet).
 *
 * A "learning item" is a position from the player's own game where they went wrong, packaged with everything a
 * trainer needs and nothing it would have to guess: the position, the side to move, the move the engine
 * prefers and its line, what was actually played, how bad it was and the verified tags. Items have stable ids
 * (`gameId:ply`), so a notebook can remember which ones were practised without storing the position again.
 */
import type { PlyAnalysis, ReviewAnalysis } from './analyse';
import type { MoveClass, Side, Tag } from './types';

export interface LearningItem {
  /** Stable: `${gameId}:${ply}`. */
  id: string;
  gameId: string;
  ply: number;
  /** FEN of the position BEFORE the mistake, with the player to move. */
  fen: string;
  sideToMove: Side;
  /** The engine's preferred move (UCI) and continuation: the solution of a puzzle made from this item. */
  solution: { move: string; san: string; line: string[] };
  played: { move: string; san: string };
  cls: Extract<MoveClass, 'inaccuracy' | 'mistake' | 'blunder'>;
  /** Points of win chance lost. */
  winLoss: number;
  tags: Tag[];
  phase: PlyAnalysis['phase'];
  /** Name of the engine that produced the solution. */
  engine: string;
  /** The opponent's move just before this position, with the position it was played from (null at the very start of a game). Lets a trainer replay the position the way a puzzle starts. */
  previous: { fen: string; uci: string } | null;
}

/**
 * The player's mistakes and blunders (and inaccuracies when `includeInaccuracies`), worst first. Only moves for
 * which the engine gave a best move are included, since an item without a solution cannot be practised.
 */
export function learningItems(analysis: ReviewAnalysis, includeInaccuracies = false): LearningItem[] {
  const side = analysis.perspective;
  if (!side) return [];
  const out: LearningItem[] = [];
  for (const p of analysis.plies) {
    if (p.color !== side || !p.best) continue;
    if (p.cls !== 'mistake' && p.cls !== 'blunder' && !(includeInaccuracies && p.cls === 'inaccuracy')) continue;
    out.push({
      id: `${analysis.gameId}:${p.ply}`,
      gameId: analysis.gameId,
      ply: p.ply,
      fen: p.fenBefore,
      sideToMove: side,
      solution: { move: p.best.uci, san: p.best.san, line: p.bestLine.uci },
      played: { move: p.uci, san: p.san },
      cls: p.cls,
      winLoss: p.winLoss,
      tags: p.tags,
      phase: p.phase,
      engine: analysis.engines[p.before.e] ?? 'Unknown engine',
      previous: p.ply > 1 ? { fen: analysis.plies[p.ply - 2]!.fenBefore, uci: analysis.plies[p.ply - 2]!.uci } : null,
    });
  }
  return out.sort((a, b) => b.winLoss - a.winLoss);
}
