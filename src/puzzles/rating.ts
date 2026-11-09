/**
 * The puzzle rating: a Glicko-2 track of its own, against the puzzles' published ratings. It is derived purely from the
 * saved puzzle attempts, never mixed with the playing rating (src/profile/rating.ts) or with learning mastery.
 *
 * Rules (shown to the player on the Puzzles page):
 *  - Only the FIRST attempt at a puzzle counts. Retrying, reviewing a failed puzzle, the daily puzzle's revisits, Puzzle Rush
 *    and positions made from your own games are practice and never change the rating.
 *  - Solving without any hint and without a wrong move scores 1. Solving after a hint scores a half. A wrong move, giving up
 *    or looking at the solution scores 0. (A half-point against a much harder puzzle can still raise the rating a little.)
 *  - A harder puzzle moves the rating more, as in any Elo/Glicko system. Speed does not matter: time never enters the formula.
 *  - The uncertainty (rating deviation, RD) starts high and shrinks as results accumulate, so the first few puzzles move the
 *    rating a lot and later ones less. Until RD is small the rating is labelled provisional.
 */
import { GLICKO_DEFAULTS, glicko2Update, type GlickoState } from '../profile/glicko2';
import type { PuzzleEvent } from '../profile/types';

export const PUZZLE_START_RATING = 1000;
export const PUZZLE_PROVISIONAL_RD = 110;
export const DEFAULT_PUZZLE_RD = 50;

/** Score of one attempt for the rating: 1, 0.5 or 0. */
export function attemptScore(e: Pick<PuzzleEvent, 'solved' | 'hintsUsed' | 'wrongMoves' | 'usedSolution'>): 0 | 0.5 | 1 {
  if (!e.solved || e.usedSolution || (e.wrongMoves ?? 0) > 0) return 0;
  return e.hintsUsed > 0 ? 0.5 : 1;
}

/** The attempts that count: the first for each puzzle, and only if marked rated (older records without the mark count). */
export function ratedAttempts(events: readonly PuzzleEvent[]): PuzzleEvent[] {
  const seen = new Set<string>();
  const out: PuzzleEvent[] = [];
  for (const e of [...events].sort((a, b) => a.at - b.at)) {
    if (e.mode === 'rush' || e.mode === 'game') continue;
    if (seen.has(e.puzzleId)) continue; // the first attempt is the only one that can ever count
    seen.add(e.puzzleId);
    if (e.rated === false) continue;
    out.push(e);
  }
  return out;
}

export interface PuzzleRatingState extends GlickoState {
  /** Number of rated attempts. */
  n: number;
}
export interface PuzzleRatingPoint {
  at: number;
  rating: number;
  rd: number;
}

export const START_STATE: PuzzleRatingState = { rating: PUZZLE_START_RATING, rd: GLICKO_DEFAULTS.initialRd, vol: GLICKO_DEFAULTS.initialVol, n: 0 };

export function applyAttempt(state: PuzzleRatingState, e: PuzzleEvent): PuzzleRatingState {
  const next = glicko2Update(state, [{ opponentRating: e.puzzleRating, opponentRd: e.puzzleRd ?? DEFAULT_PUZZLE_RD, score: attemptScore(e) }]);
  return { ...next, n: state.n + 1 };
}

export interface PuzzleRating {
  rating: number;
  rd: number;
  attempts: number;
  provisional: boolean;
  peak: number | null;
  /** Peak counted only from the point where the rating stopped being provisional. */
  history: PuzzleRatingPoint[];
  /** What the next result would change the rating by, for an equally rated puzzle: shown as an example in the explanation. */
  exampleWin: number;
  exampleLoss: number;
}

export function puzzleRating(events: readonly PuzzleEvent[]): PuzzleRating {
  let st = START_STATE;
  const history: PuzzleRatingPoint[] = [];
  for (const e of ratedAttempts(events)) {
    st = applyAttempt(st, e);
    history.push({ at: e.at, rating: st.rating, rd: st.rd });
  }
  const stable = history.filter((h) => h.rd <= PUZZLE_PROVISIONAL_RD);
  const win = glicko2Update(st, [{ opponentRating: st.rating, opponentRd: DEFAULT_PUZZLE_RD, score: 1 }]).rating - st.rating;
  const loss = glicko2Update(st, [{ opponentRating: st.rating, opponentRd: DEFAULT_PUZZLE_RD, score: 0 }]).rating - st.rating;
  return {
    rating: st.rating,
    rd: st.rd,
    attempts: st.n,
    provisional: st.rd > PUZZLE_PROVISIONAL_RD,
    peak: stable.length ? Math.max(...stable.map((h) => h.rating)) : null,
    history,
    exampleWin: win,
    exampleLoss: loss,
  };
}

/** Whether a new attempt at this puzzle would count for the rating (it has never been attempted, and the mode is rated). */
export function wouldBeRated(events: readonly PuzzleEvent[], puzzleId: string, mode: PuzzleEvent['mode']): boolean {
  if (mode === 'rush' || mode === 'game') return false;
  return !events.some((e) => e.puzzleId === puzzleId);
}
