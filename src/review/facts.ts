/**
 * Facts about a move that the rules engine and the engine's own lines can PROVE. Explanations and tags are built
 * only from these, so nothing the review says about a position is a guess.
 */
import { Position } from '../chess/position';
import {
  BISHOP, FLAG_CAPTURE, FLAG_EP, KING, KNIGHT, PAWN, QUEEN, ROOK,
  fileOf, moveFlags, moveFrom, movePromo, moveTo, pieceColor, pieceType, squareName, type Color,
} from '../chess/types';

/** Material in centipawn-sized units where a pawn is 100 (so "3 points" is a knight or a bishop). */
export const POINTS: Record<number, number> = { [PAWN]: 100, [KNIGHT]: 300, [BISHOP]: 300, [ROOK]: 500, [QUEEN]: 900, [KING]: 0 };
const PIECE_WORD: Record<number, string> = { [PAWN]: 'pawn', [KNIGHT]: 'knight', [BISHOP]: 'bishop', [ROOK]: 'rook', [QUEEN]: 'queen', [KING]: 'king' };
export const pieceWord = (type: number): string => PIECE_WORD[type] ?? 'piece';

export const sideOf = (c: Color): 'white' | 'black' => (c === 0 ? 'white' : 'black');

/** Material balance (own minus opponent's), kings excluded. */
export function materialBalance(board: ArrayLike<number>, side: Color): number {
  let s = 0;
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq]!;
    if (!p) continue;
    s += (pieceColor(p) === side ? 1 : -1) * POINTS[pieceType(p)]!;
  }
  return s;
}

/** Combined value of all pieces except pawns and kings, both sides (used to tell the phase of the game). */
export function nonPawnMaterial(board: ArrayLike<number>): number {
  let s = 0;
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq]!;
    if (!p) continue;
    const t = pieceType(p);
    if (t !== PAWN && t !== KING) s += POINTS[t]! / 100;
  }
  return s;
}

const isCapture = (m: number): boolean => (moveFlags(m) & (FLAG_CAPTURE | FLAG_EP)) !== 0 || movePromo(m) !== 0;

/** A line of moves written out from a position. Stops at the first move that is not legal there. */
export interface Line {
  startFen: string;
  uci: string[];
  san: string[];
}

export function buildLine(startFen: string, uci: string[], max = 10): Line {
  const out: Line = { startFen, uci: [], san: [] };
  try {
    const pos = new Position(startFen);
    for (const u of uci.slice(0, max)) {
      const m = pos.parseUci(u);
      if (m === undefined) break;
      out.san.push(pos.toSan(m));
      out.uci.push(u);
      pos.makeMove(m);
    }
  } catch {
    /* a malformed FEN gives an empty line */
  }
  return out;
}

/** "12. Nf3 Nc6 13. d4" for a line, numbering from the position it starts in. */
export function formatLine(line: Line, maxPlies = line.san.length): string {
  const parts = line.startFen.split(' ');
  let white = parts[1] !== 'b';
  let num = Number(parts[5] ?? 1) || 1;
  const out: string[] = [];
  line.san.slice(0, maxPlies).forEach((san, i) => {
    if (white) out.push(`${num}.`);
    else if (i === 0) out.push(`${num}...`);
    out.push(san);
    if (!white) num++;
    white = !white;
  });
  return out.join(' ');
}

/**
 * Material change (for `side`, in centipawn-sized points) along a line, measured once the exchanges have settled:
 * after at least two moves, at the first point where the next move is not a capture (or a promotion).
 */
export function settledMaterialChange(fen: string, line: string[], side: Color, maxPlies = 8): { change: number; plies: number } {
  try {
    const pos = new Position(fen);
    const start = materialBalance(pos.board, side);
    let last = start;
    let used = 0;
    for (let i = 0; i < Math.min(line.length, maxPlies); i++) {
      const m = pos.parseUci(line[i]!);
      if (m === undefined) break;
      pos.makeMove(m);
      used++;
      last = materialBalance(pos.board, side);
      const next = i + 1 < line.length ? pos.parseUci(line[i + 1]!) : undefined;
      if (used >= 2 && !(next !== undefined && isCapture(next))) break;
    }
    return { change: last - start, plies: used };
  } catch {
    return { change: 0, plies: 0 };
  }
}

export interface MoveDetail {
  uci: string;
  san: string;
  pieceType: number;
  from: number;
  to: number;
  /** Type of the piece taken (pawn for en passant), or 0. */
  captured: number;
  promotion: number;
  castle: boolean;
  check: boolean;
  checkmate: boolean;
}

/** Describe one move in a position (null if it is not legal there). */
export function describeMove(fen: string, uci: string): MoveDetail | null {
  try {
    const pos = new Position(fen);
    const m = pos.parseUci(uci);
    if (m === undefined) return null;
    const from = moveFrom(m);
    const to = moveTo(m);
    const flags = moveFlags(m);
    const captured = (flags & FLAG_EP) !== 0 ? PAWN : pieceType(pos.board[to]!);
    const san = pos.toSan(m);
    return {
      uci,
      san,
      pieceType: pieceType(pos.board[from]!),
      from,
      to,
      captured: (flags & (FLAG_CAPTURE | FLAG_EP)) !== 0 ? captured : 0,
      promotion: movePromo(m),
      castle: (flags & 4) !== 0,
      check: san.endsWith('+') || san.endsWith('#'),
      checkmate: san.endsWith('#'),
    };
  } catch {
    return null;
  }
}

export const where = (sq: number): string => squareName(sq);
export const fileLetter = (sq: number): string => 'abcdefgh'[fileOf(sq)]!;
