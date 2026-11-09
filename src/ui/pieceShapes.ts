/**
 * "Gloss" piece set — original vector artwork for MoveWise.
 *
 * Soft, chunky, rounded pieces with a glossy finish: heavy rounded outlines, a gradient body, a shaded right side and a bright
 * highlight on the left. Every piece is authored on a 45×45 grid and shares one visual language:
 *   - the same two-tier rounded foot,
 *   - a single outline weight,
 *   - symmetrical pieces are generated from ONE right-hand profile that is mirrored in code,
 *     so left and right can never drift apart.
 * The silhouettes are MoveWise's own (a ball-and-bell pawn, a rook with a slot window, a bishop with a diagonal cut, a five-ball
 * queen's crown, a king with a rounded cross, a knight with a scalloped mane). They are not traced from, or copies of, any other set.
 *
 * This file is plain data (no React) so it can also be rendered to images for review and tests.
 * Nothing here is traced from or derived from another piece set.
 */
import { BISHOP, KING, KNIGHT, PAWN, QUEEN, ROOK } from '../chess/types';

export type PartKind = 'body' | 'shade' | 'hl' | 'line' | 'eye';

export interface Part {
  kind: PartKind;
  /** SVG path data (circles are expressed as paths too, so every part is a single element type). */
  d: string;
}

const CX = 22.5;
const f = (n: number): string => String(Math.round(n * 100) / 100);

/* --------------------------- path helpers --------------------------- */

type Seg = ['L', number, number] | ['C', number, number, number, number, number, number];

/** Closed, left-right symmetric outline from a right-hand profile that starts on the centre line. */
function symPath(startY: number, segs: Seg[]): string {
  const pts: Array<[number, number]> = [[CX, startY]];
  for (const s of segs) pts.push(s[0] === 'L' ? [s[1], s[2]] : [s[5], s[6]]);
  let d = `M${f(CX)},${f(startY)}`;
  for (const s of segs) d += s[0] === 'L' ? `L${f(s[1])},${f(s[2])}` : `C${f(s[1])},${f(s[2])} ${f(s[3])},${f(s[4])} ${f(s[5])},${f(s[6])}`;
  const last = pts[pts.length - 1]!;
  d += `L${f(2 * CX - last[0])},${f(last[1])}`;
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i]!;
    const prev = pts[i]!;
    if (s[0] === 'L') d += `L${f(2 * CX - prev[0])},${f(prev[1])}`;
    else d += `C${f(2 * CX - s[3])},${f(s[4])} ${f(2 * CX - s[1])},${f(s[2])} ${f(2 * CX - prev[0])},${f(prev[1])}`;
  }
  return d + 'Z';
}

/** The right half of the same profile, closed down the centre line: used for the shade. */
function halfPath(startY: number, segs: Seg[]): string {
  let d = `M${f(CX)},${f(startY)}`;
  let lastY = startY;
  for (const s of segs) {
    if (s[0] === 'L') {
      d += `L${f(s[1])},${f(s[2])}`;
      lastY = s[2];
    } else {
      d += `C${f(s[1])},${f(s[2])} ${f(s[3])},${f(s[4])} ${f(s[5])},${f(s[6])}`;
      lastY = s[6];
    }
  }
  return d + `L${f(CX)},${f(lastY)}Z`;
}

const circle = (cx: number, cy: number, r: number): string =>
  `M${f(cx - r)},${f(cy)}a${f(r)},${f(r)} 0 1 0 ${f(2 * r)},0a${f(r)},${f(r)} 0 1 0 ${f(-2 * r)},0Z`;

const rrect = (x1: number, y1: number, x2: number, y2: number, r: number): string =>
  `M${f(x1 + r)},${f(y1)}H${f(x2 - r)}Q${f(x2)},${f(y1)} ${f(x2)},${f(y1 + r)}V${f(y2 - r)}Q${f(x2)},${f(y2)} ${f(x2 - r)},${f(y2)}H${f(x1 + r)}Q${f(x1)},${f(y2)} ${f(x1)},${f(y2 - r)}V${f(y1 + r)}Q${f(x1)},${f(y1)} ${f(x1 + r)},${f(y1)}Z`;

const rrectRight = (_x1: number, y1: number, x2: number, y2: number, r: number): string =>
  `M${f(CX)},${f(y1)}H${f(x2 - r)}Q${f(x2)},${f(y1)} ${f(x2)},${f(y1 + r)}V${f(y2 - r)}Q${f(x2)},${f(y2)} ${f(x2 - r)},${f(y2)}H${f(CX)}Z`;

/* ------------------------------ the foot ------------------------------ */

/** Shared by every piece: the last five parts of each piece's list. */
const BASE: Part[] = [
  { kind: 'body', d: rrect(8.6, 35.2, 36.4, 40.4, 2.8) },
  { kind: 'shade', d: rrectRight(8.6, 35.2, 36.4, 40.4, 2.8) },
  { kind: 'body', d: rrect(11.4, 32.2, 33.6, 36.2, 2.2) },
  { kind: 'shade', d: rrectRight(11.4, 32.2, 33.6, 36.2, 2.2) },
  { kind: 'hl', d: 'M11.6,38C11.8,37.7 13,37.6 15.6,37.6' },
];

/** A symmetric body part with its shade. */
function lathe(startY: number, segs: Seg[]): Part[] {
  return [
    { kind: 'body', d: symPath(startY, segs) },
    { kind: 'shade', d: halfPath(startY, segs) },
  ];
}

const ball = (cx: number, cy: number, r: number): Part[] => [
  { kind: 'body', d: circle(cx, cy, r) },
  ...(cx >= CX - 0.01 ? [{ kind: 'shade' as const, d: `M${f(cx)},${f(cy - r)}A${f(r)},${f(r)} 0 0 1 ${f(cx)},${f(cy + r)}Z` }] : []),
  { kind: 'hl', d: `M${f(cx - r * 0.55)},${f(cy - r * 0.1)}C${f(cx - r * 0.5)},${f(cy - r * 0.6)} ${f(cx - r * 0.2)},${f(cy - r * 0.75)} ${f(cx + r * 0.1)},${f(cy - r * 0.78)}` },
];

/* ------------------------------ the pieces --------------------------- */

const PAWN_PARTS: Part[] = [
  ...lathe(20.4, [
    ['C', 26.4, 20.4, 27.6, 25.6, 28.8, 29],
    ['C', 29.6, 31, 30.6, 32.2, 32, 33],
    ['L', 32.2, 33.2],
  ]),
  { kind: 'hl', d: 'M18.6,25C18,27.6 17,29.8 15.6,31.6' },
  { kind: 'body', d: rrect(14.6, 19.2, 30.4, 23, 1.9) },
  { kind: 'shade', d: rrectRight(14.6, 19.2, 30.4, 23, 1.9) },
  ...ball(CX, 13.4, 5.6),
  ...BASE,
];

const ROOK_PARTS: Part[] = [
  ...lathe(17.6, [
    ['L', 28.4, 17.6],
    ['C', 28.6, 22.4, 28.8, 27.6, 31.2, 33.4],
    ['L', 31.6, 33.8],
  ]),
  { kind: 'hl', d: 'M17.4,21C17.2,25 16.6,28.6 15,32' },
  { kind: 'eye', d: 'M21,27.4V23.4Q21,21.6 22.5,21.6Q24,21.6 24,23.4V27.4Z' },
  { kind: 'body', d: rrect(11.6, 14.6, 33.4, 18.8, 1.9) },
  { kind: 'shade', d: rrectRight(11.6, 14.6, 33.4, 18.8, 1.9) },
  {
    kind: 'body',
    d: 'M13,15V7.8Q13,6.6 14.2,6.6H16.6Q17.8,6.6 17.8,7.8V10.8H20.4V7.8Q20.4,6.6 21.6,6.6H23.4Q24.6,6.6 24.6,7.8V10.8H27.2V7.8Q27.2,6.6 28.4,6.6H30.8Q32,6.6 32,7.8V15Z',
  },
  { kind: 'shade', d: 'M22.5,6.6H23.4Q24.6,6.6 24.6,7.8V10.8H27.2V7.8Q27.2,6.6 28.4,6.6H30.8Q32,6.6 32,7.8V15H22.5Z' },
  { kind: 'hl', d: 'M14.6,8.6V12.4' },
  { kind: 'hl', d: 'M14,16.7H20' },
  ...BASE,
];

const BISHOP_PARTS: Part[] = [
  ...lathe(26.8, [
    ['C', 24.8, 28.4, 25.6, 29.6, 26.2, 31],
    ['C', 26.8, 32.4, 28.6, 33.4, 31, 34.2],
    ['L', 31.2, 34.4],
  ]),
  { kind: 'hl', d: 'M20.2,29.8C19.8,31.2 18.6,32.4 16.4,33.4' },
  { kind: 'body', d: rrect(14.6, 24.4, 30.4, 28.2, 1.9) },
  { kind: 'shade', d: rrectRight(14.6, 24.4, 30.4, 28.2, 1.9) },
  ...lathe(8.4, [
    ['C', 27.6, 10.2, 30.6, 14.4, 30.6, 18.6],
    ['C', 30.6, 21.4, 28.8, 23.2, 27, 24.2],
    ['L', 27, 24.8],
  ]),
  { kind: 'hl', d: 'M17.2,19C17.2,16.2 18.6,13.4 20.8,11.6' },
  { kind: 'eye', d: 'M21.2,14.6L22.8,13.2L27.4,18.8L25.8,20.2Z' },
  ...ball(CX, 6, 2.5),
  ...BASE,
];

const KING_PARTS: Part[] = [
  ...lathe(26.8, [
    ['C', 25.2, 28.4, 26.4, 29.6, 27.2, 31],
    ['C', 28.2, 32.6, 30, 33.6, 32.2, 34.2],
    ['L', 32.4, 34.4],
  ]),
  { kind: 'hl', d: 'M19.4,29.8C18.8,31.4 17.4,32.6 15.2,33.6' },
  { kind: 'body', d: rrect(14, 24.4, 31, 28.2, 1.9) },
  { kind: 'shade', d: rrectRight(14, 24.4, 31, 28.2, 1.9) },
  ...lathe(13, [
    ['C', 27.8, 13, 32, 16.2, 32, 20.4],
    ['C', 32, 22, 31.4, 23.4, 30.6, 24.2],
    ['L', 30.6, 24.8],
  ]),
  { kind: 'hl', d: 'M16.2,21.4C16.2,19 17.4,17 19.4,15.8' },
  { kind: 'line', d: 'M15.4,21.2C19.4,19.6 25.6,19.6 29.6,21.2' },
  {
    kind: 'body',
    d: 'M20.6,3.4Q20.6,2.4 21.6,2.4H23.4Q24.4,2.4 24.4,3.4V5.4H27.2Q28.2,5.4 28.2,6.4V8Q28.2,9 27.2,9H24.4V13.6H20.6V9H17.8Q16.8,9 16.8,8V6.4Q16.8,5.4 17.8,5.4H20.6Z',
  },
  { kind: 'shade', d: 'M22.5,2.4H23.4Q24.4,2.4 24.4,3.4V5.4H27.2Q28.2,5.4 28.2,6.4V8Q28.2,9 27.2,9H24.4V13.6H22.5Z' },
  { kind: 'hl', d: 'M21.6,4V11.6' },
  ...BASE,
];

const QUEEN_CROWN =
  'M13.4,25L10.8,11.4L14.2,17.6L16.6,8.6L19.6,16.4L22.5,7.4L25.4,16.4L28.4,8.6L30.8,17.6L34.2,11.4L31.6,25Z';
const QUEEN_CROWN_RIGHT = 'M22.5,7.4L25.4,16.4L28.4,8.6L30.8,17.6L34.2,11.4L31.6,25H22.5Z';
const QUEEN_PARTS: Part[] = [
  ...lathe(26.8, [
    ['C', 25, 28.4, 26, 29.6, 26.8, 31],
    ['C', 27.6, 32.6, 29.4, 33.6, 31.8, 34.2],
    ['L', 32, 34.4],
  ]),
  { kind: 'hl', d: 'M19.6,29.8C19.2,31.4 17.8,32.6 15.6,33.6' },
  { kind: 'body', d: QUEEN_CROWN },
  { kind: 'shade', d: QUEEN_CROWN_RIGHT },
  { kind: 'hl', d: 'M13.6,22.6L12.4,15.4' },
  { kind: 'body', d: rrect(13.4, 23.8, 31.6, 28, 2) },
  { kind: 'shade', d: rrectRight(13.4, 23.8, 31.6, 28, 2) },
  ...[
    [10.8, 10.6],
    [16.6, 7.6],
    [CX, 6.4],
    [28.4, 7.6],
    [34.2, 10.6],
  ].flatMap(([x, y]): Part[] => ball(x!, y!, 2.1)),
  ...BASE,
];

/** Knight, facing left. The only asymmetric piece, drawn as one smooth silhouette. */
const KNIGHT_BODY =
  'M12.4,35.4C12,30.8 14,28.2 16.8,26C18.2,24.9 19.2,24 19.4,22.8C17.4,23.4 15,24.6 12.8,24.2C10.8,23.8 9.6,22.2 9.8,20.2C10,18.4 11.2,17.2 12.4,15.8C14,14 15.4,12.2 17.2,10.2L17.6,5.2C19.2,5.8 20.6,6.8 21.6,8C22.4,7 23.4,6 24.6,5.2C25.2,7.2 26.2,8.8 27.6,10C31.4,13.2 34.4,19 34.4,27C34.4,30.4 33.8,33 33.2,35.4Z';
const KNIGHT_SHADE =
  'M24.6,5.2C25.2,7.2 26.2,8.8 27.6,10C31.4,13.2 34.4,19 34.4,27C34.4,30.4 33.8,33 33.2,35.4H26C26.6,30 26.2,24 23.4,19.4C22,16.8 22.2,11 24.6,5.2Z';
const KNIGHT_PARTS: Part[] = [
  { kind: 'body', d: KNIGHT_BODY },
  { kind: 'shade', d: KNIGHT_SHADE },
  { kind: 'hl', d: 'M13.4,32.6C13.4,30.4 14.6,28.8 16.4,27.4' },
  { kind: 'hl', d: 'M12.6,19.4C13.8,17.4 15.8,15 18,13' },
  { kind: 'line', d: 'M27.8,12.6C28.8,13.8 29.2,14.8 28.8,16.4C30.6,15.8 31.6,16.6 32,18.2C32.6,19.6 32.2,21 31.4,22.2' },
  { kind: 'line', d: 'M26.2,17.6C27,19 27.2,20.4 26.6,22C28.4,21.6 29.4,22.6 29.6,24' },
  { kind: 'line', d: 'M19.4,22.8C20.6,21.2 21,19.6 20.6,18' },
  { kind: 'eye', d: circle(18.4, 14.8, 1.5) },
  { kind: 'hl', d: 'M17.8,14.2L18.5,13.7' },
  { kind: 'eye', d: circle(11.6, 20.8, 0.8) },
  ...BASE,
];

export const PIECE_PARTS: Record<number, Part[]> = {
  [PAWN]: PAWN_PARTS,
  [KNIGHT]: KNIGHT_PARTS,
  [BISHOP]: BISHOP_PARTS,
  [ROOK]: ROOK_PARTS,
  [QUEEN]: QUEEN_PARTS,
  [KING]: KING_PARTS,
};

export interface Palette {
  /** The body fill. A gradient from PIECE_DEFS_MARKUP with a flat fallback colour. */
  fill: string;
  stroke: string;
  shade: string;
  hl: string;
  line: string;
  eye: string;
}

export const WHITE_PALETTE: Palette = {
  fill: 'url(#mw-pw) #f1e7d1',
  stroke: '#2a2018',
  shade: 'rgba(86, 58, 16, 0.2)',
  hl: 'rgba(255, 255, 255, 0.95)',
  line: 'rgba(42, 32, 24, 0.7)',
  eye: '#2a2018',
};

export const BLACK_PALETTE: Palette = {
  fill: 'url(#mw-pb) #343949',
  stroke: '#05070b',
  shade: 'rgba(0, 0, 0, 0.34)',
  hl: 'rgba(255, 255, 255, 0.4)',
  line: 'rgba(255, 255, 255, 0.36)',
  eye: '#f4ecda',
};

export const STROKE_WIDTH = 1.5;

/** The two body gradients (light from the upper left). Rendered once in the page, and inline in standalone markup. */
export const PIECE_DEFS_MARKUP =
  '<linearGradient id="mw-pw" x1="0.15" y1="0" x2="0.85" y2="1"><stop offset="0" stop-color="#fffaf0"/><stop offset="0.55" stop-color="#f1e7d1"/><stop offset="1" stop-color="#d6c6a2"/></linearGradient>' +
  '<linearGradient id="mw-pb" x1="0.15" y1="0" x2="0.85" y2="1"><stop offset="0" stop-color="#5d6479"/><stop offset="0.55" stop-color="#343949"/><stop offset="1" stop-color="#1c202b"/></linearGradient>';

/** Serialise one piece to SVG markup (used by the review sheet and tests; the app renders the same data via React). */
export function pieceSvgMarkup(type: number, white: boolean): string {
  const p = white ? WHITE_PALETTE : BLACK_PALETTE;
  return (
    `<defs>${PIECE_DEFS_MARKUP}</defs>` +
    (PIECE_PARTS[type] ?? [])
      .map((part) => {
        switch (part.kind) {
          case 'body':
            return `<path d="${part.d}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="${STROKE_WIDTH}" stroke-linejoin="round"/>`;
          case 'shade':
            return `<path d="${part.d}" fill="${p.shade}"/>`;
          case 'hl':
            return `<path d="${part.d}" fill="none" stroke="${p.hl}" stroke-width="1.4" stroke-linecap="round"/>`;
          case 'line':
            return `<path d="${part.d}" fill="none" stroke="${p.line}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>`;
          case 'eye':
            return `<path d="${part.d}" fill="${p.eye}"/>`;
        }
      })
      .join('')
  );
}
