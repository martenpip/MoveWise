/** Small text helpers for the review (kept free of UI code so the logic can be tested without a browser). */
import { forSide } from './score';
import type { PositionEval, Side } from './types';

const MINUS = '−';

/** "+1.2", "−0.8", "M3" / "−M3" for a score from White's point of view. */
export function formatEval(e: Pick<PositionEval, 'cp' | 'mate'>): string {
  if (e.mate !== null) return `${e.mate > 0 ? '' : MINUS}M${Math.abs(e.mate)}`;
  const v = e.cp / 100;
  return `${v > 0 ? '+' : v < 0 ? MINUS : ''}${Math.abs(v).toFixed(1)}`;
}

/** The same, from the point of view of `side` (so "+1.2" always means good for that side). */
export function formatEvalFor(e: Pick<PositionEval, 'cp' | 'mate'>, side: Side): string {
  return formatEval({ cp: forSide(e.cp, side), mate: e.mate === null ? null : forSide(e.mate, side) });
}

export const pct = (x: number): string => `${Math.round(x)}%`;

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Whole points of material ("3 points"), from centipawn-sized units. */
export const pointsText = (cp: number): string => plural(Math.max(1, Math.round(Math.abs(cp) / 100)), 'point');
