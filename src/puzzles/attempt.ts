/** Turning a finished (or abandoned-after-failing) puzzle into the activity record the Profile, rating and achievements read. */
import type { PuzzleEvent, PuzzleMode } from '../profile/types';
import { themeInfo } from './themes';
import type { Puzzle } from './types';

export interface AttemptFacts {
  puzzle: Puzzle;
  mode: PuzzleMode;
  /** Stable id for this sitting, so a later retry updates the same record instead of adding another. */
  sittingId: string;
  at: number;
  timeMs: number;
  hintsUsed: number;
  wrongMoves: number;
  usedSolution: boolean;
  solved: boolean;
  /** Whether the puzzle had never been attempted before and the mode counts for the rating. */
  rated: boolean;
  retrySolved?: boolean;
}

export function makeEvent(f: AttemptFacts): PuzzleEvent {
  const custom = f.puzzle.custom;
  // An unscored learning position carries no theme: one engine move is not evidence about a tactical skill.
  const themes = custom && !custom.scored ? [] : f.puzzle.themes.filter((t) => themeInfo(t));
  return {
    id: `puzzle:${f.sittingId}`,
    kind: 'puzzle',
    at: f.at,
    puzzleId: f.puzzle.id,
    puzzleRating: Math.round(f.puzzle.rating),
    puzzleRd: Math.round(f.puzzle.rd),
    solved: f.solved,
    timeMs: Math.max(0, Math.round(f.timeMs)),
    hintsUsed: f.hintsUsed,
    themes,
    mode: f.mode,
    rated: f.rated && !custom && f.mode !== 'rush',
    wrongMoves: f.wrongMoves,
    usedSolution: f.usedSolution,
    ...(f.retrySolved ? { retrySolved: true } : {}),
  };
}
