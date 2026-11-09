import {
  BISHOP,
  BLACK,
  KING,
  KNIGHT,
  PAWN,
  QUEEN,
  ROOK,
  WHITE,
  fileOf,
  pieceColor,
  pieceType,
  rankOf,
} from '../chess/types';
import type { Position } from '../chess/position';

/**
 * Hand-tuned evaluation (centipawns, from the side to move's point of view).
 * Tables are written from White's perspective with rank 8 at the top for readability.
 * This is a simple classical evaluation — it is NOT Stockfish and does not claim to be.
 */

const VALUE = [0, 100, 320, 330, 500, 900, 0];

// prettier-ignore
const PST_TEXT: Record<number, number[]> = {
  [PAWN]: [
     0,  0,  0,  0,  0,  0,  0,  0,
    60, 60, 60, 60, 60, 60, 60, 60,
    30, 30, 35, 40, 40, 35, 30, 30,
    10, 10, 15, 30, 30, 15, 10, 10,
     4,  4,  8, 24, 24,  8,  4,  4,
     2, -2, -4,  6,  6, -4, -2,  2,
     2,  4,  4,-18,-18,  4,  4,  2,
     0,  0,  0,  0,  0,  0,  0,  0,
  ],
  [KNIGHT]: [
   -50,-38,-28,-24,-24,-28,-38,-50,
   -38,-18,  0,  4,  4,  0,-18,-38,
   -28,  2, 14, 18, 18, 14,  2,-28,
   -24,  6, 18, 24, 24, 18,  6,-24,
   -24,  4, 18, 24, 24, 18,  4,-24,
   -28,  6, 12, 16, 16, 12,  6,-28,
   -38,-18,  2,  6,  6,  2,-18,-38,
   -50,-38,-28,-24,-24,-28,-38,-50,
  ],
  [BISHOP]: [
   -20,-10,-10,-10,-10,-10,-10,-20,
   -10,  0,  0,  0,  0,  0,  0,-10,
   -10,  0,  8, 12, 12,  8,  0,-10,
   -10,  6,  8, 14, 14,  8,  6,-10,
   -10,  0, 12, 14, 14, 12,  0,-10,
   -10, 10, 10, 10, 10, 10, 10,-10,
   -10,  8,  0,  0,  0,  0,  8,-10,
   -20,-10,-10,-10,-10,-10,-10,-20,
  ],
  [ROOK]: [
     0,  0,  0,  0,  0,  0,  0,  0,
     8, 14, 14, 14, 14, 14, 14,  8,
    -4,  0,  0,  0,  0,  0,  0, -4,
    -4,  0,  0,  0,  0,  0,  0, -4,
    -4,  0,  0,  0,  0,  0,  0, -4,
    -4,  0,  0,  0,  0,  0,  0, -4,
    -4,  0,  0,  0,  0,  0,  0, -4,
     0,  0,  2,  6,  6,  2,  0,  0,
  ],
  [QUEEN]: [
   -20,-10,-10, -4, -4,-10,-10,-20,
   -10,  0,  0,  0,  0,  0,  0,-10,
   -10,  0,  6,  6,  6,  6,  0,-10,
    -4,  0,  6,  8,  8,  6,  0, -4,
    -4,  0,  6,  8,  8,  6,  0, -4,
   -10,  4,  6,  6,  6,  6,  0,-10,
   -10,  0,  4,  0,  0,  0,  0,-10,
   -20,-10,-10, -4, -4,-10,-10,-20,
  ],
};

// prettier-ignore
const KING_MG_TEXT = [
  -40,-50,-50,-60,-60,-50,-50,-40,
  -40,-50,-50,-60,-60,-50,-50,-40,
  -40,-50,-50,-60,-60,-50,-50,-40,
  -40,-50,-50,-60,-60,-50,-50,-40,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -20,-30,-30,-30,-30,-30,-30,-20,
   10,  5,-10,-20,-20,-10,  5, 10,
   25, 35, 12, -8,  0, 10, 35, 25,
];
// prettier-ignore
const KING_EG_TEXT = [
  -50,-30,-20,-20,-20,-20,-30,-50,
  -30,-10,  0,  5,  5,  0,-10,-30,
  -20,  0, 15, 20, 20, 15,  0,-20,
  -20,  5, 20, 30, 30, 20,  5,-20,
  -20,  5, 20, 30, 30, 20,  5,-20,
  -20,  0, 15, 20, 20, 15,  0,-20,
  -30,-10,  0,  5,  5,  0,-10,-30,
  -50,-30,-20,-20,-20,-20,-30,-50,
];

/** Convert a rank-8-first table to a1-indexed [white], and a mirrored [black] table. */
function toTables(text: number[]): [Int16Array, Int16Array] {
  const white = new Int16Array(64);
  const black = new Int16Array(64);
  for (let sq = 0; sq < 64; sq++) {
    const f = sq & 7;
    const r = sq >> 3;
    white[sq] = text[(7 - r) * 8 + f]!;
    black[sq] = text[r * 8 + f]!;
  }
  return [white, black];
}

const PST: Array<[Int16Array, Int16Array]> = [];
PST[PAWN] = toTables(PST_TEXT[PAWN]!);
PST[KNIGHT] = toTables(PST_TEXT[KNIGHT]!);
PST[BISHOP] = toTables(PST_TEXT[BISHOP]!);
PST[ROOK] = toTables(PST_TEXT[ROOK]!);
PST[QUEEN] = toTables(PST_TEXT[QUEEN]!);
const KING_MG = toTables(KING_MG_TEXT);
const KING_EG = toTables(KING_EG_TEXT);

/** Weight multipliers that give each bot personality a different evaluation bias. */
export interface Style {
  id: string;
  /** Reward for pieces close to the enemy king. */
  attack: number;
  /** Reward for a sheltered own king and penalty for advancing pawns near it. */
  safety: number;
  /** Pawn-structure term weight (doubled, isolated, passed). */
  structure: number;
  /** Endgame knowledge weight (king activity, passed pawns). */
  endgame: number;
  /** Small bonus/penalty applied to capturing or checking moves when picking among candidates. */
  rootTactical: number;
}

export const STYLES: Record<string, Style> = {
  balanced: { id: 'balanced', attack: 1, safety: 1, structure: 1, endgame: 1, rootTactical: 0 },
  aggressive: { id: 'aggressive', attack: 2.2, safety: 0.5, structure: 0.7, endgame: 0.9, rootTactical: 18 },
  defensive: { id: 'defensive', attack: 0.4, safety: 2.2, structure: 1.1, endgame: 1, rootTactical: -10 },
  positional: { id: 'positional', attack: 0.8, safety: 1, structure: 2.2, endgame: 1.2, rootTactical: -6 },
  tactical: { id: 'tactical', attack: 1.4, safety: 0.9, structure: 0.8, endgame: 0.9, rootTactical: 28 },
  endgame: { id: 'endgame', attack: 0.7, safety: 1, structure: 1.4, endgame: 2.4, rootTactical: -4 },
};

const chebyshev = (a: number, b: number): number =>
  Math.max(Math.abs(fileOf(a) - fileOf(b)), Math.abs(rankOf(a) - rankOf(b)));

/** Evaluate from the side to move's perspective. */
export function evaluate(pos: Position, style: Style = STYLES.balanced!): number {
  const b = pos.board;
  let mg = 0;
  let eg = 0;
  let phase = 0;
  const bishops = [0, 0];
  const pawnsPerFile = [new Int8Array(8), new Int8Array(8)];
  const pawnSquares: number[][] = [[], []];

  for (let sq = 0; sq < 64; sq++) {
    const p = b[sq]!;
    if (!p) continue;
    const c = pieceColor(p);
    const t = pieceType(p);
    const sign = c === WHITE ? 1 : -1;
    if (t === KING) {
      mg += sign * KING_MG[c]![sq]!;
      eg += sign * KING_EG[c]![sq]!;
      continue;
    }
    const v = VALUE[t]! + PST[t]![c]![sq]!;
    mg += sign * v;
    eg += sign * (t === PAWN ? v + 10 : v);
    if (t === KNIGHT || t === BISHOP) phase += 1;
    else if (t === ROOK) phase += 2;
    else if (t === QUEEN) phase += 4;
    if (t === BISHOP) bishops[c]!++;
    if (t === PAWN) {
      pawnsPerFile[c]![fileOf(sq)]!++;
      pawnSquares[c]!.push(sq);
    }
  }
  phase = Math.min(phase, 24);

  let extraMg = 0;
  let extraEg = 0;
  for (const c of [WHITE, BLACK] as const) {
    const sign = c === WHITE ? 1 : -1;
    const enemy = c ^ 1;
    const ownKing = pos.kings[c];
    const enemyKing = pos.kings[enemy as 0 | 1];

    if (bishops[c]! >= 2) {
      extraMg += sign * 30;
      extraEg += sign * 45;
    }

    // Pawn structure and passed pawns.
    for (const sq of pawnSquares[c]!) {
      const f = fileOf(sq);
      const r = rankOf(sq);
      const ahead = c === WHITE ? r : 7 - r; // 0..6 progress
      if (pawnsPerFile[c]![f]! > 1) extraMg -= sign * 10 * style.structure;
      const hasNeighbour =
        (f > 0 && pawnsPerFile[c]![f - 1]! > 0) || (f < 7 && pawnsPerFile[c]![f + 1]! > 0);
      if (!hasNeighbour) {
        extraMg -= sign * 12 * style.structure;
        extraEg -= sign * 14 * style.structure;
      }
      // Passed: no enemy pawn on same/adjacent files in front.
      let passed = true;
      for (const es of pawnSquares[enemy]!) {
        const ef = fileOf(es);
        if (Math.abs(ef - f) > 1) continue;
        const er = rankOf(es);
        if (c === WHITE ? er > r : er < r) {
          passed = false;
          break;
        }
      }
      if (passed) {
        const bonus = [0, 5, 10, 20, 38, 65, 100][ahead] ?? 0;
        extraMg += sign * Math.round(bonus * 0.5 * style.structure);
        extraEg += sign * Math.round(bonus * 1.3 * style.endgame);
      }
      // Pawn shelter: pawns in front of the own king.
      if (Math.abs(f - fileOf(ownKing)) <= 1) {
        const dr = c === WHITE ? r - rankOf(ownKing) : rankOf(ownKing) - r;
        if (dr === 1) extraMg += sign * Math.round(14 * style.safety);
        else if (dr === 2) extraMg += sign * Math.round(7 * style.safety);
      }
    }

    // Attack: own non-pawn pieces near the enemy king; safety: enemy pieces near ours.
    for (let sq = 0; sq < 64; sq++) {
      const p = b[sq]!;
      if (!p || pieceColor(p) !== c) continue;
      const t = pieceType(p);
      if (t === PAWN || t === KING) continue;
      const d = chebyshev(sq, enemyKing);
      if (d <= 3) {
        const w = t === QUEEN ? 8 : t === ROOK ? 5 : 4;
        extraMg += sign * Math.round((4 - d) * w * style.attack * 0.6);
      }
    }
    if (c === WHITE || c === BLACK) {
      // Open files next to own king are a liability in the middlegame.
      const kf = fileOf(ownKing);
      for (let f = Math.max(0, kf - 1); f <= Math.min(7, kf + 1); f++) {
        if (pawnsPerFile[c]![f] === 0) extraMg -= sign * Math.round(12 * style.safety);
      }
    }
    // Endgame: reward king centralisation / proximity to passed pawns handled via KING_EG; add activity weight.
    const centre = 6 - (Math.abs(fileOf(ownKing) * 2 - 7) + Math.abs(rankOf(ownKing) * 2 - 7)) / 2;
    extraEg += sign * Math.round(centre * 3 * (style.endgame - 1));
  }

  const mgScore = mg + extraMg;
  const egScore = eg + extraEg;
  const white = Math.round((mgScore * phase + egScore * (24 - phase)) / 24);
  return pos.turn === WHITE ? white + 8 : -white + 8; // small tempo bonus
}

export const PIECE_VALUE = VALUE;

/** Material-only balance (white minus black), used for coaching text. */
export function materialBalance(pos: Position): number {
  let s = 0;
  for (let sq = 0; sq < 64; sq++) {
    const p = pos.board[sq]!;
    if (!p) continue;
    s += (pieceColor(p) === WHITE ? 1 : -1) * VALUE[pieceType(p)]!;
  }
  return s;
}
