import { pieceColor, pieceType } from '../chess/types';
import { BLACK_PALETTE, PIECE_PARTS, STROKE_WIDTH, WHITE_PALETTE } from './pieceShapes';

/**
 * Piece rendering. The artwork lives in `pieceShapes.ts` (plain data) so it can be reviewed,
 * rendered to images and tested without React. To add another piece set later, add a second
 * `PIECE_PARTS`-style table and select it here; callers only use `PieceG` / `PieceIcon`.
 */

/** A piece as an SVG group in a 45×45 box. */
export function PieceG({ piece }: { piece: number }) {
  const p = pieceColor(piece) === 0 ? WHITE_PALETTE : BLACK_PALETTE;
  const parts = PIECE_PARTS[pieceType(piece)] ?? [];
  return (
    <g>
      {parts.map((part, i) => {
        switch (part.kind) {
          case 'body':
            return <path key={i} d={part.d} fill={p.fill} stroke={p.stroke} strokeWidth={STROKE_WIDTH} strokeLinejoin="round" />;
          case 'shade':
            return <path key={i} d={part.d} fill={p.shade} />;
          case 'hl':
            return <path key={i} d={part.d} fill="none" stroke={p.hl} strokeWidth="1.1" strokeLinecap="round" />;
          case 'line':
            return <path key={i} d={part.d} fill="none" stroke={p.line} strokeWidth="0.9" strokeLinecap="round" />;
          case 'eye':
            return <path key={i} d={part.d} fill={p.eye} />;
        }
      })}
    </g>
  );
}

const NAMES = ['', 'pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];
export const pieceName = (piece: number): string =>
  `${pieceColor(piece) === 0 ? 'white' : 'black'} ${NAMES[pieceType(piece)]}`;

/** Standalone piece icon (captured-piece rows, promotion picker, profile avatars). */
export function PieceIcon({ piece, size = 40 }: { piece: number; size?: number }) {
  return (
    <svg viewBox="0 0 45 45" width={size} height={size} aria-hidden="true" focusable="false">
      <PieceG piece={piece} />
    </svg>
  );
}
