/**
 * Three-stage hints. Every hint is built from the puzzle's own stored solution and tags, never invented:
 *  1. direction: a general observation for the primary theme (it does not name the motif),
 *  2. motif: the theme, as tagged in the puzzle data,
 *  3. piece: which piece to move and from which square, plus what that move does (check / capture), taken from the rules engine.
 * The move itself is shown only by `solutionReveal`.
 */
import { describeMove, pieceWord } from '../review/facts';
import { squareName } from '../chess/types';
import { primaryTheme, themeInfo } from './themes';
import type { PuzzleSession } from './solver';

export const MAX_HINT = 3;

export interface Hint {
  level: 1 | 2 | 3;
  text: string;
  /** Square to highlight (level 3 only). */
  square: number | null;
}

const GENERIC_DIRECTION = 'Start with the forcing moves: checks, captures and threats. One of them leads to the solution.';
const GENERIC_MOTIF = 'The solution is a short forcing sequence. Check what each of your forcing moves forces your opponent to do.';

export function hintFor(session: PuzzleSession, level: 1 | 2 | 3): Hint {
  const theme = themeInfo(primaryTheme(session.puzzle.themes) ?? '');
  if (level === 1) return { level, text: theme?.direction ?? GENERIC_DIRECTION, square: null };
  if (level === 2) return { level, text: theme?.motif ?? GENERIC_MOTIF, square: null };
  const next = session.expected;
  const d = next ? describeMove(session.fen, next) : null;
  if (!d) return { level, text: 'Look for the move that keeps the sequence going.', square: null };
  const bits = [d.checkmate ? 'It is checkmate.' : d.check ? 'It gives check.' : '', d.captured ? 'It captures something.' : ''].filter(Boolean);
  return { level, text: `Move the ${pieceWord(d.pieceType)} on ${squareName(d.from)}. ${bits.join(' ')}`.trim(), square: d.from };
}

/** The next move written out, for "Show the solution". */
export function solutionReveal(session: PuzzleSession): { uci: string; san: string; from: number; to: number } | null {
  const next = session.expected;
  const d = next ? describeMove(session.fen, next) : null;
  return d ? { uci: d.uci, san: d.san, from: d.from, to: d.to } : null;
}
