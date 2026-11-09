// Renders every synthesised sound offline in Chromium (OfflineAudioContext) and checks the audio itself:
// not silent, not clipping, finishes, and the sounds differ from each other in the ways the design requires
// (a capture is lower and heavier than a move, checkmate is long and low, UI sounds are quieter, ...).
// Usage: node tests/sound-render.mjs [wavOutDir]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const esbuild = require('esbuild');

const bundle = esbuild.buildSync({
  entryPoints: ['src/audio/recipes.ts'], bundle: true, format: 'iife', globalName: 'R', write: false, target: 'es2022',
}).outputFiles[0].text;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<html></html>');
await page.addScriptTag({ content: bundle });
const KINDS = process.env.KINDS ? JSON.parse(process.env.KINDS) : null;
const result = await page.evaluate(async (list) => {
  const SR = 44100;
  const out = {};
  for (const kind of list) {
    const ctx = new OfflineAudioContext(1, SR * 3, SR);
    const bus = ctx.createGain();
    bus.connect(ctx.destination);
    const len = R.renderSound(kind, { ctx, out: bus, t0: 0.005, v: 0 });
    const buf = await ctx.startRendering();
    const d = buf.getChannelData(0);
    let peak = 0, sum = 0;
    for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sum += d[i] * d[i]; }
    // Energy-weighted spectral centroid of the first 0.37 s (Hann window, radix-2 FFT).
    const N = 16384, re = new Float32Array(N), im = new Float32Array(N);
    for (let n = 0; n < N && n < d.length; n++) re[n] = d[n] * (0.5 - 0.5 * Math.cos((2 * Math.PI * n) / N));
    for (let i = 1, j = 0; i < N; i++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; } }
    for (let len = 2; len <= N; len <<= 1) {
      const ang = (-2 * Math.PI) / len;
      for (let i = 0; i < N; i += len) for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
        const ur = re[i + k], ui = im[i + k], xr = re[i + k + len / 2], xi = im[i + k + len / 2];
        const vr = xr * wr - xi * wi, vi = xr * wi + xi * wr;
        re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
      }
    }
    let num = 0, den = 0;
    const band = [0, 0, 0];
    for (let k = 1; k < N / 2; k++) { const m = re[k] * re[k] + im[k] * im[k]; const f = (k * SR) / N; num += f * m; den += m; band[f < 300 ? 0 : f < 1800 ? 1 : 2] += m; }
    // length until the level stays under -50 dB of the peak
    let end = d.length - 1;
    while (end > 0 && Math.abs(d[end]) < peak * 0.01) end--;
    out[kind] = { peak, rms: Math.sqrt(sum / (SR * 0.5)), centroid: den ? num / den : 0, tail: end / SR, bands: band.map((x) => x / (den || 1)), declared: len, samples: Array.from(d.slice(0, Math.min(d.length, Math.ceil((end + 2000))))) };
  }
  return out;
}, KINDS ?? ['move','capture','check','checkmate','castle','promotion','illegal','select','resultWin','resultLoss','resultDraw','click','nav','toggleOn','toggleOff','setting','modalOpen','modalClose','success','error','achievement','achievementRare','notify']);
await browser.close();

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };
for (const [k, r] of Object.entries(result)) {
  ok(r.peak > 0.01, `${k}: silent (peak ${r.peak.toFixed(4)})`);
  ok(r.peak < 0.98, `${k}: clips (peak ${r.peak.toFixed(3)})`);
  ok(r.tail < 3, `${k}: does not finish within 3 s`);
  ok(r.tail <= r.declared + 0.25, `${k}: audible tail ${r.tail.toFixed(2)} s is much longer than its declared ${r.declared} s (would overlap achievements)`);
  console.log(`${k.padEnd(16)} peak ${r.peak.toFixed(2)}  rms ${r.rms.toFixed(3)}  centroid ${Math.round(r.centroid).toString().padStart(5)} Hz  tail ${r.tail.toFixed(2)} s (declared ${r.declared})  low/mid/high ${r.bands.map((x) => Math.round(x * 100)).join('/')}%`);
}
const g = (k) => result[k];
ok(g('capture').rms > g('move').rms * 1.15, 'capture should be heavier (more energy) than a move');
ok(g('capture').centroid < g('move').centroid, 'capture should be lower in pitch than a move');
ok(g('checkmate').tail > 1.0 && g('checkmate').tail > g('check').tail, 'checkmate should ring longer than check');
ok(g('achievementRare').tail > g('achievement').tail, 'a rare achievement should be fuller than a normal one');
ok(g('click').peak < g('move').peak, 'UI click should be quieter than a board move');
ok(g('select').peak < g('move').peak * 0.5, 'piece-select tick should be much quieter than a move');
ok(g('illegal').peak < g('move').peak, 'illegal-move feedback should be quieter than a move');
// no two sounds should be near-identical
const names = Object.keys(result);
for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
  const a = g(names[i]), b = g(names[j]);
  const dist = Math.abs(Math.log(a.centroid / b.centroid)) + Math.abs(Math.log(Math.max(a.tail, 0.02) / Math.max(b.tail, 0.02))) + Math.abs(Math.log(Math.max(a.rms, 1e-4) / Math.max(b.rms, 1e-4)));
  if (dist < 0.12) fails.push(`${names[i]} and ${names[j]} are too similar (distance ${dist.toFixed(3)})`);
}
if (process.argv[2]) {
  mkdirSync(process.argv[2], { recursive: true });
  for (const [k, r] of Object.entries(result)) {
    const n = r.samples.length, buf = Buffer.alloc(44 + n * 2);
    buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
    buf.writeUInt32LE(44100, 24); buf.writeUInt32LE(88200, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
    r.samples.forEach((x, i) => buf.writeInt16LE(Math.max(-1, Math.min(1, x)) * 32767, 44 + i * 2));
    writeFileSync(`${process.argv[2]}/${k}.wav`, buf);
  }
}
if (fails.length) { console.log('\nFAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
console.log(`\n${names.length} sounds rendered and checked.`);
