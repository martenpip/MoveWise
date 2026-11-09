/** Interactive exercise logic, kept free of UI so it can be tested. */
import { Position } from '../chess/position';
import { WHITE, moveFrom, moveTo, moveToUci, parseSquare, squareName } from '../chess/types';
import { isCheckmate } from '../puzzles/validate';
import type { MoveExercise, MoveQuestion, Question, ReachExercise } from './types';

export type LineAttempt =
  | { kind: 'illegal' }
  | { kind: 'wrong'; san: string; note?: string }
  | { kind: 'correct'; uci: string; reply: string | null; done: boolean; mate: boolean };

/** One run through a move exercise. After each correct move the scripted reply is played automatically. */
export class LineSession {
  private pos: Position;
  private i = 0;
  readonly playerColor: 0 | 1;
  constructor(readonly ex: MoveExercise) {
    this.pos = new Position(ex.board.fen);
    this.playerColor = this.pos.turn;
  }
  get fen(): string {
    return this.pos.toFen();
  }
  get done(): boolean {
    return this.i >= this.ex.line.length;
  }
  /** Index of the learner's current move (0-based), and how many they have to make. */
  get step(): number {
    return Math.floor(this.i / 2);
  }
  get totalSteps(): number {
    return Math.ceil(this.ex.line.length / 2);
  }
  get expected(): string | null {
    return this.done ? null : this.ex.line[this.i]!;
  }
  legalMoves(): number[] {
    return this.pos.legalMoves();
  }
  get position(): Position {
    return this.pos;
  }
  attempt(uci: string): LineAttempt {
    if (this.done) return { kind: 'illegal' };
    const m = this.pos.parseUci(uci);
    if (m === undefined) return { kind: 'illegal' };
    const expected = this.ex.line[this.i]!;
    const first = this.i === 0;
    let ok = uci === expected || (first && (this.ex.alt ?? []).includes(uci));
    if (!ok && this.ex.anyMate) {
      const p = this.pos.clone();
      p.makeMove(m);
      ok = isCheckmate(p);
    }
    if (!ok) return { kind: 'wrong', san: this.pos.toSan(m), note: this.ex.wrong?.[uci] };
    this.pos.makeMove(m);
    const mate = isCheckmate(this.pos);
    // An accepted alternative may leave the stored line behind: the exercise is over once the stored line's first move is replaced.
    const replaced = uci !== expected;
    this.i += 1;
    if (replaced) {
      this.i = this.ex.line.length;
      return { kind: 'correct', uci, reply: null, done: true, mate };
    }
    let reply: string | null = null;
    if (this.i < this.ex.line.length) {
      reply = this.ex.line[this.i]!;
      this.pos.makeMove(this.pos.parseUci(reply)!);
      this.i += 1;
    }
    return { kind: 'correct', uci, reply, done: this.done, mate };
  }
}

/** Destinations the learner must find in a "reach" exercise. */
export function reachTargets(ex: ReachExercise): string[] {
  const pos = new Position(ex.board.fen);
  const from = parseSquare(ex.from);
  return pos
    .legalMoves()
    .filter((m) => moveFrom(m) === from && (ex.which !== 'captures' || pos.board[moveTo(m)] !== 0))
    .map((m) => squareName(moveTo(m)))
    .filter((s, i, a) => a.indexOf(s) === i)
    .sort();
}

export type ReachAttempt = 'found' | 'again' | 'wrong';

/** Judges one clicked square in a reach exercise. */
export function reachClick(targets: readonly string[], found: ReadonlySet<string>, sq: string): ReachAttempt {
  if (found.has(sq)) return 'again';
  return targets.includes(sq) ? 'found' : 'wrong';
}

/** Grades one answer to a knowledge-check question. `answer` is an option index, a UCI move or a square name. */
export function gradeQuestion(q: Question, answer: number | string): boolean {
  if (q.kind === 'choice') return typeof answer === 'number' && answer === q.answer;
  if (typeof answer !== 'string') return false;
  return q.answers.includes(answer);
}

/** Whether a move answer is a legal move in the question's position (so illegal clicks are never graded). */
export function legalAnswer(q: MoveQuestion, uci: string): boolean {
  return new Position(q.board.fen).parseUci(uci) !== undefined;
}

export const scoreOf = (correct: number, total: number): number => (total ? correct / total : 0);

/** UCI string for a move given as squares and an optional promotion piece (1..5 -> '', '', n, b, r, q). */
export function toUci(from: number, to: number, promo: number): string {
  return `${squareName(from)}${squareName(to)}${['', '', 'n', 'b', 'r', 'q'][promo] ?? ''}`;
}

export const sideOf = (fen: string): 'white' | 'black' => (new Position(fen).turn === WHITE ? 'white' : 'black');
export { moveToUci };
