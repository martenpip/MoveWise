/**
 * Board facts the Trainer may state. Everything here is computed from the position by the rules engine; nothing is guessed.
 */
import { Position } from '../chess/position';
import { KING, PAWN, squareName, type Color } from '../chess/types';
import { POINTS, pieceWord } from '../review/facts';

export interface LoosePiece {
  sq: number;
  type: number;
  /** Why it is loose: nothing defends it, or a cheaper piece attacks it. */
  why: 'undefended' | 'outvalued';
}

/**
 * Pieces of `color` (not kings, not pawns) that the opponent attacks and could win: either nothing defends them, or the attacker is
 * worth less. This is a static count of attackers and defenders; it does not look at pins or longer exchanges, so the Trainer
 * words it as "can be captured", never as "will be lost".
 */
export function loosePieces(fen: string, color: Color): LoosePiece[] {
  const pos = new Position(fen);
  const out: LoosePiece[] = [];
  for (let sq = 0; sq < 64; sq++) {
    const p = pos.board[sq]!;
    if (!p || p >> 3 !== color) continue;
    const type = p & 7;
    if (type === KING || type === PAWN) continue;
    const attackers = pos.attackersOf(sq, (color ^ 1) as Color);
    if (attackers.length === 0) continue;
    const defended = pos.attackersOf(sq, color).length > 0;
    const cheapest = Math.min(...attackers.map((a) => POINTS[pos.board[a]! & 7] ?? 0));
    if (!defended) out.push({ sq, type, why: 'undefended' });
    else if (cheapest < (POINTS[type] ?? 0)) out.push({ sq, type, why: 'outvalued' });
  }
  return out.sort((a, b) => (POINTS[b.type] ?? 0) - (POINTS[a.type] ?? 0));
}

export const looseText = (l: LoosePiece): string => `${pieceWord(l.type)} on ${squareName(l.sq)}`;

/** Enemy pieces (not pawns) that the piece which just moved to `to` now attacks. */
export function attackedBy(fenAfter: string, to: number): LoosePiece[] {
  const pos = new Position(fenAfter);
  const mover = (pos.board[to]! >> 3) as Color;
  const out: LoosePiece[] = [];
  for (let sq = 0; sq < 64; sq++) {
    const p = pos.board[sq]!;
    if (!p || p >> 3 === mover || (p & 7) === PAWN || (p & 7) === KING) continue;
    if (pos.attackersOf(sq, mover).includes(to)) {
      const defended = pos.attackersOf(sq, (mover ^ 1) as Color).length > 0;
      out.push({ sq, type: p & 7, why: defended ? 'outvalued' : 'undefended' });
    }
  }
  return out;
}
