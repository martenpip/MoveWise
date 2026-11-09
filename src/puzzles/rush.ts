/**
 * Puzzle Rush: an optional timed mode (3, 5 or 10 minutes). It starts easy, gets harder with every solve, and ends when the time
 * is up or after three wrong moves. It never touches the puzzle rating (speed pressure is not a fair measure), and a
 * result is saved locally as a high score for its length.
 */
import type { PuzzleEvent } from '../profile/types';
import { seeded, type Rng } from './select';
import type { Puzzle } from './types';

export const RUSH_MINUTES = [3, 5, 10] as const;
export type RushMinutes = (typeof RUSH_MINUTES)[number];
export const MAX_STRIKES = 3;

export interface RushScore {
  id: string;
  at: number;
  minutes: RushMinutes;
  solved: number;
  strikes: number;
  /** Highest puzzle rating solved. */
  best: number;
}

export interface RushState {
  solved: number;
  strikes: number;
  /** Rating of the next puzzle to aim for. */
  level: number;
  used: string[];
}

export const startRush = (playerRating: number): RushState => ({ solved: 0, strikes: 0, level: Math.max(400, Math.round(playerRating - 350)), used: [] });
export const rushOver = (s: RushState): boolean => s.strikes >= MAX_STRIKES;
export const afterSolve = (s: RushState): RushState => ({ ...s, solved: s.solved + 1, level: s.level + 40 });
export const afterMiss = (s: RushState): RushState => ({ ...s, strikes: s.strikes + 1 });

/** Next Rush puzzle: closest to the target rating among unused ones, with a little randomness. Short solutions only (they are quick). */
export function rushPuzzle(puzzles: readonly Puzzle[], s: RushState, rng: Rng = seeded(s.solved + s.strikes * 101)): Puzzle | null {
  const used = new Set(s.used);
  const pool = puzzles.filter((p) => !used.has(p.id) && p.moves.length <= 6);
  if (!pool.length) return null;
  const near = [...pool].sort((a, b) => Math.abs(a.rating - s.level) - Math.abs(b.rating - s.level)).slice(0, 8);
  return near[Math.floor(rng() * near.length)] ?? null;
}

export function highScore(scores: readonly RushScore[], minutes: RushMinutes): RushScore | null {
  return scores.filter((x) => x.minutes === minutes).sort((a, b) => b.solved - a.solved || a.at - b.at)[0] ?? null;
}

export const rushEvents = (events: readonly PuzzleEvent[]): PuzzleEvent[] => events.filter((e) => e.mode === 'rush');
