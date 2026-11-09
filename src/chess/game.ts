import { Position } from './position';
import {
  BLACK,
  START_FEN,
  WHITE,
  FLAG_CAPTURE,
  FLAG_CASTLE,
  moveFlags,
  moveFrom,
  movePromo,
  moveTo,
  moveToUci,
  type Color,
  type GameEndReason,
  type GameResult,
  type GameStatus,
  type Move,
} from './types';

/** What a move did, read from the rules engine's own state (not guessed from notation or the screen). */
export interface MoveInfo {
  /** A piece was taken, including en passant and promotion-captures. */
  capture: boolean;
  castle: boolean;
  /** Piece type the pawn became, or 0. */
  promotion: number;
  /** The side to move is now in check (and it is not mate). */
  check: boolean;
  /** The side to move is now checkmated. */
  checkmate: boolean;
}

export interface PlayedMove {
  move: Move;
  /** Consequences of the move, for sound and animation. */
  info: MoveInfo;
  san: string;
  uci: string;
  /** FEN of the position after this move. */
  fen: string;
}

export interface Resolution {
  result: GameResult;
  reason: GameEndReason;
}

/**
 * A game: a starting position plus the moves played from it, with undo/redo.
 * All rules come from `Position`; this class only adds history and end-of-game logic.
 */
export class Game {
  readonly startFen: string;
  readonly position: Position;
  private played: PlayedMove[] = [];
  private redoStack: PlayedMove[] = [];
  private repetitionKeys: string[] = [];
  private resolution: Resolution | null = null;

  constructor(startFen: string = START_FEN) {
    this.position = new Position(startFen);
    this.startFen = this.position.toFen();
    this.repetitionKeys = [this.position.repetitionKey()];
  }

  get moves(): readonly PlayedMove[] {
    return this.played;
  }
  get redoable(): readonly PlayedMove[] {
    return this.redoStack;
  }
  get turn(): Color {
    return this.position.turn;
  }
  get ply(): number {
    return this.played.length;
  }
  get fen(): string {
    return this.position.toFen();
  }
  get lastMove(): PlayedMove | undefined {
    return this.played[this.played.length - 1];
  }

  legalMoves(): Move[] {
    return this.status().over ? [] : this.position.legalMoves();
  }

  /** Legal destination squares from a square (for move highlighting). */
  destinationsFrom(from: number): number[] {
    const out = new Set<number>();
    for (const m of this.legalMoves()) if (moveFrom(m) === from) out.add(moveTo(m));
    return [...out];
  }

  /** Play a legal move. Throws if the game is over or the move is illegal. */
  play(move: Move): PlayedMove {
    if (this.status().over) throw new Error('Game is over');
    if (!this.position.isLegal(move)) throw new Error('Illegal move');
    const san = this.position.toSan(move);
    this.position.makeMove(move);
    const inCheck = this.position.inCheck();
    const mate = inCheck && !this.position.hasLegalMove();
    const info: MoveInfo = {
      capture: (moveFlags(move) & FLAG_CAPTURE) !== 0,
      castle: (moveFlags(move) & FLAG_CASTLE) !== 0,
      promotion: movePromo(move),
      check: inCheck && !mate,
      checkmate: mate,
    };
    const entry: PlayedMove = { move, info, san, uci: moveToUci(move), fen: this.position.toFen() };
    this.played.push(entry);
    this.repetitionKeys.push(this.position.repetitionKey());
    this.redoStack = [];
    return entry;
  }

  /** Play from squares (promotion defaults to queen when ambiguous and none given). */
  playSquares(from: number, to: number, promotion = 0): PlayedMove | undefined {
    const m = this.position.findMove(from, to, promotion);
    return m === undefined ? undefined : this.play(m);
  }

  playSan(san: string): PlayedMove {
    const m = this.position.parseSan(san);
    if (m === undefined) throw new Error(`Illegal or unreadable move: ${san}`);
    return this.play(m);
  }

  playUci(uci: string): PlayedMove {
    const m = this.position.parseUci(uci);
    if (m === undefined) throw new Error(`Illegal move: ${uci}`);
    return this.play(m);
  }

  /** True when moving from→to would be a pawn promotion needing a piece choice. */
  needsPromotion(from: number, to: number): boolean {
    return this.legalMoves().some((m) => moveFrom(m) === from && moveTo(m) === to && (m >> 12) & 7);
  }

  undo(): PlayedMove | undefined {
    const last = this.played.pop();
    if (!last) return undefined;
    this.position.unmakeMove();
    this.repetitionKeys.pop();
    this.redoStack.push(last);
    this.resolution = null;
    return last;
  }

  redo(): PlayedMove | undefined {
    const next = this.redoStack.pop();
    if (!next) return undefined;
    this.position.makeMove(next.move);
    this.played.push(next);
    this.repetitionKeys.push(this.position.repetitionKey());
    return next;
  }

  /** Move the cursor to a given ply (0 = start) using undo/redo. */
  goTo(ply: number): void {
    const target = Math.max(0, Math.min(ply, this.played.length + this.redoStack.length));
    while (this.played.length > target) this.undo();
    while (this.played.length < target && this.redo()) {
      /* keep redoing */
    }
  }

  resign(color: Color): void {
    this.resolution = {
      result: color === WHITE ? '0-1' : '1-0',
      reason: 'resignation',
    };
  }

  agreeDraw(): void {
    this.resolution = { result: '1/2-1/2', reason: 'agreement' };
  }

  /** Restore an externally decided result (e.g. loaded from saved game). */
  setResolution(r: Resolution | null): void {
    this.resolution = r;
  }

  repetitions(): number {
    const key = this.repetitionKeys[this.repetitionKeys.length - 1];
    return this.repetitionKeys.filter((k) => k === key).length;
  }

  status(): GameStatus {
    const check = this.position.inCheck();
    if (this.resolution) return { over: true, check, ...this.resolution };
    if (!this.position.hasLegalMove()) {
      if (check) {
        return {
          over: true,
          check,
          result: this.position.turn === WHITE ? '0-1' : '1-0',
          reason: 'checkmate',
        };
      }
      return { over: true, check, result: '1/2-1/2', reason: 'stalemate' };
    }
    if (this.position.isInsufficientMaterial())
      return { over: true, check, result: '1/2-1/2', reason: 'insufficient-material' };
    if (this.repetitions() >= 3)
      return { over: true, check, result: '1/2-1/2', reason: 'threefold-repetition' };
    if (this.position.halfmove >= 100)
      return { over: true, check, result: '1/2-1/2', reason: 'fifty-move-rule' };
    return { over: false, check, result: '*' };
  }

  /** Move-number-prefixed SAN tokens, e.g. ["1. e4", "e5", "2. Nf3", ...]. */
  sanTokens(): string[] {
    const startFull = Number(this.startFen.split(' ')[5] ?? 1);
    const startTurn = this.startFen.split(' ')[1] === 'b' ? BLACK : WHITE;
    const out: string[] = [];
    let full = startFull;
    let turn: Color = startTurn;
    this.played.forEach((pm, i) => {
      if (turn === WHITE) out.push(`${full}. ${pm.san}`);
      else out.push(i === 0 ? `${full}... ${pm.san}` : pm.san);
      if (turn === BLACK) full++;
      turn = (turn ^ 1) as Color;
    });
    return out;
  }
}

/** Describe a finished game for display. */
export function describeEnd(status: GameStatus): string {
  if (!status.over) return '';
  switch (status.reason) {
    case 'checkmate':
      return status.result === '1-0' ? 'Checkmate — White wins' : 'Checkmate — Black wins';
    case 'stalemate':
      return 'Draw by stalemate';
    case 'insufficient-material':
      return 'Draw — neither side has enough material to checkmate';
    case 'threefold-repetition':
      return 'Draw by threefold repetition';
    case 'fifty-move-rule':
      return 'Draw by the fifty-move rule';
    case 'resignation':
      return status.result === '1-0' ? 'Black resigned — White wins' : 'White resigned — Black wins';
    case 'agreement':
      return 'Draw by agreement';
    default:
      return 'Game over';
  }
}
