/** Renders a review sheet of the piece set (light + dark squares, several sizes) to a PNG. Usage: tsx scripts/preview-pieces.ts out.png */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { BISHOP, KING, KNIGHT, PAWN, QUEEN, ROOK } from '../src/chess/types';
import { pieceSvgMarkup } from '../src/ui/pieceShapes';

const require = createRequire(import.meta.url);
// sharp is an optional dev tool (not a dependency of the app), so it is typed locally rather than imported.
interface SharpLike { (input: Buffer): { png(): { toFile(path: string): Promise<unknown> } } }
const sharp = require('sharp') as SharpLike;
const out = process.argv[2] ?? 'pieces.png';
const order = [KING, QUEEN, ROOK, BISHOP, KNIGHT, PAWN];
const cell = 150;
const sizes = [cell, 52, 30];
let svg = '';
let y = 0;
const rowsDef: Array<[boolean, string, string]> = [
  [true, '#e9dfc8', 'light'],
  [true, '#8a6e4b', 'dark'],
  [false, '#e9dfc8', 'light'],
  [false, '#8a6e4b', 'dark'],
];
for (const [white, bg] of rowsDef) {
  order.forEach((t, i) => {
    svg += `<rect x="${i * cell}" y="${y}" width="${cell}" height="${cell}" fill="${bg}"/>`;
    svg += `<g transform="translate(${i * cell} ${y}) scale(${cell / 45})">${pieceSvgMarkup(t, white)}</g>`;
  });
  // small sizes strip
  let x = order.length * cell + 10;
  for (const s of sizes.slice(1)) {
    order.forEach((t) => {
      svg += `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="${bg}"/>`;
      svg += `<g transform="translate(${x} ${y}) scale(${s / 45})">${pieceSvgMarkup(t, white)}</g>`;
      x += s;
    });
    x += 10;
  }
  y += cell;
}
const W = order.length * cell + 10 + order.length * (52 + 30) + 20;
const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${y}" viewBox="0 0 ${W} ${y}"><rect width="100%" height="100%" fill="#0f1420"/>${svg}</svg>`;
sharp(Buffer.from(doc)).png().toFile(out).then(() => writeFileSync(out + '.ok', 'ok'));
