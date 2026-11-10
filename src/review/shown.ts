/** How a move's verdict is shown: the stored class plus "brilliant", which is derived (see `isBrilliant`). */
import type { PlyAnalysis } from './analyse';
import type { MoveClass } from './types';

export type ShownClass = MoveClass | 'brilliant';

export const shownClass = (p: Pick<PlyAnalysis, 'cls' | 'brilliant'>): ShownClass => (p.brilliant ? 'brilliant' : p.cls);

export const SHOWN_LABEL: Record<ShownClass, string> = {
  brilliant: 'Brilliant move',
  forced: 'Forced move',
  best: 'Best move',
  good: 'Good move',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder',
};

/** The sentence used in the coach bubble: "Be7 is an inaccuracy". */
export const SHOWN_SENTENCE: Record<ShownClass, string> = {
  brilliant: 'is brilliant',
  forced: 'was forced',
  best: 'is the best move',
  good: 'is a good move',
  inaccuracy: 'is an inaccuracy',
  mistake: 'is a mistake',
  blunder: 'is a blunder',
};

export const SHOWN_GLYPH: Record<ShownClass, string> = { brilliant: '!!', forced: '•', best: '★', good: '✓', inaccuracy: '?!', mistake: '?', blunder: '??' };

/** Moves that get a badge on the board. Only a forced move (no decision) stays without one. */
export const hasBadge = (c: ShownClass): boolean => c !== 'forced';
