/**
 * Bridges a finished review to the rest of MoveWise: the activity record the Profile reads, and the stored
 * review itself. Also the single place that defines which tags count as "weaknesses" for the Profile.
 */
import type { ReviewEvent } from '../profile/types';
import type { ReviewAnalysis } from './analyse';
import { reviewEventId, WEAKNESS_TAGS, type Side, type Tag } from './types';

export { reviewEventId };
const round1 = (x: number): number => Math.round(x * 10) / 10;

/**
 * The Profile record for the player's side of a reviewed game, or null when there is nothing honest to record
 * (no personal perspective, or no decisions to judge). Phase figures are null where the phase had too few moves.
 */
export function buildReviewEvent(analysis: ReviewAnalysis, at: number): ReviewEvent | null {
  const side: Side | null = analysis.perspective;
  if (!side) return null;
  const s = analysis.sides[side];
  if (s.acpl === null || s.accuracy === null) return null;
  const mine = analysis.plies.filter((p) => p.color === side);
  const weaknesses = new Set<Tag>();
  for (const p of mine) for (const t of p.tags) if ((WEAKNESS_TAGS as readonly Tag[]).includes(t)) weaknesses.add(t);
  const phase = (k: 'opening' | 'middlegame' | 'endgame') => (s.phases[k].acpl === null ? null : round1(s.phases[k].acpl!));
  return {
    id: reviewEventId(analysis.gameId),
    kind: 'review',
    at,
    gameId: analysis.gameId,
    acpl: round1(s.acpl),
    accuracy: round1(s.accuracy),
    inaccuracies: s.counts.inaccuracy,
    mistakes: s.counts.mistake,
    blunders: s.counts.blunder,
    missedTactics: mine.filter((p) => p.tags.includes('missed-capture') || p.tags.includes('missed-mate')).length,
    phaseAcpl: { opening: phase('opening'), middlegame: phase('middlegame'), endgame: phase('endgame') },
    weaknesses: [...weaknesses],
  };
}
