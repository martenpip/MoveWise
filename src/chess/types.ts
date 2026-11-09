/**
 * Core chess types. Pieces are small integers: low 3 bits = type, bit 3 = colour.
 * Squares are 0..63 with a1 = 0, b1 = 1 … h8 = 63.
 * Moves are packed into a number: from | to << 6 | promo << 12 | flags << 15.
 */

export type Color = 0 | 1;
export const WHITE: Color = 0;
export const BLACK: Color = 1;

export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;

export type PieceType = 1 | 2 | 3 | 4 | 5 | 6;

export const FLAG_CAPTURE = 1;
export const FLAG_EP = 2;
export const FLAG_CASTLE = 4;
export const FLAG_DOUBLE = 8;

export const CASTLE_WK = 1;
export const CASTLE_WQ = 2;
export const CASTLE_BK = 4;
export const CASTLE_BQ = 8;

export type Move = number;

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const pieceColor = (p: number): Color => (p >> 3) as Color;
export const pieceType = (p: number): number => p & 7;
export const makePiece = (type: number, color: Color): number => type | (color << 3);

export const fileOf = (sq: number): number => sq & 7;
export const rankOf = (sq: number): number => sq >> 3;

export const moveFrom = (m: Move): number => m & 63;
export const moveTo = (m: Move): number => (m >> 6) & 63;
export const movePromo = (m: Move): number => (m >> 12) & 7;
export const moveFlags = (m: Move): number => m >> 15;
export const makeMove = (from: number, to: number, promo = 0, flags = 0): Move =>
  from | (to << 6) | (promo << 12) | (flags << 15);

const FILES = 'abcdefgh';
export const squareName = (sq: number): string => FILES[sq & 7]! + String((sq >> 3) + 1);
export const parseSquare = (name: string): number => {
  if (name.length !== 2) return -1;
  const f = FILES.indexOf(name[0]!);
  const r = name.charCodeAt(1) - 49;
  if (f < 0 || r < 0 || r > 7) return -1;
  return r * 8 + f;
};

const PIECE_CHARS = ' PNBRQK';
export const pieceToChar = (p: number): string => {
  const c = PIECE_CHARS[p & 7]!;
  return p >> 3 ? c.toLowerCase() : c;
};
export const charToPiece = (ch: string): number => {
  const idx = PIECE_CHARS.indexOf(ch.toUpperCase());
  if (idx <= 0) return 0;
  return makePiece(idx, ch === ch.toUpperCase() ? WHITE : BLACK);
};

/** UCI long-algebraic text for a move, e.g. "e2e4" or "e7e8q". */
export const moveToUci = (m: Move): string => {
  const promo = movePromo(m);
  return (
    squareName(moveFrom(m)) +
    squareName(moveTo(m)) +
    (promo ? PIECE_CHARS[promo]!.toLowerCase() : '')
  );
};

export type GameResult = '1-0' | '0-1' | '1/2-1/2' | '*';
export type GameEndReason =
  | 'checkmate'
  | 'stalemate'
  | 'insufficient-material'
  | 'threefold-repetition'
  | 'fifty-move-rule'
  | 'resignation'
  | 'agreement';

export interface GameStatus {
  over: boolean;
  result: GameResult;
  reason?: GameEndReason;
  check: boolean;
}
