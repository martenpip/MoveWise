/** The real sound backend: lazily creates one AudioContext after a user gesture and plays recipes through it. */
import type { SoundBackend } from './manager';
import type { SoundKind } from './kinds';
import { renderSound } from './recipes';

type AudioCtor = typeof AudioContext;

export class WebAudioBackend implements SoundBackend {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private failed = false;

  /**
   * Browsers only allow audio after a user gesture. Call this from a click / key / touch handler; it creates the
   * context the first time and resumes it if the browser suspended it. Safe to call repeatedly.
   */
  unlock(): void {
    if (this.failed) return;
    try {
      if (!this.ctx) {
        const Ctor: AudioCtor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
        if (!Ctor) {
          this.failed = true;
          return;
        }
        this.ctx = new Ctor({ latencyHint: 'interactive' });
        // A gentle compressor on the bus keeps overlapping sounds from clipping.
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.knee.value = 18;
        comp.ratio.value = 4;
        comp.attack.value = 0.003;
        comp.release.value = 0.15;
        comp.connect(this.ctx.destination);
        this.bus = this.ctx.createGain();
        this.bus.connect(comp);
      }
      if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => undefined);
    } catch {
      this.failed = true;
    }
  }

  ready(): boolean {
    return !this.failed && this.ctx !== null && this.ctx.state === 'running';
  }

  now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  play(kind: SoundKind, gain: number, at: number): number {
    const ctx = this.ctx;
    const bus = this.bus;
    if (!ctx || !bus) return 0;
    try {
      const out = ctx.createGain();
      out.gain.value = gain;
      out.connect(bus);
      const length = renderSound(kind, { ctx, out, t0: Math.max(at, ctx.currentTime) + 0.005, v: Math.random() * 2 - 1 });
      // Free the per-sound gain node once it has finished.
      setTimeout(() => out.disconnect(), (Math.max(0, at - ctx.currentTime) + length + 0.5) * 1000);
      return length;
    } catch {
      return 0;
    }
  }
}
