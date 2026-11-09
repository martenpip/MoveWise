/**
 * "Staunton" piece set — original vector artwork for MoveWise.
 *
 * Every piece is authored on a 45×45 grid and shares one visual language:
 *   - the same stepped plinth,
 *   - a single outline weight,
 *   - a soft shade on the right half and a thin highlight on the left,
 *   - symmetrical pieces are generated from ONE right-hand profile that is mirrored in code,
 *     so left and right can never drift apart.
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

/* ----------------------------- the plinth ---------------------------- */

const PLINTH: Part[] = [
  { kind: 'body', d: rrect(12.4, 33.6, 32.6, 36.8, 1.4) },
  { kind: 'shade', d: rrectRight(12.4, 33.6, 32.6, 36.8, 1.4) },
  { kind: 'body', d: rrect(10.2, 36.8, 34.8, 40.2, 1.7) },
  { kind: 'shade', d: rrectRight(10.2, 36.8, 34.8, 40.2, 1.7) },
  { kind: 'hl', d: 'M12.6,38.4H18' },
];

/** A symmetric body part with its shade. */
function lathe(startY: number, segs: Seg[]): Part[] {
  return [
    { kind: 'body', d: symPath(startY, segs) },
    { kind: 'shade', d: halfPath(startY, segs) },
  ];
}

/* ------------------------------ the pieces --------------------------- */

const PAWN_PARTS: Part[] = [
  ...lathe(21, [
    ['C', 25.2, 21, 26.4, 23.6, 27.2, 26.6],
    ['C', 28, 29.6, 29.6, 32, 31.6, 34.2],
    ['L', 31.8, 34.4],
  ]),
  { kind: 'hl', d: 'M19.4,25.8C18.6,28.4 17.4,30.8 15.6,32.8' },
  { kind: 'body', d: rrect(17.2, 19.6, 27.8, 22.6, 1.5) },
  { kind: 'shade', d: rrectRight(17.2, 19.6, 27.8, 22.6, 1.5) },
  { kind: 'body', d: circle(CX, 14.6, 4.7) },
  { kind: 'shade', d: `M${f(CX)},9.9A4.7,4.7 0 0 1 ${f(CX)},19.3Z` },
  { kind: 'hl', d: 'M19.4,13C19.9,11.9 20.9,11.2 22,11' },
  ...PLINTH,
];

const ROOK_SHAFT: Seg[] = [
  ['L', 27.6, 18],
  ['C', 27.8, 23, 28.2, 28, 30.4, 33.2],
  ['L', 30.8, 33.8],
];
const ROOK_PARTS: Part[] = [
  ...lathe(18, ROOK_SHAFT),
  { kind: 'hl', d: 'M18.6,20.6C18.4,25 17.8,29 16.2,32.4' },
  { kind: 'body', d: rrect(13.4, 15.2, 31.6, 18.6, 1) },
  { kind: 'shade', d: rrectRight(13.4, 15.2, 31.6, 18.6, 1) },
  {
    kind: 'body',
    d: 'M14.4,15.4V8.2H18V11H20.8V8.2H24.2V11H27V8.2H30.6V15.4Z',
  },
  { kind: 'shade', d: 'M22.5,8.2H24.2V11H27V8.2H30.6V15.4H22.5Z' },
  { kind: 'hl', d: 'M16.2,10.4V13.4' },
  { kind: 'line', d: 'M14.6,15.4H30.4' },
  ...PLINTH,
];

const BISHOP_MITRE: Seg[] = [
  ['C', 27, 12.2, 29.6, 15, 29.6, 18.4],
  ['C', 29.6, 20.8, 28.2, 22.4, 26.4, 23.6],
  ['L', 26.4, 24.6],
];
const BISHOP_STEM: Seg[] = [
  ['C', 24.4, 27, 25.4, 28, 25.8, 29.6],
  ['C', 26.4, 31.8, 28.2, 33.2, 30.8, 34.2],
  ['L', 31, 34.4],
];
const BISHOP_PARTS: Part[] = [
  ...lathe(26.6, BISHOP_STEM),
  { kind: 'hl', d: 'M20.4,29.4C20,31 18.8,32.4 16.4,33.4' },
  { kind: 'body', d: rrect(16.2, 24.2, 28.8, 27.2, 1.4) },
  { kind: 'shade', d: rrectRight(16.2, 24.2, 28.8, 27.2, 1.4) },
  ...lathe(10.6, BISHOP_MITRE),
  { kind: 'hl', d: 'M17.8,18.8C17.8,16.2 19.2,13.8 21.2,12.4' },
  { kind: 'line', d: 'M22,13.2L26.6,18.4' },
  { kind: 'body', d: circle(CX, 8.2, 2.2) },
  { kind: 'shade', d: `M${f(CX)},6A2.2,2.2 0 0 1 ${f(CX)},10.4Z` },
  ...PLINTH,
];

const KING_DOME: Seg[] = [
  ['C', 28, 14.6, 31.2, 17.4, 31.2, 20.4],
  ['C', 31.2, 21.8, 30.8, 22.8, 30.2, 23.6],
  ['L', 30.2, 24.4],
];
const KING_STEM: Seg[] = [
  ['C', 25.4, 27, 26.6, 28, 27.4, 29.8],
  ['C', 28.4, 32, 30, 33.4, 32.2, 34.2],
  ['L', 32.4, 34.4],
];
const KING_PARTS: Part[] = [
  ...lathe(26.6, KING_STEM),
  { kind: 'hl', d: 'M19.6,29.6C19,31.4 17.6,32.8 15.4,33.6' },
  { kind: 'body', d: rrect(14.6, 23.4, 30.4, 26.8, 1.5) },
  { kind: 'shade', d: rrectRight(14.6, 23.4, 30.4, 26.8, 1.5) },
  ...lathe(14.4, KING_DOME),
  { kind: 'hl', d: 'M16.8,21C16.8,19 18,17.4 19.8,16.4' },
  { kind: 'line', d: 'M15.6,20.6C19.4,19.2 25.6,19.2 29.4,20.6' },
  {
    kind: 'body',
    d: 'M21.2,3.4H23.8V6H26.6V8.6H23.8V14.6H21.2V8.6H18.4V6H21.2Z',
  },
  { kind: 'shade', d: 'M22.5,3.4H23.8V6H26.6V8.6H23.8V14.6H22.5Z' },
  ...PLINTH,
];

const QUEEN_CROWN =
  'M14.2,24.2L11.8,11.2L14.9,19L17.2,9.4L19.9,17.6L22.5,7.8L25.1,17.6L27.8,9.4L30.1,19L33.2,11.2L30.8,24.2Z';
const QUEEN_CROWN_RIGHT = 'M22.5,7.8L25.1,17.6L27.8,9.4L30.1,19L33.2,11.2L30.8,24.2H22.5Z';
const QUEEN_STEM: Seg[] = [
  ['C', 24.8, 26.8, 26, 27.8, 26.6, 29.6],
  ['C', 27.4, 31.8, 29.2, 33.2, 31.6, 34.2],
  ['L', 31.8, 34.4],
];
const QUEEN_PARTS: Part[] = [
  ...lathe(26.4, QUEEN_STEM),
  { kind: 'hl', d: 'M19.8,29.4C19.4,31.2 18,32.6 15.8,33.6' },
  { kind: 'body', d: QUEEN_CROWN },
  { kind: 'shade', d: QUEEN_CROWN_RIGHT },
  { kind: 'hl', d: 'M14.6,22.4L13.4,14.6' },
  { kind: 'body', d: rrect(14.2, 23.6, 30.8, 26.8, 1.4) },
  { kind: 'shade', d: rrectRight(14.2, 23.6, 30.8, 26.8, 1.4) },
  ...[
    [11.8, 9.4],
    [17.2, 7.4],
    [CX, 5.9],
    [27.8, 7.4],
    [33.2, 9.4],
  ].flatMap(([x, y]): Part[] => [
    { kind: 'body', d: circle(x!, y!, 1.95) },
    ...(x! > CX ? [{ kind: 'shade' as const, d: `M${f(x!)},${f(y! - 1.95)}A1.95,1.95 0 0 1 ${f(x!)},${f(y! + 1.95)}Z` }] : []),
  ]),
  ...PLINTH,
];

/** Knight, facing left. The only asymmetric piece, drawn as one smooth silhouette. */
const KNIGHT_BODY =
  'M13.4,35.2C13,31.6 14.6,29.2 17.2,27.2C18.4,26.3 19.4,25.6 19.8,24.4' +
  'C17.8,25 15.8,26 14,26C12.4,26 11.2,25 10.8,23.6C10.4,22.2 10.6,21 11.4,20' +
  'C12.6,17.6 15.2,14 18.6,11.2L19.4,6.2C20.8,7 22,7.8 22.8,8.8L24.6,6.6' +
  'C25.6,8.2 26.4,9.4 27.6,10.4C30.8,13.2 33.6,19 33.6,27.2' +
  'C33.6,30.4 32.8,32.8 32.4,35.2Z';
const KNIGHT_SHADE =
  'M24.6,6.6C25.6,8.2 26.4,9.4 27.6,10.4C30.8,13.2 33.6,19 33.6,27.2C33.6,30.4 32.8,32.8 32.4,35.2H25.6' +
  'C26.2,30 26,24 23.4,19.4C22,16.8 22.2,12 24.6,6.6Z';
const KNIGHT_PARTS: Part[] = [
  { kind: 'body', d: KNIGHT_BODY },
  { kind: 'shade', d: KNIGHT_SHADE },
  { kind: 'hl', d: 'M13.6,32.6C13.6,30.6 14.6,29.2 16.2,27.8' },
  { kind: 'hl', d: 'M12.8,19.8C14,17.8 16,15.4 18.2,13.4' },
  { kind: 'line', d: 'M28.2,13.8C30.6,17 31.2,21 31.2,25.4' },
  { kind: 'line', d: 'M25.4,12.6C27.6,15.8 28.6,19.4 28.6,23.4' },
  { kind: 'line', d: 'M19.6,24.4C20.6,22.8 21,21.2 20.6,19.6' },
  { kind: 'eye', d: circle(18.6, 15.4, 1.25) },
  { kind: 'eye', d: circle(12.4, 21.4, 0.7) },
  ...PLINTH,
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
  fill: string;
  stroke: string;
  shade: string;
  hl: string;
  line: string;
  eye: string;
}

export const WHITE_PALETTE: Palette = {
  fill: '#f5efe3',
  stroke: '#1d212b',
  shade: 'rgba(70, 48, 14, 0.15)',
  hl: 'rgba(255, 255, 255, 0.85)',
  line: 'rgba(29, 33, 43, 0.75)',
  eye: '#1d212b',
};

export const BLACK_PALETTE: Palette = {
  fill: '#3a3f4b',
  stroke: '#07090d',
  shade: 'rgba(0, 0, 0, 0.3)',
  hl: 'rgba(255, 255, 255, 0.26)',
  line: 'rgba(255, 255, 255, 0.34)',
  eye: '#f0e9d8',
};

export const STROKE_WIDTH = 1.15;

/** Serialise one piece to SVG markup (used by the review sheet and tests; the app renders the same data via React). */
export function pieceSvgMarkup(type: number, white: boolean): string {
  const p = white ? WHITE_PALETTE : BLACK_PALETTE;
  return (PIECE_PARTS[type] ?? [])
    .map((part) => {
      switch (part.kind) {
        case 'body':
          return `<path d="${part.d}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="${STROKE_WIDTH}" stroke-linejoin="round"/>`;
        case 'shade':
          return `<path d="${part.d}" fill="${p.shade}"/>`;
        case 'hl':
          return `<path d="${part.d}" fill="none" stroke="${p.hl}" stroke-width="1.1" stroke-linecap="round"/>`;
        case 'line':
          return `<path d="${part.d}" fill="none" stroke="${p.line}" stroke-width="0.9" stroke-linecap="round"/>`;
        case 'eye':
          return `<path d="${part.d}" fill="${p.eye}"/>`;
      }
    })
    .join('');
}
