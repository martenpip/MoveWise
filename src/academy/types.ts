/**
 * MoveWise Academy: the shapes of lesson content and of a learner's progress.
 *
 * Content is plain data (no code), bundled with the app and validated against the rules engine before it is used
 * (`validate.ts`), so a lesson can never ask for an illegal move or describe a position that does not exist.
 */
import type { Tag } from '../review/types';

export type Level = 'beginner' | 'intermediate' | 'advanced';

/** A position to draw. `fen: 'empty'` draws an empty board (coordinate lessons). Squares are algebraic names ("e4"). */
export interface BoardSpec {
  fen: string;
  orientation?: 'white' | 'black';
  arrows?: Array<{ from: string; to: string; tone?: 'best' | 'played' | 'info' }>;
  marks?: Array<{ sq: string; tone?: 'hint' | 'bad' | 'good' | 'mark' }>;
  last?: { from: string; to: string };
}

/* ------------------------------- steps ------------------------------- */

/** Short explanation, optionally with a (non-interactive) diagram. */
export interface ReadStep {
  kind: 'read';
  title?: string;
  /** One short paragraph per entry. Keep each under about 40 words. */
  text: string[];
  board?: BoardSpec;
}

export interface DemoMove {
  uci: string;
  /** Said when this move is played. */
  say: string;
  arrows?: BoardSpec['arrows'];
  marks?: BoardSpec['marks'];
}

/** A guided demonstration: the learner steps through the moves, each with a comment. */
export interface DemoStep {
  kind: 'demo';
  title?: string;
  intro?: string;
  board: BoardSpec;
  moves: DemoMove[];
}

export interface HintSet {
  /** Progressive: from a nudge to the answer. At most three. */
  hints: string[];
}

/** Find the move. After a correct move the opponent's reply (if any) is played and the learner continues. */
export interface MoveExercise extends HintSet {
  kind: 'move';
  id: string;
  prompt: string;
  board: BoardSpec;
  /** [your move, reply, your move, ...]. Must end on the learner's move. */
  line: string[];
  /** Other first moves that are equally correct. */
  alt?: string[];
  /** A choice that follows a principle rather than an engine-exact best move. Not engine-verified as best, only as sound. */
  soft?: boolean;
  /** Any move that checkmates is accepted, as well as `line[0]`. */
  anyMate?: boolean;
  explain: string;
  /** Shown when a specific wrong move is played. */
  wrong?: Record<string, string>;
}

/** "Move the piece to every square it can reach": the learner clicks each legal destination. */
export interface ReachExercise extends HintSet {
  kind: 'reach';
  id: string;
  prompt: string;
  board: BoardSpec;
  from: string;
  /** Which destinations count. `captures` asks only for capturing moves. */
  which?: 'moves' | 'captures';
  explain: string;
}

/** Put pieces on the board. Each task is one piece and the squares that are correct for it. */
export interface PlaceExercise extends HintSet {
  kind: 'place';
  id: string;
  prompt: string;
  /** Pieces already on the board (may be 'empty'; kings are not required here). */
  board: BoardSpec;
  tasks: Array<{ piece: 'K' | 'Q' | 'R' | 'B' | 'N' | 'P'; color: 'w' | 'b'; squares: string[]; /** How many of this piece to place (default 1). */ count?: number; say?: string }>;
  explain: string;
}

/** Find named squares on the board. */
export interface SquareExercise extends HintSet {
  kind: 'square';
  id: string;
  prompt: string;
  board: BoardSpec;
  /** Each target is asked in turn: "Click e4". */
  targets: string[];
  /** Optional wording for each target ("Click the white king"); otherwise "Click <square>". */
  asks?: string[];
  explain: string;
}

/** A practice question with immediate feedback and hints (not scored). */
export interface AskExercise extends HintSet {
  kind: 'ask';
  id: string;
  prompt: string;
  board?: BoardSpec;
  options: string[];
  answer: number;
  explain: string;
  /** Feedback for a specific wrong option, by index. */
  wrong?: Record<number, string>;
}

export type ExerciseStep = MoveExercise | ReachExercise | PlaceExercise | SquareExercise | AskExercise;
export type Step = ReadStep | DemoStep | ExerciseStep;

/* ----------------------------- questions ----------------------------- */

interface QBase {
  /** Unique across the whole curriculum. */
  id: string;
  prompt: string;
  explain: string;
  board?: BoardSpec;
}
export interface ChoiceQuestion extends QBase {
  kind: 'choice';
  options: string[];
  /** Index into `options`. */
  answer: number;
}
/** Play the right move on the board. One move, no follow-up. */
export interface MoveQuestion extends QBase {
  kind: 'move';
  board: BoardSpec;
  answers: string[];
  /** A principle-based choice rather than an engine-exact best move. */
  soft?: boolean;
  /** If set, every answer must give checkmate (verified). */
  mate?: boolean;
}
/** Click the right square (for example, the square a piece is attacking, or "which square is e4"). */
export interface SquareQuestion extends QBase {
  kind: 'square';
  board: BoardSpec;
  answers: string[];
}
export type Question = (ChoiceQuestion | MoveQuestion | SquareQuestion) & {
  /** The lesson this question tests. Used to confirm mastery from chapter and course assessments. */
  lesson?: string;
};

/* ---------------------------- the hierarchy --------------------------- */

export interface Lesson {
  id: string;
  title: string;
  /** What the learner will be able to do. 2 or 3 short lines. */
  objectives: string[];
  /** Rough minutes, for planning only. */
  minutes: number;
  /** Topic label for the Profile ("Forks"). */
  topic: string;
  steps: Step[];
  /** Knowledge check. 2 to 5 questions. */
  check: Question[];
  /** Puzzle themes (ids from `src/puzzles/themes.ts`) that practise this lesson. */
  puzzleThemes?: string[];
  /** Game Review weakness tags this lesson addresses. */
  reviewTags?: Tag[];
  /** Evaluation statements the lesson makes, each verified with Stockfish in the tests. */
  claims?: Claim[];
  /** Game phases whose weak results in Game Review point to this lesson. */
  reviewPhases?: Array<'opening' | 'middlegame' | 'endgame'>;
  /** Ids Phase 5 (Mistake Notebook) can use to point a mistake at this lesson. */
  concepts?: string[];
}

/** What the lesson says about a position's evaluation. Tested with the real engine. */
export interface Claim {
  fen: string;
  says: 'white-winning' | 'black-winning' | 'white-better' | 'black-better' | 'equal';
}

export interface Chapter {
  id: string;
  title: string;
  blurb: string;
  lessons: Lesson[];
  /** Chapter knowledge check: 4 to 8 questions across its lessons. */
  check: Question[];
}

export interface Course {
  id: string;
  title: string;
  level: Level;
  blurb: string;
  /** Courses that should come first. Not a hard lock: see `academy/progress.ts`. */
  requires: string[];
  chapters: Chapter[];
  /** Course assessment: 8 to 12 questions across the course. */
  assessment: Question[];
}

export interface Path {
  id: string;
  title: string;
  blurb: string;
  courses: string[];
}

/* ------------------------------ progress ----------------------------- */

export interface CheckAttempt {
  at: number;
  total: number;
  /** Ids of the questions answered correctly. */
  correct: string[];
  score: number;
}

export interface ExerciseRecord {
  attempts: number;
  solved: boolean;
  /** Solved with no wrong answer and no hint. */
  clean: boolean;
  hints: number;
}

export interface LessonRecord {
  id: string; // `lesson:${lessonId}`
  kind: 'lesson';
  lessonId: string;
  startedAt: number;
  updatedAt: number;
  /** Furthest step reached (0-based). */
  step: number;
  exercises: Record<string, ExerciseRecord>;
  checks: CheckAttempt[];
  /** Check questions not yet answered correctly since the last wrong answer. */
  missed: string[];
  completedAt?: number;
}

export interface AssessmentRecord {
  id: string; // `assess:${assessmentId}`
  kind: 'assessment';
  assessmentId: string;
  scope: 'chapter' | 'course';
  startedAt: number;
  updatedAt: number;
  attempts: CheckAttempt[];
  /** The course was passed as a placement check taken before its lessons ("I already know this"). */
  placed?: boolean;
  passedAt?: number;
}

export interface MetaRecord {
  id: 'meta';
  kind: 'meta';
  updatedAt: number;
  /** What the learner said about their experience. */
  level?: 'new' | 'rules' | 'regular' | 'advanced';
  /** Courses the learner chose to open before their prerequisites. */
  opened: string[];
  lastLessonId?: string;
}

export type AcademyRecord = LessonRecord | AssessmentRecord | MetaRecord;

export const PASS_SCORE = 0.6;
export const MASTERY_SCORE = 0.8;
export const PLACEMENT_SCORE = 0.8;
