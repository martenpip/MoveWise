/**
 * "Flat" piece set — original vector artwork for MoveWise.
 *
 * Minimalist: flat solid colour, one thin outline, one quiet shaded half, no gradients and almost no interior detail. Each piece is
 * recognised by its silhouette alone — a ball-on-a-stem pawn, a three-notch tower, a leaning horse head, a slit mitre with a bead,
 * a five-pointed beaded crown, a bell topped by a cross — so they stay distinguishable at small sizes and on a phone.
 * Every piece is authored on a 45×45 grid and shares one slim base. Symmetrical pieces are generated from ONE right-hand profile
 * that is mirrored in code, so left and right can never drift apart.
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

/* ------------------------------ the base ------------------------------ */

/** Shared by every piece: the last five parts of each piece's list. */
const BASE: Part[] = [
  { kind: 'body', d: rrect(10, 34.8, 35, 38.6, 1.9) },
  { kind: 'shade', d: rrectRight(10, 34.8, 35, 38.6, 1.9) },
  { kind: 'body', d: rrect(13, 31.8, 32, 35.2, 1.6) },
  { kind: 'shade', d: rrectRight(13, 31.8, 32, 35.2, 1.6) },
  { kind: 'hl', d: 'M12,37.2H16.4' },
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
];

/* ------------------------------ the pieces --------------------------- */

const PAWN_PARTS: Part[] = [
  ...lathe(19, [
    ['L', 25.2, 19],
    ['C', 25.4, 24, 27.6, 27.8, 29.4, 32.2],
    ['L', 29.6, 33],
  ]),
  { kind: 'body', d: rrect(15.8, 18.4, 29.2, 21.8, 1.7) },
  { kind: 'shade', d: rrectRight(15.8, 18.4, 29.2, 21.8, 1.7) },
  ...ball(CX, 14.4, 4.8),
  ...BASE,
];

const ROOK_PARTS: Part[] = [
  ...lathe(14, [
    ['L', 27.2, 14],
    ['C', 27.4, 22, 28.4, 27, 30.2, 32.2],
    ['L', 30.4, 33],
  ]),
  { kind: 'body', d: rrect(13, 12.6, 32, 16.2, 1.5) },
  { kind: 'shade', d: rrectRight(13, 12.6, 32, 16.2, 1.5) },
  { kind: 'body', d: 'M14,13.4V7.2H18.4V9.8H20.6V7.2H24.4V9.8H26.6V7.2H31V13.4Z' },
  { kind: 'shade', d: 'M22.5,7.2H24.4V9.8H26.6V7.2H31V13.4H22.5Z' },
  ...BASE,
];

const BISHOP_PARTS: Part[] = [
  ...lathe(25, [
    ['L', 25.4, 25],
    ['C', 25.6, 28.4, 27.6, 30.6, 30, 32.4],
    ['L', 30.2, 33],
  ]),
  { kind: 'body', d: rrect(14.8, 24.2, 30.2, 27.8, 1.7) },
  { kind: 'shade', d: rrectRight(14.8, 24.2, 30.2, 27.8, 1.7) },
  ...lathe(9.2, [
    ['C', 27, 10.6, 30.4, 14.8, 30.4, 19.2],
    ['C', 30.4, 22, 28.6, 23.8, 27, 24.6],
    ['L', 27, 25],
  ]),
  { kind: 'eye', d: 'M20.6,16.4L22,15L27.6,20.6L26.2,22Z' },
  ...ball(CX, 6.8, 2.4),
  ...BASE,
];

const KING_PARTS: Part[] = [
  ...lathe(12.8, [
    ['C', 27.4, 12.8, 31.2, 16.6, 31.2, 22],
    ['C', 31.2, 27, 29.6, 29.6, 30.4, 33.2],
  ]),
  { kind: 'body', d: rrect(14.2, 23.2, 30.8, 26.8, 1.7) },
  { kind: 'shade', d: rrectRight(14.2, 23.2, 30.8, 26.8, 1.7) },
  {
    kind: 'body',
    d: 'M20.7,4.6Q20.7,2.6 22.5,2.6Q24.3,2.6 24.3,4.6V6.2H26.4Q28.2,6.2 28.2,7.9Q28.2,9.6 26.4,9.6H24.3V12.8H20.7V9.6H18.6Q16.8,9.6 16.8,7.9Q16.8,6.2 18.6,6.2H20.7Z',
  },
  { kind: 'shade', d: 'M22.5,2.6Q24.3,2.6 24.3,4.6V6.2H26.4Q28.2,6.2 28.2,7.9Q28.2,9.6 26.4,9.6H24.3V12.8H22.5Z' },
  ...BASE,
];

const QUEEN_CROWN = 'M13.2,27L10.6,12.4L15.8,19.4L16.6,8.6L19.6,18L22.5,6.6L25.4,18L28.4,8.6L29.2,19.4L34.4,12.4L31.8,27Z';
const QUEEN_CROWN_RIGHT = 'M22.5,6.6L25.4,18L28.4,8.6L29.2,19.4L34.4,12.4L31.8,27H22.5Z';
const QUEEN_PARTS: Part[] = [
  ...lathe(26, [
    ['L', 26, 26],
    ['C', 26.2, 29.4, 28, 31.4, 30.6, 33],
  ]),
  { kind: 'body', d: QUEEN_CROWN },
  { kind: 'shade', d: QUEEN_CROWN_RIGHT },
  { kind: 'body', d: rrect(13.4, 24.4, 31.6, 28.2, 1.8) },
  { kind: 'shade', d: rrectRight(13.4, 24.4, 31.6, 28.2, 1.8) },
  ...[
    [10.6, 11.6],
    [16.6, 7.8],
    [CX, 5.8],
    [28.4, 7.8],
    [34.4, 11.6],
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
  { kind: 'eye', d: circle(18.4, 14.8, 1.4) },
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
  /** The body fill: one flat colour. */
  fill: string;
  stroke: string;
  shade: string;
  hl: string;
  line: string;
  eye: string;
}

export const WHITE_PALETTE: Palette = {
  fill: '#f7f2e8',
  stroke: '#2c313d',
  shade: 'rgba(70, 56, 30, 0.14)',
  hl: 'rgba(44, 49, 61, 0.35)',
  line: 'rgba(44, 49, 61, 0.7)',
  eye: '#2c313d',
};

export const BLACK_PALETTE: Palette = {
  fill: '#394050',
  stroke: '#0c0f15',
  shade: 'rgba(0, 0, 0, 0.26)',
  hl: 'rgba(255, 255, 255, 0.28)',
  line: 'rgba(255, 255, 255, 0.4)',
  eye: '#f4ecda',
};

export const STROKE_WIDTH = 1.3;

/** The pieces use flat colours, so there is nothing to define. Kept so callers that render the shared defs keep working. */
export const PIECE_DEFS_MARKUP = '';

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
            return `<path d="${part.d}" fill="none" stroke="${p.hl}" stroke-width="1.2" stroke-linecap="round"/>`;
          case 'line':
            return `<path d="${part.d}" fill="none" stroke="${p.line}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>`;
          case 'eye':
            return `<path d="${part.d}" fill="${p.eye}"/>`;
        }
      })
      .join('')
  );
}
