/**
 * The sound manager: decides WHETHER and WHEN a sound plays. It knows nothing about the Web Audio API (a backend
 * does the actual playing), so every rule here is unit-tested with a fake backend and a fake clock.
 */
import { DEFAULT_SOUND_PREFS, SOUND_META, gainFor, type SoundKind, type SoundPrefs } from './kinds';

export interface SoundBackend {
  /** True once the browser allows audio (after a user gesture) and the context is running. */
  ready(): boolean;
  /** Seconds on the backend's clock. */
  now(): number;
  /** Start a sound at `at` (backend clock) with the given gain. Returns its length in seconds. Must never throw. */
  play(kind: SoundKind, gain: number, at: number): number;
}

/** Sounds requested this soon after a stronger or identical one are dropped instead of layered. */
const WINDOW_S = 0.07;
/** An achievement waits for the board sound still ringing, then starts this much later. */
const ACHIEVEMENT_GAP_S = 0.15;
/** Never delay a sound by more than this; a late chime is worse than a missed one. */
const MAX_WAIT_S = 2.5;

export type SoundListener = (kind: SoundKind, gain: number) => void;

export class SoundManager {
  private prefs: SoundPrefs = { ...DEFAULT_SOUND_PREFS };
  private last: { kind: SoundKind; at: number } | null = null;
  private busyUntil = 0;
  private listeners = new Set<SoundListener>();

  constructor(private readonly backend: SoundBackend) {}

  /** Apply preferences immediately; takes effect for the very next sound. */
  configure(prefs: SoundPrefs): void {
    this.prefs = prefs;
  }

  getPrefs(): SoundPrefs {
    return this.prefs;
  }

  /** Notified whenever a sound is actually started (used by tests and the debug event). */
  onPlay(fn: SoundListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Play a sound if the preferences, the browser and the anti-pile-up rules allow it. Returns whether it played. */
  play(kind: SoundKind): boolean {
    const gain = gainFor(kind, this.prefs);
    if (gain <= 0) return false;
    if (!this.backend.ready()) return false;
    const now = this.backend.now();
    const meta = SOUND_META[kind];
    const recent = this.last;
    if (recent && now - recent.at < WINDOW_S) {
      const rp = SOUND_META[recent.kind].priority;
      if (rp > meta.priority) return false;
      if (rp === meta.priority && (recent.kind === kind || meta.category === 'ui')) return false;
    }
    return this.start(kind, gain, now);
  }

  /**
   * Settings preview: needs the master switch and a volume, but ignores the per-category switches and the
   * anti-pile-up rule so people can hear what they are about to turn on.
   */
  preview(kind: SoundKind): boolean {
    if (!this.prefs.master || !this.backend.ready()) return false;
    const category = SOUND_META[kind].category;
    const rel = category === 'board' ? this.prefs.boardVolume : category === 'ui' ? this.prefs.uiVolume : 1;
    const gain = this.prefs.volume * rel;
    if (gain <= 0) return false;
    return this.start(kind, gain, this.backend.now());
  }

  private start(kind: SoundKind, gain: number, now: number): boolean {
    const meta = SOUND_META[kind];
    let at = now;
    if (meta.category === 'achievements' && this.busyUntil > now) at = Math.min(this.busyUntil + ACHIEVEMENT_GAP_S, now + MAX_WAIT_S);
    const length = this.backend.play(kind, gain, at);
    this.last = { kind, at: now };
    this.busyUntil = Math.max(this.busyUntil, at + length);
    for (const fn of this.listeners) fn(kind, gain);
    return true;
  }
}
