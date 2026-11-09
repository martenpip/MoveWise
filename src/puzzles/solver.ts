/**
 * The puzzle solver: a small state machine over the rules engine. It knows nothing about the screen.
 *
 * The first stored move belongs to the opponent and is played automatically, so the player starts from the position the
 * puzzle is about. After each correct move of the player the opponent's stored reply is played, until the player's last move.
 *
 * Judging a move:
 *  1. The stored move for this step: correct.
 *  2. Any other move that gives checkmate: correct and finishes the puzzle (a mate is a mate).
 *  3. Any other legal move: 'wrong' for now. The app may then ask the engine whether it is an equally good alternative
 *     (see alternatives.ts); if so it calls `acceptAlternative`, which finishes the puzzle as solved by an alternative.
 */
import { Position } from '../chess/position';
import type { Color } from '../chess/types';
import { isCheckmate } from './validate';
import type { Puzzle } from './types';

export type Attempt =
  | { kind: 'illegal' }
  | { kind: 'wrong'; uci: string; san: string }
  /** The stored move (or an immediate checkmate). `reply` is the opponent's automatic answer, absent when the puzzle is finished. */
  | { kind: 'correct'; uci: string; reply: string | null; done: boolean; viaMate: boolean };

export interface PuzzleView {
  fen: string;
  turn: Color;
  lastMove: { from: number; to: number } | null;
}

export class PuzzleSession {
  readonly puzzle: Puzzle;
  readonly playerColor: Color;
  /** Position the player first sees (after the opponent's setup move). */
  readonly startFen: string;
  readonly setupMove: string;
  private pos: Position;
  /** Index into `puzzle.moves` of the player's next move. */
  private idx = 1;
  private last: string | null;
  private _done = false;
  private _viaAlternative: string | null = null;
  /** Moves the player has played correctly, in UCI (the stored ones, or a finishing mate). */
  readonly played: string[] = [];

  constructor(puzzle: Puzzle) {
    this.puzzle = puzzle;
    this.pos = new Position(puzzle.fen);
    const first = this.pos.parseUci(puzzle.moves[0]!);
    if (first === undefined) throw new Error(`Puzzle ${puzzle.id}: the first move is not legal`);
    this.setupMove = puzzle.moves[0]!;
    this.pos.makeMove(first);
    this.last = this.setupMove;
    this.startFen = this.pos.toFen();
    this.playerColor = this.pos.turn;
  }

  get done(): boolean {
    return this._done;
  }
  get viaAlternative(): string | null {
    return this._viaAlternative;
  }
  get fen(): string {
    return this.pos.toFen();
  }
  get view(): PuzzleView {
    const l = this.last;
    return {
      fen: this.pos.toFen(),
      turn: this.pos.turn,
      lastMove: l ? squares(l) : null,
    };
  }
  /** How many moves the player still has to find (counting the next one). */
  get remaining(): number {
    return this._done ? 0 : (this.puzzle.moves.length - this.idx + 1) / 2;
  }
  /** The next stored player move, or null when finished. */
  get expected(): string | null {
    return this._done ? null : (this.puzzle.moves[this.idx] ?? null);
  }
  /** 0-based number of the player move being solved. */
  get step(): number {
    return (this.idx - 1) / 2;
  }
  get totalSteps(): number {
    return this.puzzle.moves.length / 2;
  }

  /** Judges a move from the board. Legal-move filtering is done by the board; this also guards against illegal input. */
  attempt(uci: string): Attempt {
    if (this._done) return { kind: 'illegal' };
    const m = this.pos.parseUci(uci);
    if (m === undefined) return { kind: 'illegal' };
    const expected = this.puzzle.moves[this.idx]!;
    const matches = uci === expected || sameMove(uci, expected);
    const san = this.pos.toSan(m);
    if (!matches) {
      // Any checkmate finishes the puzzle.
      const probe = this.pos.clone();
      probe.makeMove(m);
      if (isCheckmate(probe)) {
        this.pos.makeMove(m);
        this.played.push(uci);
        this.last = uci;
        this._done = true;
        return { kind: 'correct', uci, reply: null, done: true, viaMate: true };
      }
      return { kind: 'wrong', uci, san };
    }
    this.pos.makeMove(m);
    this.played.push(expected);
    this.last = expected;
    this.idx++;
    const replyUci = this.puzzle.moves[this.idx];
    if (replyUci === undefined) {
      this._done = true;
      return { kind: 'correct', uci: expected, reply: null, done: true, viaMate: false };
    }
    const reply = this.pos.parseUci(replyUci);
    if (reply === undefined) throw new Error(`Puzzle ${this.puzzle.id}: the stored reply ${replyUci} is not legal`);
    this.pos.makeMove(reply);
    this.last = replyUci;
    this.idx++;
    return { kind: 'correct', uci: expected, reply: replyUci, done: false, viaMate: false };
  }

  /** The app (not the player) decided, with the engine, that this move is as good as the stored one. Finishes the puzzle. */
  acceptAlternative(uci: string): boolean {
    const m = this.pos.parseUci(uci);
    if (this._done || m === undefined) return false;
    this.pos.makeMove(m);
    this._viaAlternative = uci;
    this.played.push(uci);
    this.last = uci;
    this._done = true;
    return true;
  }
}

function squares(uci: string): { from: number; to: number } {
  const sq = (s: string) => (s.charCodeAt(0) - 97) + (Number(s[1]) - 1) * 8;
  return { from: sq(uci.slice(0, 2)), to: sq(uci.slice(2, 4)) };
}

/** UCI strings can differ only in promotion letter case; compare normalised. */
const sameMove = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();
