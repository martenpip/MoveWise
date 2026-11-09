/**
 * The Mistake Notebook: positions from the player's own games (or saved by hand) that are worth practising.
 *
 * An entry is self-contained. It stores the position, the engine's answer and an explanation, so deleting the original game never
 * destroys it; `origin.label` keeps a readable description of where it came from. It is identified by the position itself (the
 * first four FEN fields), so the same position found again is the same entry, with another entry in `occurrences`.
 */
import type { Side } from '../review/types';

export type Grade = 'failed' | 'hard' | 'good' | 'easy';
export const GRADES: readonly Grade[] = ['failed', 'hard', 'good', 'easy'];

/** What kind of slip this was, from verified facts only (see review/facts.ts). */
export type MistakeKind = 'blunder' | 'mistake' | 'inaccuracy' | 'missed-mate' | 'missed-tactic' | 'hung-piece' | 'allowed-mate' | 'manual';
export const KIND_LABEL: Record<MistakeKind, string> = {
  blunder: 'Blunder',
  mistake: 'Mistake',
  inaccuracy: 'Inaccuracy',
  'missed-mate': 'Missed checkmate',
  'missed-tactic': 'Missed tactic',
  'hung-piece': 'Piece left hanging',
  'allowed-mate': 'Allowed checkmate',
  manual: 'Saved by you',
};

export type Severity = 'blunder' | 'mistake' | 'inaccuracy' | 'manual';

export interface Occurrence {
  gameId: string | null;
  ply: number | null;
  /** The move that was played (UCI), or null for a manual save. */
  uci: string | null;
  at: number;
}

export interface ReviewRecord {
  at: number;
  grade: Grade;
}

/** Spaced-repetition state. Everything here is derived by `srs.ts` from review outcomes. */
export interface Schedule {
  /** Successful reviews in a row (reset by a failure). */
  reps: number;
  /** Times the position was failed after being learned. */
  lapses: number;
  /** SM-2 style ease factor, between 1.3 and 3.0. */
  ease: number;
  /** Current interval in days (0 = review again within the session). */
  intervalDays: number;
  /** Next review, epoch milliseconds. */
  due: number;
  lastReviewed: number | null;
  /** Number of practice attempts (reviews) made. */
  attempts: number;
  lastGrade: Grade | null;
  /** The most recent reviews, newest last (at most HISTORY_LIMIT). */
  history: ReviewRecord[];
}

export const HISTORY_LIMIT = 30;

export interface NotebookEntry {
  /** `nb:` + the first four FEN fields of `fen`. Stable, so a position is never saved twice. */
  id: string;
  /** The position to solve (before the move that was a mistake). */
  fen: string;
  sideToMove: Side;
  /** Full-move number of the position. */
  moveNumber: number;
  /** The opponent's move that led here, with the position before it (so the position can be replayed the way it arose). */
  previous: { fen: string; uci: string } | null;
  played: { uci: string; san: string } | null;
  best: { uci: string; san: string; line: string[]; lineSan: string };
  /** Other moves known to be acceptable (UCI): they were verified when saved or during practice. Never includes `best`. */
  alternatives: string[];
  /** Engine evaluation before / after the played move, in centipawns from the mover's point of view, null when unknown. */
  evalBefore: number | null;
  evalAfter: number | null;
  /** Points of win chance given up (0 to 100), null when unknown (a manual save). */
  winLoss: number | null;
  cpLoss: number | null;
  severity: Severity;
  kind: MistakeKind;
  /** Short plain-language explanation of what went wrong and why the best move works. */
  explanation: string;
  /** Verified tactical or positional themes (puzzle theme ids, e.g. `fork`, `hangingPiece`) and verified review tags. */
  themes: string[];
  tags: string[];
  phase: 'opening' | 'middlegame' | 'endgame' | null;
  /** Where it came from. `label` stays readable after the game is deleted. */
  origin: { gameId: string | null; ply: number | null; label: string; opponent: string | null; playedAt: number | null };
  /** Every game this position came up in (the first one is the origin). */
  occurrences: Occurrence[];
  engine: string;
  savedAt: number;
  updatedAt: number;
  srs: Schedule;
}

export type NotebookStatus = 'new' | 'due' | 'learning' | 'upcoming' | 'retained' | 'needs-practice';
export const STATUS_LABEL: Record<NotebookStatus, string> = {
  new: 'New',
  due: 'Due',
  learning: 'Learning',
  upcoming: 'Upcoming',
  retained: 'Retained',
  'needs-practice': 'Needs practice',
};
