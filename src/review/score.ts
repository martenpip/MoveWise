/**
 * The numbers behind Game Review. Every formula is here, in one small file, so it can be read and checked.
 *
 * Win chance, per-move accuracy and the way a game's accuracy combines its moves follow the method Lichess
 * publishes (https://lichess.org/page/accuracy). It is an ESTIMATE in MoveWise's own words, not a rating of
 * strength and not comparable with the numbers other sites print. Two details that the published page leaves
 * open are MoveWise's own choices and are marked below. The classification thresholds are MoveWise's too.
 */
import { MATE_CP, type Side } from './types';

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** Chance (0..100) that the side with `cp` centipawns wins, from the logistic fit published by Lichess. */
export function winPct(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clamp(cp, -MATE_CP, MATE_CP))) - 1);
}

/** Centipawns from the point of view of `side`. */
export const forSide = (whiteCp: number, side: Side): number => (side === 'white' ? whiteCp : -whiteCp);

/** Win chance (0..100) for `side` given White's centipawn score. */
export const winPctFor = (whiteCp: number, side: Side): number => winPct(forSide(whiteCp, side));

/** Accuracy (0..100) of one move from the win chance before and after it, for the side that moved. */
export function moveAccuracy(winBefore: number, winAfter: number): number {
  const drop = Math.max(0, winBefore - winAfter);
  return clamp(103.1668 * Math.exp(-0.04354 * drop) - 3.1669, 0, 100);
}

/** Scores are clamped to ±1000 cp before they are compared, so a mate or a hopeless position cannot dominate the average. */
export const ACPL_CLAMP = 1000;

/** Centipawn loss of one move (>= 0), for the side that moved, from White's scores before and after. */
export function centipawnLoss(whiteCpBefore: number, whiteCpAfter: number, mover: Side): number {
  const b = clamp(forSide(whiteCpBefore, mover), -ACPL_CLAMP, ACPL_CLAMP);
  const a = clamp(forSide(whiteCpAfter, mover), -ACPL_CLAMP, ACPL_CLAMP);
  return Math.max(0, b - a);
}

/* ---- classification: MoveWise's own thresholds, in points of win chance lost by the move ---- */
export const INACCURACY_AT = 5;
export const MISTAKE_AT = 10;
export const BLUNDER_AT = 15;
/** A move this close to the engine's choice is treated as equally good (search noise is larger than this). */
export const BEST_WITHIN = 1;

export function classByLoss(lossPoints: number): 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' {
  if (lossPoints >= BLUNDER_AT) return 'blunder';
  if (lossPoints >= MISTAKE_AT) return 'mistake';
  if (lossPoints >= INACCURACY_AT) return 'inaccuracy';
  if (lossPoints > BEST_WITHIN) return 'good';
  return 'best';
}

/* ---- combining moves into a game accuracy ---- */

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const stdDev = (xs: number[]): number => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

/** Harmonic mean; values are floored at 1 so a single 0 cannot make the whole mean 0. */
export function harmonicMean(xs: number[]): number {
  return xs.length / xs.reduce((a, x) => a + 1 / Math.max(1, x), 0);
}

export interface AccuracyInput {
  /** 1-based half-move number of the move. */
  ply: number;
  accuracy: number;
}

/**
 * Accuracy of a game for one side: the average of (a) the mean of its moves' accuracies weighted by how sharp the
 * position was (a move in a swingy stretch counts more) and (b) their harmonic mean (a few bad moves pull it down
 * harder than in a plain average).
 *
 * `whiteWin` is White's win chance after every half-move including the start (length = moves + 1).
 * MoveWise's choices where the published page is silent: the "stretch" around a move is a window of
 * clamp(moves/10, 2, 8) positions, and the weight is its standard deviation limited to 0.5..12.
 */
export function gameAccuracy(whiteWin: number[], moves: AccuracyInput[]): number | null {
  if (moves.length === 0) return null;
  const n = whiteWin.length;
  const size = Math.min(n, clamp(Math.floor((n - 1) / 10), 2, 8));
  const weights = moves.map((m) => {
    const start = clamp(m.ply - Math.ceil(size / 2), 0, n - size);
    return clamp(stdDev(whiteWin.slice(start, start + size)), 0.5, 12);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  const weighted = moves.reduce((a, m, i) => a + m.accuracy * weights[i]!, 0) / total;
  return (weighted + harmonicMean(moves.map((m) => m.accuracy))) / 2;
}

/** Plain-language band for an accuracy figure. The cut-offs are MoveWise's own and only describe the number. */
export function accuracyBand(accuracy: number): 'very accurate' | 'accurate' | 'mixed' | 'error-prone' {
  if (accuracy >= 90) return 'very accurate';
  if (accuracy >= 75) return 'accurate';
  if (accuracy >= 60) return 'mixed';
  return 'error-prone';
}
