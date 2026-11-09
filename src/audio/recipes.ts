/**
 * Every sound in MoveWise is synthesised here with the Web Audio API: there are no audio files, no downloads and no
 * licences to track, and nothing to cache for offline use. A recipe schedules nodes on any BaseAudioContext, so the
 * same code runs live (AudioContext) and in tests (OfflineAudioContext).
 *
 * Board sounds are meant to be a soft thump of a piece set down on a padded wooden board: a rounded low body, a quiet
 * wooden overtone and a muffled touch of felt. Captures are lower, longer and heavier. Pitched sounds (check, promotion, achievements) use soft bell/marimba partials, never raw beeps.
 */
import type { SoundKind } from './kinds';

type Ctx = BaseAudioContext;

export interface Voice {
  ctx: Ctx;
  out: AudioNode;
  t0: number;
  /** -1..1, small random variation so repeated moves do not sound machine-identical. */
  v: number;
}

/** Seconds a recipe's sound lasts (the longest tail), used to avoid layering chimes on top of it. */
export type Recipe = (voice: Voice) => number;

const noiseCache = new WeakMap<Ctx, AudioBuffer>();
function noiseBuffer(ctx: Ctx): AudioBuffer {
  let buf = noiseCache.get(ctx);
  if (!buf) {
    const len = Math.floor(ctx.sampleRate * 0.5);
    buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    // Deterministic noise: the same sound renders the same way every time.
    let s = 1234567;
    for (let i = 0; i < len; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      data[i] = (s / 0x80000000) - 1;
    }
    noiseCache.set(ctx, buf);
  }
  return buf;
}

interface NoiseOpts {
  at?: number;
  type: BiquadFilterType;
  freq: number;
  q?: number;
  gain: number;
  /** Time constant of the exponential decay (seconds). */
  tau: number;
  /** Total length scheduled (seconds). */
  len?: number;
  /** Optional filter sweep target. */
  toFreq?: number;
  /** Seconds to reach full level. A slower attack is what makes a sound feel soft instead of sharp. */
  attack?: number;
}

function noise(vc: Voice, o: NoiseOpts): void {
  const { ctx, out, t0 } = vc;
  const at = t0 + (o.at ?? 0);
  const len = o.len ?? o.tau * 6;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const f = ctx.createBiquadFilter();
  f.type = o.type;
  f.frequency.setValueAtTime(o.freq, at);
  if (o.toFreq) f.frequency.exponentialRampToValueAtTime(o.toFreq, at + len);
  f.Q.value = o.q ?? 1;
  const g = ctx.createGain();
  // A narrow filter lets very little of white noise through, so `gain` is scaled up to mean roughly the same
  // loudness whatever the filter: it states how strong the sound is, not how much noise goes in.
  const nyq = ctx.sampleRate / 2;
  const bw = o.type === 'bandpass' ? o.freq / (o.q ?? 1) : o.type === 'lowpass' ? o.freq : nyq;
  const comp = Math.min(14, Math.sqrt(nyq / Math.max(bw, 40))) * (o.type === 'highpass' ? 1 : 0.45);
  g.gain.setValueAtTime(0.0001, at);
  const att = o.attack ?? 0.0015;
  g.gain.linearRampToValueAtTime(o.gain * comp, at + att);
  g.gain.setTargetAtTime(0, at + att, o.tau);
  src.connect(f).connect(g).connect(out);
  src.start(at, 0.02 + Math.abs(vc.v) * 0.2);
  src.stop(at + len);
}

interface ToneOpts {
  at?: number;
  freq: number;
  toFreq?: number;
  gain: number;
  tau: number;
  attack?: number;
  type?: OscillatorType;
  len?: number;
}

function tone(vc: Voice, o: ToneOpts): void {
  const { ctx, out, t0 } = vc;
  const at = t0 + (o.at ?? 0);
  const len = o.len ?? o.tau * 6;
  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, at);
  if (o.toFreq) osc.frequency.exponentialRampToValueAtTime(o.toFreq, at + Math.min(len, o.tau * 2));
  const g = ctx.createGain();
  const a = o.attack ?? 0.002;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(o.gain, at + a);
  g.gain.setTargetAtTime(0, at + a, o.tau);
  osc.connect(g).connect(out);
  osc.start(at);
  osc.stop(at + len);
}

/** A soft pitched "bell": fundamental plus a quickly fading upper partial. */
function bell(vc: Voice, at: number, freq: number, gain: number, tau: number, partial = 2.76): void {
  tone(vc, { at, freq, gain, tau });
  tone(vc, { at, freq: freq * partial, gain: gain * 0.28, tau: tau * 0.4 });
}

/** Marimba-like: warm fundamental plus a short 4th-harmonic "tok". */
function marimba(vc: Voice, at: number, freq: number, gain: number, tau: number): void {
  tone(vc, { at, freq, gain, tau });
  tone(vc, { at, freq: freq * 4, gain: gain * 0.22, tau: tau * 0.18 });
}

const pitch = (vc: Voice, f: number, amount = 0.05): number => f * (1 + vc.v * amount);

/**
 * The board "thump": a piece set down on a padded wooden board. It is built to be soft and warm, not sharp:
 *  - a low rounded body that drops a little in pitch, with a slow-ish attack so there is no click at the start,
 *  - a quieter upper partial that gives it the wood (a phone speaker cannot play the lowest note, but it does play this),
 *  - a muffled contact noise, low-passed, as the felt touches the board,
 *  - a very quiet second note a moment later, as the piece settles, so each move lands with a small sense of weight.
 * `weight` scales loudness; `pitch` sets the brightness (lower = heavier); `body` is how much low resonance there is.
 */
function knock(vc: Voice, o: { at?: number; weight: number; pitch: number; body?: number; knock?: number }): void {
  const at = o.at ?? 0;
  const w = o.weight;
  const f0 = pitch(vc, o.pitch) * 0.4;
  const body = (o.body ?? 0.22) * w;
  tone(vc, { at, freq: f0, toFreq: f0 * 0.7, gain: body, tau: 0.05, attack: 0.006, len: 0.4 });
  tone(vc, { at, freq: f0 * 2.1, toFreq: f0 * 1.9, gain: body * 0.7, tau: 0.03, attack: 0.005, len: 0.25 });
  noise(vc, { at, type: 'lowpass', freq: pitch(vc, o.pitch) * 1.5, q: 0.5, gain: (o.knock ?? 0.5) * w * 0.5, tau: 0.014, attack: 0.005, len: 0.12 });
  tone(vc, { at: at + 0.05, freq: f0 * 0.92, toFreq: f0 * 0.75, gain: body * 0.16, tau: 0.04, attack: 0.012, len: 0.3 });
}

const R: Record<SoundKind, Recipe> = {
  /* ---------------------------- board ---------------------------- */
  move: (vc) => {
    knock(vc, { weight: 0.8, pitch: 950 });
    return 0.22;
  },
  capture: (vc) => {
    // Heavier and lower, with a second lighter tap as the taken piece is lifted away.
    knock(vc, { weight: 1.2, pitch: 560, body: 0.34, knock: 0.5 });
    noise(vc, { at: 0.012, type: 'lowpass', freq: 500, q: 0.8, gain: 0.12, tau: 0.05, len: 0.25 });
    noise(vc, { at: 0.085, type: 'bandpass', freq: pitch(vc, 1250), q: 4, gain: 0.16, tau: 0.01, len: 0.1 });
    return 0.3;
  },
  castle: (vc) => {
    knock(vc, { weight: 0.8, pitch: 780, body: 0.22 });
    knock(vc, { at: 0.115, weight: 0.7, pitch: 1000, body: 0.18 });
    return 0.3;
  },
  check: (vc) => {
    knock(vc, { weight: 0.8, pitch: 860 });
    // A soft two-note warning: a bell falling a minor third, clearly "attention" but not an alarm.
    bell(vc, 0.03, 880, 0.2, 0.09);
    bell(vc, 0.15, 698.5, 0.2, 0.11);
    return 0.6;
  },
  checkmate: (vc) => {
    knock(vc, { weight: 1.2, pitch: 520, body: 0.34, knock: 0.5 });
    // A low, slowly fading bell (partials of a struck bar) under the final knock.
    tone(vc, { at: 0.02, freq: 174.6, gain: 0.34, tau: 0.42, len: 2.2 });
    tone(vc, { at: 0.02, freq: 174.6 * 2.01, gain: 0.16, tau: 0.26, len: 1.6 });
    tone(vc, { at: 0.02, freq: 174.6 * 3.0, gain: 0.09, tau: 0.16, len: 1.2 });
    tone(vc, { at: 0.02, freq: 174.6 * 4.17, gain: 0.04, tau: 0.1, len: 0.8 });
    return 1.6;
  },
  promotion: (vc) => {
    knock(vc, { weight: 0.75, pitch: 900 });
    // Three rising marimba notes: C5, E5, A5.
    marimba(vc, 0.07, 523.25, 0.26, 0.11);
    marimba(vc, 0.14, 659.25, 0.26, 0.11);
    marimba(vc, 0.21, 880, 0.3, 0.16);
    return 0.9;
  },
  illegal: (vc) => {
    // Quiet, dull and low: "not that one".
    tone(vc, { freq: pitch(vc, 150, 0.03), toFreq: 105, gain: 0.26, tau: 0.03, len: 0.2 });
    noise(vc, { type: 'lowpass', freq: 380, q: 0.6, gain: 0.2, tau: 0.015, len: 0.1 });
    return 0.15;
  },
  select: (vc) => {
    noise(vc, { type: 'highpass', freq: 3200, q: 0.7, gain: 0.12, tau: 0.004, len: 0.04 });
    tone(vc, { freq: 1500, gain: 0.03, tau: 0.006, len: 0.05 });
    return 0.05;
  },
  resultWin: (vc) => {
    marimba(vc, 0, 392, 0.2, 0.16);
    marimba(vc, 0.13, 523.25, 0.22, 0.24);
    return 1.2;
  },
  resultLoss: (vc) => {
    bell(vc, 0, 329.63, 0.18, 0.18, 2.0);
    bell(vc, 0.16, 261.63, 0.18, 0.26, 2.0);
    return 1.25;
  },
  resultDraw: (vc) => {
    bell(vc, 0, 392, 0.17, 0.2, 2.0);
    bell(vc, 0.15, 392, 0.12, 0.2, 2.0);
    return 1.05;
  },
  /* ------------------------------ UI ----------------------------- */
  click: (vc) => {
    noise(vc, { type: 'highpass', freq: 2400, q: 0.7, gain: 0.24, tau: 0.004, len: 0.04 });
    tone(vc, { freq: 880, toFreq: 640, gain: 0.14, tau: 0.012, len: 0.07 });
    return 0.07;
  },
  nav: (vc) => {
    tone(vc, { freq: 520, toFreq: 600, gain: 0.12, tau: 0.03, len: 0.14 });
    tone(vc, { at: 0.05, freq: 700, toFreq: 780, gain: 0.1, tau: 0.04, len: 0.16 });
    return 0.2;
  },
  toggleOn: (vc) => {
    tone(vc, { freq: 1200, gain: 0.14, tau: 0.014, len: 0.08 });
    noise(vc, { type: 'highpass', freq: 3000, gain: 0.12, tau: 0.003, len: 0.03 });
    return 0.08;
  },
  toggleOff: (vc) => {
    tone(vc, { freq: 820, gain: 0.14, tau: 0.014, len: 0.08 });
    noise(vc, { type: 'highpass', freq: 2200, gain: 0.1, tau: 0.003, len: 0.03 });
    return 0.08;
  },
  setting: (vc) => {
    bell(vc, 0, 660, 0.13, 0.05, 2.0);
    bell(vc, 0.06, 880, 0.12, 0.07, 2.0);
    return 0.4;
  },
  modalOpen: (vc) => {
    tone(vc, { freq: 420, toFreq: 640, gain: 0.12, tau: 0.04, len: 0.16 });
    noise(vc, { type: 'bandpass', freq: 800, toFreq: 1800, q: 1, gain: 0.05, tau: 0.04, len: 0.12 });
    return 0.18;
  },
  modalClose: (vc) => {
    tone(vc, { freq: 640, toFreq: 420, gain: 0.1, tau: 0.04, len: 0.14 });
    return 0.16;
  },
  success: (vc) => {
    bell(vc, 0, 659.25, 0.15, 0.07, 2.0);
    bell(vc, 0.08, 987.77, 0.15, 0.11, 2.0);
    return 0.6;
  },
  error: (vc) => {
    tone(vc, { freq: 233, toFreq: 207, gain: 0.17, tau: 0.05, type: 'triangle', len: 0.22 });
    tone(vc, { at: 0.11, freq: 196, toFreq: 175, gain: 0.15, tau: 0.06, type: 'triangle', len: 0.25 });
    return 0.35;
  },
  /* ------------------------ achievements ------------------------- */
  notify: (vc) => {
    bell(vc, 0, 987.77, 0.2, 0.12, 2.0);
    bell(vc, 0.1, 1318.5, 0.17, 0.2, 2.0);
    return 0.95;
  },
  achievement: (vc) => {
    // C5 E5 G5 C6: an open, rising major arpeggio with a little sparkle on top.
    const n = [523.25, 659.25, 783.99, 1046.5];
    n.forEach((f, i) => marimba(vc, i * 0.085, f, 0.27, 0.16 + i * 0.03));
    noise(vc, { at: 0.3, type: 'highpass', freq: 6500, gain: 0.05, tau: 0.08, len: 0.4 });
    return 1.35;
  },
  achievementRare: (vc) => {
    const n = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    n.forEach((f, i) => marimba(vc, i * 0.09, f, 0.27, 0.18 + i * 0.04));
    // A soft sustained chord underneath (C4 + G4 + C5), fading in slowly.
    [261.63, 392, 523.25].forEach((f) => tone(vc, { at: 0.02, freq: f, gain: 0.09, tau: 0.5, attack: 0.12, len: 2.4 }));
    noise(vc, { at: 0.38, type: 'highpass', freq: 6000, gain: 0.06, tau: 0.12, len: 0.6 });
    return 2.1;
  },
};

/** Schedule a sound; returns how long it lasts. */
export function renderSound(kind: SoundKind, vc: Voice): number {
  return R[kind](vc);
}
