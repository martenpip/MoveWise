/** Verified themes and the replay context for one analysed move (shared by the Notebook and Game Review). */
import type { PlyAnalysis, ReviewAnalysis } from '../review/analyse';
import type { LearningItem } from '../review/notebook';
import { verifiedThemes } from '../puzzles/learn';
import { describeMove } from '../review/facts';

export interface ItemInfo {
  previous: { fen: string; uci: string } | null;
  themes: string[];
}

export function toLearningItemLike(analysis: ReviewAnalysis, p: PlyAnalysis): ItemInfo | null {
  if (!p.best) return null;
  const previous = p.ply > 1 ? { fen: analysis.plies[p.ply - 2]!.fenBefore, uci: analysis.plies[p.ply - 2]!.uci } : null;
  const item: LearningItem = {
    id: `${analysis.gameId}:${p.ply}`, gameId: analysis.gameId, ply: p.ply, fen: p.fenBefore, sideToMove: p.color,
    solution: { move: p.best.uci, san: p.best.san, line: p.bestLine.uci },
    played: { move: p.uci, san: p.san },
    cls: p.cls === 'blunder' ? 'blunder' : p.cls === 'mistake' ? 'mistake' : 'inaccuracy',
    winLoss: p.winLoss, tags: p.tags, phase: p.phase, engine: '', previous,
  };
  const themes = verifiedThemes(item, false).map((t) => t.theme);
  const d = describeMove(p.fenBefore, p.best.uci);
  if (d && themes.includes('fork') && d.pieceType === 2) themes.push('knightFork');
  if (p.tags.includes('missed-mate') && !themes.includes('mate')) themes.push('mate');
  return { previous, themes: [...new Set(themes)] };
}
