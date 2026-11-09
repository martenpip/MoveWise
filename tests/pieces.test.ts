import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { BISHOP, KING, KNIGHT, PAWN, QUEEN, ROOK } from '../src/chess/types';
import { PIECE_PARTS, pieceSvgMarkup } from '../src/ui/pieceShapes';

const TYPES = [PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING];
const NAMES: Record<number, string> = { [PAWN]: 'pawn', [KNIGHT]: 'knight', [BISHOP]: 'bishop', [ROOK]: 'rook', [QUEEN]: 'queen', [KING]: 'king' };

test('all six piece types have artwork with an outline body, shading and the shared plinth', () => {
  const plinth = PIECE_PARTS[PAWN]!.slice(-5).map((p) => p.d).join('|');
  for (const t of TYPES) {
    const parts = PIECE_PARTS[t];
    assert.ok(parts && parts.length >= 6, `${NAMES[t]} has artwork`);
    assert.ok(parts.some((p) => p.kind === 'body'), `${NAMES[t]} has a body`);
    assert.ok(parts.some((p) => p.kind === 'shade'), `${NAMES[t]} has shading`);
    assert.equal(parts.slice(-5).map((p) => p.d).join('|'), plinth, `${NAMES[t]} uses the same plinth as every other piece`);
    for (const p of parts) {
      assert.match(p.d, /^M[-\d.]/, `${NAMES[t]} path starts with a moveto`);
      assert.doesNotMatch(p.d, /NaN|undefined|Infinity/, `${NAMES[t]} path is numeric`);
    }
  }
});

test('the twelve pieces are all visually distinct and never fall back to unicode glyphs', () => {
  const seen = new Set<string>();
  for (const t of TYPES) for (const white of [true, false]) {
    const svg = pieceSvgMarkup(t, white);
    assert.ok(svg.length > 400, 'non-trivial vector artwork');
    assert.doesNotMatch(svg, /[♔-♟]/, 'no unicode chess characters');
    assert.doesNotMatch(svg, /<text|<image/, 'pure vector paths only');
    assert.ok(!seen.has(svg), `${white ? 'white' : 'black'} ${NAMES[t]} is unique`);
    seen.add(svg);
  }
  assert.equal(seen.size, 12);
});

/** Rendering checks need an SVG rasteriser; skipped (loudly) when `sharp` is not installed. */
function loadSharp(): ((input: Buffer) => { raw(): { toBuffer(o: { resolveWithObject: true }): Promise<{ data: Buffer; info: { width: number; height: number; channels: number } }> } }) | null {
  try {
    return createRequire(import.meta.url)('sharp');
  } catch {
    return null;
  }
}
const sharp = loadSharp();

test('every piece renders inside its square, centred, on both colours', { skip: sharp ? false : 'sharp is not installed; piece rendering was not checked' }, async () => {
  const SIZE = 450;
  for (const t of TYPES) for (const white of [true, false]) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 45 45">${pieceSvgMarkup(t, white)}</svg>`;
    const { data, info } = await sharp!(Buffer.from(svg)).raw().toBuffer({ resolveWithObject: true });
    let minX = info.width, maxX = -1, minY = info.height, maxY = -1, sumX = 0, count = 0;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * info.channels + 3]! > 40) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); sumX += x; count++;
      }
    }
    const label = `${white ? 'white' : 'black'} ${NAMES[t]}`;
    assert.ok(minX >= SIZE * 0.1 && maxX <= SIZE * 0.9, `${label} stays inside the square horizontally (${minX}..${maxX})`);
    assert.ok(minY >= SIZE * 0.03 && maxY <= SIZE * 0.95, `${label} stays inside the square vertically (${minY}..${maxY})`);
    assert.ok(maxY - minY > SIZE * 0.55, `${label} is a sensible height`);
    const centroid = sumX / count / SIZE;
    assert.ok(Math.abs(centroid - 0.5) < (t === KNIGHT ? 0.06 : 0.02), `${label} is centred (centroid ${centroid.toFixed(3)})`);
  }
});

test('piece heights follow the Staunton hierarchy: pawn < rook < queen < king', { skip: sharp ? false : 'sharp is not installed' }, async () => {
  const heights: Record<number, number> = {};
  for (const t of TYPES) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="450" height="450" viewBox="0 0 45 45">${pieceSvgMarkup(t, true)}</svg>`;
    const { data, info } = await sharp!(Buffer.from(svg)).raw().toBuffer({ resolveWithObject: true });
    let top = info.height;
    for (let y = 0; y < info.height && top === info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * info.channels + 3]! > 40) { top = y; break; }
    heights[t] = 450 - top;
  }
  assert.ok(heights[PAWN]! < heights[ROOK]!, 'pawn shorter than rook');
  assert.ok(heights[ROOK]! < heights[QUEEN]!, 'rook shorter than queen');
  assert.ok(heights[QUEEN]! < heights[KING]!, 'queen shorter than king');
  assert.ok(heights[BISHOP]! > heights[ROOK]! - 30, 'bishop is tall');
});
