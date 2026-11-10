import { useEffect, useLayoutEffect, useRef } from 'react';
import { Position } from '../chess/position';
import { BISHOP, KNIGHT, PAWN, QUEEN, ROOK, makePiece, pieceColor, pieceType, type Color } from '../chess/types';
import type { Game, PlayedMove } from '../chess/game';
import { BUILTIN_ENGINE_INFO } from '../engine/client';
import { PIECE_VALUE } from '../engine/eval';
import { PieceIcon } from './pieces';

/**
 * Who produced an evaluation, in words that never claim more than the truth: an engine is named only once it has
 * actually answered (until then, "The engine"), Stockfish only when it really answered, and the built-in engine
 * always says it is not Stockfish.
 */
export function engineLabel(reply: { engine?: string } | null | undefined): string {
  if (!reply) return 'The engine';
  return !reply.engine || reply.engine === BUILTIN_ENGINE_INFO.name ? 'Built-in engine (not Stockfish)' : reply.engine;
}

/** FEN of the position after `ply` half-moves (0 = start). */
export const fenAtPly = (game: Game, ply: number): string => (ply <= 0 ? game.startFen : game.moves[ply - 1]!.fen);

export interface BoardView {
  board: Int8Array;
  lastMove: { from: number; to: number } | null;
  checkSquare: number;
  turn: Color;
  fen: string;
}

export function viewAt(game: Game, ply: number): BoardView {
  const fen = fenAtPly(game, ply);
  const pos = new Position(fen);
  const last = ply > 0 ? game.moves[ply - 1]!.move : 0;
  return {
    board: pos.board,
    lastMove: ply > 0 ? { from: last & 63, to: (last >> 6) & 63 } : null,
    checkSquare: pos.inCheck() ? pos.kings[pos.turn] : -1,
    turn: pos.turn,
    fen,
  };
}

const START_COUNTS: Record<number, number> = { [PAWN]: 8, [KNIGHT]: 2, [BISHOP]: 2, [ROOK]: 2, [QUEEN]: 1 };
const ORDER = [QUEEN, ROOK, BISHOP, KNIGHT, PAWN];

/** Pieces of `color` that have been captured, and the material lead of that colour's opponent. */
export function captured(board: ArrayLike<number>, color: Color): { pieces: number[]; lead: number } {
  const have: Record<number, number> = {};
  let ownMat = 0;
  let oppMat = 0;
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq]!;
    if (!p) continue;
    const t = pieceType(p);
    if (t === 6) continue;
    if (pieceColor(p) === color) {
      have[t] = (have[t] ?? 0) + 1;
      ownMat += PIECE_VALUE[t]!;
    } else oppMat += PIECE_VALUE[t]!;
  }
  const pieces: number[] = [];
  for (const t of ORDER) {
    const missing = Math.max(0, START_COUNTS[t]! - (have[t] ?? 0));
    for (let i = 0; i < missing; i++) pieces.push(makePiece(t, color));
  }
  return { pieces, lead: oppMat - ownMat };
}

export function CapturedRow({ board, ofColor, showLeadFor }: { board: ArrayLike<number>; ofColor: Color; showLeadFor: Color }) {
  const c = captured(board, ofColor);
  const lead = showLeadFor === (ofColor ^ 1) ? c.lead : 0;
  return (
    <span className="captured" role="img" aria-label={c.pieces.length ? `Captured ${c.pieces.length} pieces` : 'No captures'}>
      {c.pieces.map((p, i) => (
        <PieceIcon key={i} piece={p} size={20} />
      ))}
      {lead > 0 && (
        <span style={{ marginLeft: 12 }} className="mono">
          +{Math.round(lead / 100)}
        </span>
      )}
    </span>
  );
}

export function MoveList({ moves, current, onSelect }: { moves: readonly PlayedMove[]; current: number; onSelect: (ply: number) => void }) {
  if (moves.length === 0) return <p className="muted small">No moves yet.</p>;
  const rows = [];
  for (let i = 0; i < moves.length; i += 2) {
    rows.push(
      <div key={`n${i}`} className="num">
        {i / 2 + 1}.
      </div>,
      <button key={`w${i}`} type="button" aria-current={current === i + 1} onClick={() => onSelect(i + 1)}>
        {moves[i]!.san}
      </button>,
      moves[i + 1] ? (
        <button key={`b${i}`} type="button" aria-current={current === i + 2} onClick={() => onSelect(i + 2)}>
          {moves[i + 1]!.san}
        </button>
      ) : (
        <span key={`b${i}`} />
      ),
    );
  }
  return (
    <div className="movelist" role="group" aria-label="Move list">
      {rows}
    </div>
  );
}

/**
 * A single scrolling row of moves for phones, shown directly under the board so the game can be followed without scrolling.
 * The current move is kept in view. The full list stays in the side panel on larger screens.
 */
export function MoveStrip({ moves, current, onSelect, onFlip }: { moves: readonly PlayedMove[]; current: number; onSelect: (ply: number) => void; onFlip: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>('[aria-current="true"]');
    const wrap = box.current;
    if (!el || !wrap) return;
    wrap.scrollLeft = el.offsetLeft - wrap.clientWidth / 2 + el.offsetWidth / 2;
  }, [current, moves.length]);
  const items = [];
  for (let i = 0; i < moves.length; i++) {
    if (i % 2 === 0) items.push(<span key={`n${i}`} className="ms-num">{i / 2 + 1}.</span>);
    items.push(
      <button key={`m${i}`} type="button" className="ms-move" aria-current={current === i + 1} onClick={() => onSelect(i + 1)}>
        {moves[i]!.san}
      </button>,
    );
  }
  return (
    <div className="move-strip" role="group" aria-label="Moves">
      <button className="ms-nav" type="button" onClick={() => onSelect(current - 1)} disabled={current === 0} aria-label="Previous move">‹</button>
      <div className="ms-scroll" ref={box}>{moves.length === 0 ? <span className="ms-empty">No moves yet</span> : items}</div>
      <button className="ms-nav" type="button" onClick={() => onSelect(current + 1)} disabled={current >= moves.length} aria-label="Next move">›</button>
      <button className="ms-nav ms-flip" type="button" onClick={onFlip} aria-label="Flip the board">⇅</button>
    </div>
  );
}

/** Evaluation in pawns from White's perspective, e.g. "+0.4", "-1.2", "M3". */
export function formatScore(cp: number, mate: number | null): string {
  if (mate !== null) return `${mate > 0 ? '' : '-'}M${Math.abs(mate)}`;
  const v = cp / 100;
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
}

export function EvalBar({ cp, mate, flipped }: { cp: number | null; mate: number | null; flipped: boolean }) {
  let whiteShare = 50;
  if (cp !== null) {
    whiteShare = mate !== null ? (mate > 0 ? 100 : 0) : 50 + 50 * (2 / (1 + Math.exp(-cp / 350)) - 1);
  }
  const label = cp === null ? '' : formatScore(cp, mate);
  const text = cp === null ? 'Evaluation not available yet' : `Engine evaluation ${label} for White`;
  return (
    <div className="evalbar" role="img" aria-label={text} title={text} style={{ transform: flipped ? 'rotate(180deg)' : undefined }}>
      <div className="white-part" style={{ height: `${whiteShare}%` }} />
      {cp !== null && (
        <span className="label" style={{ top: whiteShare > 50 ? 4 : undefined, bottom: whiteShare > 50 ? undefined : 4, transform: flipped ? 'rotate(180deg)' : undefined }}>
          {label}
        </span>
      )}
    </div>
  );
}

/** Save text as a file in the browser (no network involved). */
export function downloadText(filename: string, text: string, mime = 'text/plain'): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export const newId = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const formatDate = (t: number): string =>
  new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

/**
 * Put it as the first child of a `.game-layout`. On a tablet or desktop it pushes the side column down until its top is level with
 * the top of the board, whatever sits above the board (a back link, a player name, a coach bubble). On a phone the layout is one
 * column and nothing is moved. It renders nothing visible.
 */
export function AlignSideToBoard() {
  const marker = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const layout = marker.current?.parentElement;
    if (!layout) return undefined;
    const apply = () => {
      const board = layout.querySelector('svg.board');
      const side = layout.lastElementChild as HTMLElement | null;
      if (!board || !side || side === marker.current) return;
      side.style.marginTop = '';
      if (!window.matchMedia('(min-width: 901px)').matches) return;
      const d = board.getBoundingClientRect().top - side.getBoundingClientRect().top;
      if (d > 0) side.style.marginTop = `${Math.round(d)}px`;
    };
    apply();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(apply);
    const col = layout.querySelector('.board-col');
    if (ro && col) ro.observe(col);
    window.addEventListener('resize', apply);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', apply);
      if (layout.lastElementChild) (layout.lastElementChild as HTMLElement).style.marginTop = '';
    };
  });
  return <i ref={marker} hidden />;
}
