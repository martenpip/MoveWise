import { useId, type ReactNode } from 'react';
import { BISHOP, KING, KNIGHT, PAWN, QUEEN, ROOK, WHITE, makePiece } from '../chess/types';
import type { Motif, Rarity } from '../profile/achievements';
import { PieceG } from './pieces';

/** Hand-drawn symbols on a 24x24 grid, stroked in the badge colour. */
const GLYPHS: Partial<Record<Motif, ReactNode>> = {
  flame: <path d="M12 3c.8 3-3.2 4.6-3.2 8.2a3.2 3.2 0 0 0 6.4 0c0-1.1-.5-2.1-1.1-3 2.2.9 4.1 3.2 4.1 6a6.2 6.2 0 0 1-12.4 0C5.8 9.2 10 7.4 12 3z" />,
  bolt: <path d="M13.5 2.5 5.5 13.5h5.8l-1 8 8.2-11.2h-5.9z" />,
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.6" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    </>
  ),
  book: (
    <>
      <path d="M4.5 5.5a2 2 0 0 1 2-2H19v15.5H6.5a2 2 0 0 0-2 2z" />
      <path d="M4.5 19V5.5M9 7.5h6" />
    </>
  ),
  puzzle: <path d="M4.5 8.5h4a2.2 2.2 0 1 1 4.4 0h4.1v4a2.2 2.2 0 1 1 0 4.4v3.6H4.5z" />,
  star: <path d="m12 3.2 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.2l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />,
  trend: (
    <>
      <path d="m3.5 17 6-6 4 4 7-8" />
      <path d="M15 7h5.5v5.5" />
    </>
  ),
  crown: <path d="M4 18.5h16L21 8l-5 4-4-7-4 7-5-4z" />,
  calendar: (
    <>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2.2" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
      <path d="m9 15 2 2 4-4" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5c0 3 1 4.2 3 4.2M16 6h3c0 3-1 4.2-3 4.2M12 13v4M8.5 20h7M10 17h4" />
    </>
  ),
  mortarboard: (
    <>
      <path d="m2.5 9.5 9.5-5 9.5 5-9.5 5z" />
      <path d="M6.5 11.8V16c3 2.2 8 2.2 11 0v-4.2M21.5 9.5V15" />
    </>
  ),
  fork: <path d="M12 21V9M6 3v6a6 6 0 0 0 12 0V3" />,
  pin: <path d="M9 3.5h6l-1 6 3 3H7l3-3zM12 12.5v8" />,
  arrowup: <path d="M12 20V5M6 11l6-6 6 6" />,
  flag: <path d="M5.5 21V4M5.5 4.5h11l-2.2 4 2.2 4H5.5" />,
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
};

const PIECES = { pawn: PAWN, knight: KNIGHT, bishop: BISHOP, rook: ROOK, queen: QUEEN, king: KING } as const;

export function AchievementBadge({ motif, rarity, unlocked, size = 64 }: { motif: Motif; rarity: Rarity; unlocked: boolean; size?: number }) {
  const uid = useId().replace(/:/g, '');
  const piece = motif in PIECES ? PIECES[motif as keyof typeof PIECES] : null;
  const ring = unlocked ? `url(#ring-${uid})` : 'var(--badge-locked-ring)';
  const ink = unlocked ? 'var(--badge-ink)' : 'var(--badge-locked-ink)';
  return (
    <svg className={`badge-art ${unlocked ? 'on' : 'off'} ${rarity}`} viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`ring-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--badge-ring-a)" />
          <stop offset="1" stopColor="var(--badge-ring-b)" />
        </linearGradient>
        <radialGradient id={`face-${uid}`} cx="50%" cy="38%" r="70%">
          <stop offset="0" stopColor="var(--badge-face-a)" />
          <stop offset="1" stopColor="var(--badge-face-b)" />
        </radialGradient>
      </defs>
      {rarity === 'rare' && (
        // Eight small points around a rare badge.
        <g stroke={ring} strokeWidth="2.4" strokeLinecap="round">
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i * Math.PI) / 4;
            return <line key={i} x1={32 + Math.cos(a) * 29.5} y1={32 + Math.sin(a) * 29.5} x2={32 + Math.cos(a) * 31.5} y2={32 + Math.sin(a) * 31.5} />;
          })}
        </g>
      )}
      <circle cx="32" cy="32" r="27.5" fill="none" stroke={ring} strokeWidth="3" />
      {rarity !== 'common' && <circle cx="32" cy="32" r="23.8" fill="none" stroke={ring} strokeWidth="1" opacity="0.75" />}
      <circle cx="32" cy="32" r={rarity === 'common' ? 25 : 22.8} fill={`url(#face-${uid})`} />
      {piece !== null ? (
        <g transform="translate(14.4 14.6) scale(0.8)" opacity={unlocked ? 1 : 0.35} style={unlocked ? undefined : { filter: 'grayscale(1)' }}>
          <PieceG piece={makePiece(piece, WHITE)} />
        </g>
      ) : (
        <g transform="translate(19.2 19.2) scale(1.1)" fill="none" stroke={ink} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" color={ink}>
          {GLYPHS[motif]}
        </g>
      )}
    </svg>
  );
}
