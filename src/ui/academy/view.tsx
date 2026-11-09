/** Turns Academy content (positions as FEN and square names) into what the Board draws. */
import { Position } from '../../chess/position';
import { KING, WHITE, makePiece, moveFrom, moveTo, movePromo, parseSquare, type Color } from '../../chess/types';
import type { BoardSpec } from '../../academy/types';
import { Board, type BoardProps } from '../Board';
import { useApp } from '../app';

export const EMPTY_BOARD: number[] = Array(64).fill(0);

export function boardOf(fen: string): ArrayLike<number> {
  return fen === 'empty' ? EMPTY_BOARD : new Position(fen).board;
}

export function checkSquareOf(pos: Position): number {
  if (!pos.inCheck()) return -1;
  const k = makePiece(KING, pos.turn);
  for (let i = 0; i < 64; i++) if (pos.board[i] === k) return i;
  return -1;
}

export function specExtras(spec: BoardSpec): Pick<BoardProps, 'arrows' | 'highlights' | 'lastMove'> {
  return {
    arrows: spec.arrows?.map((a) => ({ from: parseSquare(a.from), to: parseSquare(a.to), tone: a.tone ?? 'info' })),
    highlights: spec.marks?.map((m) => ({ sq: parseSquare(m.sq), tone: m.tone ?? 'mark' })),
    lastMove: spec.last ? { from: parseSquare(spec.last.from), to: parseSquare(spec.last.to) } : null,
  };
}

const NONE = {
  interactive: false,
  isMovable: () => false,
  destinations: () => [] as number[],
  needsPromotion: () => false,
  onMove: () => undefined,
  showLegalMoves: false,
  promoColor: WHITE as Color,
};

/** A board that only shows a position. */
export function StaticBoard({ spec, label, board, extras }: { spec: BoardSpec; label: string; board?: ArrayLike<number>; extras?: Partial<BoardProps> }) {
  const fen = spec.fen;
  const pos = fen === 'empty' ? null : new Position(fen);
  return (
    <div className="ac-board">
      <Board
        {...NONE}
        board={board ?? (pos ? pos.board : EMPTY_BOARD)}
        orientation={spec.orientation ?? 'white'}
        checkSquare={pos ? checkSquareOf(pos) : -1}
        ariaLabel={label}
        {...specExtras(spec)}
        {...extras}
      />
    </div>
  );
}

/** A board where the learner plays a legal move from the given position. */
export function MoveBoard({
  pos, orientation, label, onMove, extras, disabled,
}: {
  pos: Position;
  orientation: 'white' | 'black';
  label: string;
  onMove: (uci: string) => void;
  extras?: Partial<BoardProps>;
  disabled?: boolean;
}) {
  const { settings, playSound } = useApp();
  const legal = pos.legalMoves();
  return (
    <div className="ac-board">
      <Board
        board={pos.board}
        orientation={orientation}
        checkSquare={checkSquareOf(pos)}
        interactive={!disabled}
        isMovable={(s) => legal.some((m) => moveFrom(m) === s)}
        destinations={(s) => legal.filter((m) => moveFrom(m) === s).map(moveTo)}
        needsPromotion={(f, t) => legal.some((m) => moveFrom(m) === f && moveTo(m) === t && movePromo(m) !== 0)}
        onMove={(f, t, p) => onMove(`${'abcdefgh'[f & 7]}${(f >> 3) + 1}${'abcdefgh'[t & 7]}${(t >> 3) + 1}${['', '', 'n', 'b', 'r', 'q'][p] ?? ''}`)}
        onSound={playSound}
        showLegalMoves={settings.showLegalMoves}
        promoColor={pos.turn}
        ariaLabel={label}
        {...extras}
      />
    </div>
  );
}

/** A board where the learner clicks squares (no pieces are picked up). */
export function SquareBoard({
  board, orientation, label, onSquare, extras, disabled,
}: {
  board: ArrayLike<number>;
  orientation: 'white' | 'black';
  label: string;
  onSquare: (sq: number) => void;
  extras?: Partial<BoardProps>;
  disabled?: boolean;
}) {
  return (
    <div className="ac-board">
      <Board {...NONE} interactive={!disabled} board={board} orientation={orientation} ariaLabel={label} onSquare={onSquare} showLegalMoves={false} {...extras} />
    </div>
  );
}
