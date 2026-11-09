// Renders the PNG app icons from public/icons/icon.svg (needs `sharp`).
import { createRequire } from 'node:module';
const sharp = createRequire(import.meta.url)('sharp');
import { readFileSync } from 'node:fs';
const svg = readFileSync(new URL('../public/icons/icon.svg', import.meta.url));
const out = new URL('../public/icons/', import.meta.url).pathname;
for (const size of [192, 512]) await sharp(svg, { density: 384 }).resize(size, size).png().toFile(`${out}icon-${size}.png`);
// Maskable: full-bleed background with the mark inside the safe zone (80%).
const inner = await sharp(svg, { density: 384 }).resize(410, 410).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#0f1420' } })
  .composite([{ input: inner, left: 51, top: 51 }])
  .png()
  .toFile(`${out}icon-maskable-512.png`);
console.log('icons written');
