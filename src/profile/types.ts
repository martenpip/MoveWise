/** Shapes for the local player profile and the activity records that future features (puzzles, lessons, game review) write. */

export type AvatarColor = 'gold' | 'teal' | 'blue' | 'rose' | 'violet' | 'slate';
export const AVATAR_COLORS: readonly AvatarColor[] = ['gold', 'teal', 'blue', 'rose', 'violet', 'slate'];
export type AvatarPiece = 'knight' | 'king' | 'queen' | 'rook' | 'bishop' | 'pawn';
export const AVATAR_PIECES: readonly AvatarPiece[] = ['knight', 'king', 'queen', 'rook', 'bishop', 'pawn'];

export interface Avatar {
  /** Show the player's initials, or one of the chess pieces. */
  kind: 'initials' | 'piece';
  color: AvatarColor;
  piece: AvatarPiece;
}

export interface Profile {
  displayName: string;
  avatar: Avatar;
  /** When the player started using MoveWise on this device (ms since epoch). */
  startedAt: number;
  /**
   * Games played before this moment are not used for the rating. Set when the player restarts their rating;
   * it never deletes any game.
   */
  ratingEpoch: number;
}

export const MAX_NAME_LENGTH = 24;
export const DEFAULT_NAME = 'Player';

export function defaultProfile(now: number, earliestGame?: number): Profile {
  return {
    displayName: DEFAULT_NAME,
    avatar: { kind: 'initials', color: 'gold', piece: 'knight' },
    startedAt: earliestGame !== undefined ? Math.min(now, earliestGame) : now,
    ratingEpoch: 0,
  };
}

/* ------------------------- activity records -------------------------- */
/* Written by the puzzle trainer (puzzles), Game Review (review) and, later, lessons. The analytics are in training.ts. */

export interface PuzzleEvent {
  id: string;
  kind: 'puzzle';
  at: number;
  puzzleId: string;
  /** Published difficulty rating of the puzzle (from the dataset). */
  puzzleRating: number;
  solved: boolean;
  timeMs: number;
  /** Highest hint level shown (0 = none, 3 = the piece to move was shown). */
  hintsUsed: number;
  themes: string[];
  /* Added with the puzzle trainer. All optional so records written before it (and old backups) stay valid. */
  /** Rating deviation published with the puzzle's difficulty. */
  puzzleRd?: number;
  mode?: PuzzleMode;
  /** True when this attempt counts for the puzzle rating: the first ever attempt at the puzzle, outside Rush and custom positions. */
  rated?: boolean;
  /** Wrong moves played before the puzzle was solved or given up. */
  wrongMoves?: number;
  /** The player asked to see the solution. */
  usedSolution?: boolean;
  /** Solved on a later try in the same session (does not change the rated result). */
  retrySolved?: boolean;
}

export type PuzzleMode = 'practice' | 'theme' | 'weakness' | 'mixed' | 'review' | 'daily' | 'rush' | 'game' | 'id';
export const PUZZLE_MODES: readonly PuzzleMode[] = ['practice', 'theme', 'weakness', 'mixed', 'review', 'daily', 'rush', 'game', 'id'];

export interface LessonEvent {
  id: string;
  kind: 'lesson';
  at: number;
  lessonId: string;
  topic: string;
  completed: boolean;
  /** Fraction of exercises answered correctly, 0..1, when the lesson has exercises. */
  score: number | null;
  /** Academy only: a chapter or course assessment (the lessonId is then `assess:<id>`); it is not a lesson and never counts as one. */
  assessment?: 'chapter' | 'course';
  /** Academy only: this assessment passed. */
  passed?: boolean;
}

/** Assessment events share the lesson event type but are kept apart from lessons everywhere. */
export const ASSESS_PREFIX = 'assess:';
export const isAssessmentId = (id: string) => id.startsWith(ASSESS_PREFIX);

export interface ReviewEvent {
  id: string;
  kind: 'review';
  at: number;
  gameId: string;
  /** Average centipawn loss of the human's moves. */
  acpl: number;
  /** 0..100 accuracy estimate. */
  accuracy: number;
  inaccuracies: number;
  mistakes: number;
  blunders: number;
  missedTactics: number;
  phaseAcpl: { opening: number | null; middlegame: number | null; endgame: number | null };
  /** Tags such as "hung a piece"; used for recurring-weakness analytics. */
  weaknesses: string[];
}

export type ActivityEvent = PuzzleEvent | LessonEvent | ReviewEvent;
