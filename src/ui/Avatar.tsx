import { BISHOP, KING, KNIGHT, PAWN, QUEEN, ROOK, WHITE, makePiece } from '../chess/types';
import type { Avatar as AvatarData, AvatarColor, AvatarPiece } from '../profile/types';
import { PieceIcon } from './pieces';

/** Background gradient and a text colour with strong contrast against it. */
export const AVATAR_STYLE: Record<AvatarColor, { from: string; to: string; ink: string; label: string }> = {
  gold: { from: '#f0be63', to: '#c98a2e', ink: '#1d1405', label: 'Gold' },
  teal: { from: '#64d9c6', to: '#2f9d8c', ink: '#052420', label: 'Teal' },
  blue: { from: '#9db4ff', to: '#6683e6', ink: '#08122e', label: 'Blue' },
  rose: { from: '#ff9fb0', to: '#d35c78', ink: '#2e0a14', label: 'Rose' },
  violet: { from: '#c4a6ff', to: '#9570de', ink: '#180a33', label: 'Violet' },
  slate: { from: '#b4bfd6', to: '#6f7fa3', ink: '#0d1426', label: 'Slate' },
};

const PIECE_TYPE: Record<AvatarPiece, number> = { knight: KNIGHT, king: KING, queen: QUEEN, rook: ROOK, bishop: BISHOP, pawn: PAWN };

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 'P';
  const first = [...words[0]!][0] ?? 'P';
  const second = words.length > 1 ? ([...words[words.length - 1]!][0] ?? '') : '';
  return (first + second).toUpperCase();
}

export function Avatar({ avatar, name, size = 64 }: { avatar: AvatarData; name: string; size?: number }) {
  const c = AVATAR_STYLE[avatar.color];
  return (
    <span
      className="avatar"
      role="img"
      aria-label={`Avatar for ${name}`}
      style={{ width: size, height: size, background: `linear-gradient(145deg, ${c.from}, ${c.to})`, color: c.ink, fontSize: size * 0.38 }}
    >
      {avatar.kind === 'piece' ? <PieceIcon piece={makePiece(PIECE_TYPE[avatar.piece], WHITE)} size={size * 0.82} /> : initialsOf(name)}
    </span>
  );
}
