import { useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { BISHOP, KNIGHT, PAWN, QUEEN, ROOK, fileOf, makePiece, pieceType, rankOf, squareName, type Color } from '../chess/types';
import { PieceG, PieceIcon, pieceName } from './pieces';

export interface BoardProps {
  /** 64 piece codes, a1 = index 0. */
  board: ArrayLike<number>;
  orientation: 'white' | 'black';
  lastMove?: { from: number; to: number } | null;
  /** Square of a king in check, or -1. */
  checkSquare?: number;
  /** When false the board is display-only (e.g. while viewing history). */
  interactive: boolean;
  isMovable: (sq: number) => boolean;
  destinations: (sq: number) => number[];
  needsPromotion: (from: number, to: number) => boolean;
  onMove: (from: number, to: number, promotion: number) => void;
  /** Optional feedback hooks: a piece was picked up, or a move was attempted that is not legal. */
  onSound?: (kind: 'select' | 'illegal') => void;
  showLegalMoves: boolean;
  /** Colour of the side promoting (for the picker icons). */
  promoColor: Color;
  /** Accessible description of the position. */
  ariaLabel: string;
  /** Optional arrows drawn over the pieces (Game Review marks the engine's move this way). */
  arrows?: Array<{ from: number; to: number; tone: 'best' | 'played' | 'info' }>;
  /** Squares to ring (the puzzle trainer's third hint). `bad` rings in the error colour. */
  highlights?: Array<{ sq: number; tone: 'hint' | 'bad' | 'good' | 'mark' }>;
  /** Square-pick mode (Academy exercises): a click or Enter reports the square and no piece is picked up. */
  onSquare?: (sq: number) => void;
}

const SQ = 100;

export function Board(props: BoardProps) {
  const { board, orientation, lastMove, checkSquare = -1, interactive, showLegalMoves } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  // Selection and promotion are tied to the position they were made on, so they are dropped
  // automatically (without an effect, and without any race) when the position changes.
  const boardKey = Array.from(board).join(',');
  const [selRaw, setSelRaw] = useState<{ sq: number; key: string } | null>(null);
  const [drag, setDrag] = useState<{ from: number; x: number; y: number } | null>(null);
  const [promoRaw, setPromoRaw] = useState<{ from: number; to: number; key: string } | null>(null);
  const selected = selRaw && selRaw.key === boardKey ? selRaw.sq : null;
  const promo = promoRaw && promoRaw.key === boardKey ? { from: promoRaw.from, to: promoRaw.to } : null;
  const setSelected = (sq: number | null) => setSelRaw(sq === null ? null : { sq, key: boardKey });
  const setPromo = (p: { from: number; to: number } | null) => setPromoRaw(p ? { ...p, key: boardKey } : null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [announce, setAnnounce] = useState('');
  const suppressAnim = useRef<string>('');
  // The move whose slide has already played. A browser restarts a CSS animation when React re-inserts the element (it does so for
  // pieces that did not move), so the slide class is removed when the animation ends and is never applied twice for one move.
  const slidDone = useRef<string>('');
  const white = orientation === 'white';

  const pos = (sq: number) => {
    const f = fileOf(sq);
    const r = rankOf(sq);
    return { x: (white ? f : 7 - f) * SQ, y: (white ? 7 - r : r) * SQ };
  };

  const squareAt = (clientX: number, clientY: number): number => {
    const rect = svgRef.current!.getBoundingClientRect();
    const col = Math.floor(((clientX - rect.left) / rect.width) * 8);
    const row = Math.floor(((clientY - rect.top) / rect.height) * 8);
    if (col < 0 || col > 7 || row < 0 || row > 7) return -1;
    return (white ? 7 - row : row) * 8 + (white ? col : 7 - col);
  };

  const toBoardUnits = (clientX: number, clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: ((clientX - rect.left) / rect.width) * 800, y: ((clientY - rect.top) / rect.height) * 800 };
  };

  const attempt = (from: number, to: number, viaDrag: boolean) => {
    if (viaDrag) suppressAnim.current = `${from}-${to}`;
    setSelected(null);
    if (props.needsPromotion(from, to)) {
      setPromo({ from, to });
      return;
    }
    setAnnounce(`${squareName(from)} to ${squareName(to)}`);
    props.onMove(from, to, 0);
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!interactive || promo) return;
    const sq = squareAt(e.clientX, e.clientY);
    if (sq < 0) return;
    if (props.onSquare) {
      setCursor(sq);
      props.onSquare(sq);
      return;
    }
    if (selected !== null && props.destinations(selected).includes(sq)) {
      attempt(selected, sq, false);
      return;
    }
    if (props.isMovable(sq)) {
      if (sq !== selected) props.onSound?.('select');
      setSelected(sq);
      setCursor(sq);
      const p = toBoardUnits(e.clientX, e.clientY);
      setDrag({ from: sq, ...p });
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    } else {
      // A piece was selected and the person pressed somewhere it cannot go.
      if (selected !== null && !props.isMovable(sq)) props.onSound?.('illegal');
      setSelected(null);
    }
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag) return;
    setDrag({ from: drag.from, ...toBoardUnits(e.clientX, e.clientY) });
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    if (!drag) return;
    const target = squareAt(e.clientX, e.clientY);
    const from = drag.from;
    setDrag(null);
    if (target >= 0 && target !== from && props.destinations(from).includes(target)) {
      attempt(from, target, true);
    } else if (target !== from) {
      if (target >= 0) props.onSound?.('illegal');
      setSelected(null);
    }
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (promo) {
      if (e.key === 'Escape') setPromo(null);
      return;
    }
    const cur = cursor ?? (white ? 12 : 52);
    const step = (df: number, dr: number) => {
      const f = Math.min(7, Math.max(0, fileOf(cur) + (white ? df : -df)));
      const r = Math.min(7, Math.max(0, rankOf(cur) + (white ? dr : -dr)));
      const next = r * 8 + f;
      setCursor(next);
      const piece = board[next];
      setAnnounce(`${squareName(next)}, ${piece ? pieceName(piece) : 'empty'}`);
    };
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        step(-1, 0);
        break;
      case 'ArrowRight':
        e.preventDefault();
        step(1, 0);
        break;
      case 'ArrowUp':
        e.preventDefault();
        step(0, 1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        step(0, -1);
        break;
      case 'Escape':
        setSelected(null);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (!interactive) break;
        if (props.onSquare) {
          props.onSquare(cur);
          break;
        }
        if (selected !== null && props.destinations(selected).includes(cur)) {
          attempt(selected, cur, false);
        } else if (props.isMovable(cur)) {
          setSelected(cur);
          const n = props.destinations(cur).length;
          setAnnounce(`Selected ${squareName(cur)}. ${n} legal ${n === 1 ? 'move' : 'moves'}. Move the cursor and press Enter to play.`);
        } else {
          setSelected(null);
        }
        break;
    }
  };

  const targets = selected !== null && showLegalMoves ? props.destinations(selected) : [];

  const squares = [];
  for (let sq = 0; sq < 64; sq++) {
    const { x, y } = pos(sq);
    const light = (fileOf(sq) + rankOf(sq)) % 2 === 1;
    squares.push(<rect key={`s${sq}`} x={x} y={y} width={SQ} height={SQ} fill={light ? 'var(--sq-light)' : 'var(--sq-dark)'} />);
  }

  const marks = [];
  if (lastMove) {
    for (const sq of [lastMove.from, lastMove.to]) {
      const { x, y } = pos(sq);
      marks.push(<rect key={`l${sq}`} x={x} y={y} width={SQ} height={SQ} fill="var(--hl-last)" />);
    }
  }
  if (selected !== null) {
    const { x, y } = pos(selected);
    marks.push(<rect key="sel" x={x} y={y} width={SQ} height={SQ} fill="var(--hl-select)" />);
  }
  for (const h of props.highlights ?? []) {
    const { x, y } = pos(h.sq);
    marks.push(<rect key={`h${h.sq}`} className={`board-ring ${h.tone}`} x={x + 5} y={y + 5} width={SQ - 10} height={SQ - 10} fill={h.tone === 'bad' ? 'rgb(243 121 108 / 0.28)' : h.tone === 'good' ? 'rgb(114 208 140 / 0.22)' : h.tone === 'mark' ? 'rgb(228 172 75 / 0.22)' : 'none'} stroke={h.tone === 'bad' ? 'var(--rv-blunder, #f3796c)' : h.tone === 'good' ? 'var(--good, #72d08c)' : h.tone === 'mark' ? 'var(--accent)' : 'var(--teal)'} strokeWidth="6" rx="8" />);
  }
  if (checkSquare >= 0) {
    const { x, y } = pos(checkSquare);
    marks.push(
      <g key="chk">
        <rect x={x} y={y} width={SQ} height={SQ} fill="url(#checkGlow)" />
        <rect x={x + 4} y={y + 4} width={SQ - 8} height={SQ - 8} fill="none" stroke="var(--hl-check)" strokeWidth="5" rx="6" />
      </g>,
    );
  }

  const coords = [];
  const bottomRank = white ? 0 : 7;
  const leftFile = white ? 0 : 7;
  const isLightSq = (file: number, rank: number) => (file + rank) % 2 === 1;
  for (let i = 0; i < 8; i++) {
    const file = white ? i : 7 - i;
    const rank = white ? 7 - i : i;
    coords.push(
      <text
        key={`f${i}`}
        x={i * SQ + SQ - 6}
        y={800 - 7}
        textAnchor="end"
        fontSize="20"
        fontWeight="700"
        fill={isLightSq(file, bottomRank) ? 'var(--sq-light-ink)' : 'var(--sq-dark-ink)'}
        style={{ pointerEvents: 'none' }}
      >
        {'abcdefgh'[file]}
      </text>,
      <text
        key={`r${i}`}
        x={6}
        y={i * SQ + 24}
        fontSize="20"
        fontWeight="700"
        fill={isLightSq(leftFile, rank) ? 'var(--sq-light-ink)' : 'var(--sq-dark-ink)'}
        style={{ pointerEvents: 'none' }}
      >
        {rank + 1}
      </text>,
    );
  }

  const dots = targets.map((sq) => {
    const { x, y } = pos(sq);
    const capture = board[sq] !== 0 || (selected !== null && pieceType(board[selected]!) === PAWN && fileOf(sq) !== fileOf(selected));
    const ink = (fileOf(sq) + rankOf(sq)) % 2 === 1 ? 'var(--dot-light)' : 'var(--dot-dark)';
    return capture ? (
      <circle key={`d${sq}`} cx={x + 50} cy={y + 50} r={43} fill="none" stroke={ink} strokeWidth="8" style={{ pointerEvents: 'none' }} />
    ) : (
      <circle key={`d${sq}`} cx={x + 50} cy={y + 50} r={14} fill={ink} style={{ pointerEvents: 'none' }} />
    );
  });

  const pieces = [];
  for (let sq = 0; sq < 64; sq++) {
    const piece = board[sq]!;
    if (!piece) continue;
    const { x, y } = pos(sq);
    const dragging = drag?.from === sq;
    const tx = dragging ? drag!.x - SQ / 2 : x;
    const ty = dragging ? drag!.y - SQ / 2 : y;
    let slide: { dx: number; dy: number } | null = null;
    const moveKey = lastMove ? `${lastMove.from}-${lastMove.to}-${boardKey}` : '';
    if (!dragging && lastMove && lastMove.to === sq && suppressAnim.current !== `${lastMove.from}-${lastMove.to}` && slidDone.current !== moveKey) {
      const from = pos(lastMove.from);
      slide = { dx: from.x - x, dy: from.y - y };
    }
    pieces.push(
      <g key={`p${sq}${piece}`} transform={`translate(${tx} ${ty})`} className={dragging ? 'piece dragging' : 'piece'} style={{ pointerEvents: 'none' }}>
        {/* The animated wrapper carries no transform attribute: a CSS transform animation would
            otherwise replace the scale below and shrink the piece mid-slide. */}
        <g
          className={slide ? 'slide' : undefined}
          onAnimationEnd={slide ? (e: { currentTarget: Element }) => { slidDone.current = moveKey; e.currentTarget.classList.remove('slide'); } : undefined}
          style={slide ? ({ '--dx': `${slide.dx}px`, '--dy': `${slide.dy}px` } as CSSProperties) : undefined}
        >
          <g transform={`scale(${SQ / 45})`}>
            <PieceG piece={piece} />
          </g>
        </g>
      </g>,
    );
  }
  // Draw the dragged piece last so it floats above the others.
  if (drag) pieces.sort((a, b) => (String(a.props.className).includes('dragging') ? 1 : 0) - (String(b.props.className).includes('dragging') ? 1 : 0));

  const focusRing =
    cursor !== null ? (
      <rect x={pos(cursor).x + 3} y={pos(cursor).y + 3} width={SQ - 6} height={SQ - 6} fill="none" stroke="var(--teal)" strokeWidth="5" strokeDasharray="14 8" style={{ pointerEvents: 'none' }} className="cursor-ring" />
    ) : null;

  const arrowEls = (props.arrows ?? []).map((a, i) => {
    const f = pos(a.from);
    const t = pos(a.to);
    const x1 = f.x + SQ / 2;
    const y1 = f.y + SQ / 2;
    const x2 = t.x + SQ / 2;
    const y2 = t.y + SQ / 2;
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const ux = (x2 - x1) / len;
    const uy = (y2 - y1) / len;
    const head = 34;
    const bx = x2 - ux * head;
    const by = y2 - uy * head;
    const w = 15;
    return (
      <g key={`a${i}`} className={`board-arrow ${a.tone}`} style={{ pointerEvents: 'none' }}>
        <line x1={x1 + ux * 12} y1={y1 + uy * 12} x2={bx} y2={by} strokeWidth="14" strokeLinecap="round" />
        <polygon points={`${x2 - ux * 6},${y2 - uy * 6} ${bx - uy * w},${by + ux * w} ${bx + uy * w},${by - ux * w}`} strokeWidth="2" strokeLinejoin="round" />
      </g>
    );
  });

  const promoPieces = [QUEEN, ROOK, BISHOP, KNIGHT];
  const promoNames = ['Queen', 'Rook', 'Bishop', 'Knight'];

  return (
    <div className="board-wrap">
      <svg
        ref={svgRef}
        className="board"
        viewBox="0 0 800 800"
        role="application"
        tabIndex={0}
        aria-label={`${props.ariaLabel}. Use arrow keys to move the cursor, Enter to select and to move.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDrag(null)}
        onKeyDown={onKeyDown}
        onFocus={() => cursor === null && setCursor(white ? 12 : 52)}
        onBlur={() => setCursor(null)}
        style={{ cursor: interactive ? 'pointer' : 'default' }}
      >
        <defs>
          <radialGradient id="checkGlow">
            <stop offset="0%" stopColor="rgb(240 120 106)" stopOpacity="0.95" />
            <stop offset="70%" stopColor="rgb(240 120 106)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="rgb(240 120 106)" stopOpacity="0" />
          </radialGradient>
        </defs>
        {squares}
        {marks}
        {coords}
        {dots}
        {pieces}
        {arrowEls}
        {focusRing}
      </svg>
      <div className="sr-only" aria-live="polite">
        {announce}
      </div>
      {promo && (
        <div className="promo-overlay" role="dialog" aria-label="Choose a piece to promote to">
          <div className="promo-box">
            {promoPieces.map((t, i) => (
              <button
                key={t}
                type="button"
                aria-label={`Promote to ${promoNames[i]}`}
                autoFocus={i === 0}
                onClick={() => {
                  const { from, to } = promo;
                  setPromo(null);
                  setAnnounce(`${squareName(from)} to ${squareName(to)}, promoted to ${promoNames[i]}`);
                  props.onMove(from, to, t);
                }}
              >
                <PieceIcon piece={makePiece(t, props.promoColor)} size={62} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
