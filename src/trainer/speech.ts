/**
 * Spoken coaching with the browser's Web Speech API (speech synthesis).
 *
 * What this does and does not do:
 *  - Only voices that are installed on the device are used (`localService`). Many browsers also list voices that stream audio from a
 *    server; those would send the coaching text over the network, so they are never selected, never offered and never previewed.
 *  - Browsers do not report whether a voice is male or female. The gender preference is matched from the voice's name against a list
 *    of common voice names, so it is a best effort, and the settings say so whenever the match is not exact.
 *  - Speech is a complement to the written text, which is always shown. If speech is unavailable, nothing else changes.
 *  - One utterance at a time: a new message cancels the one that is still speaking, so old advice never plays over new advice.
 */
import type { TrainerPrefs } from './types';

export interface VoiceInfo {
  uri: string;
  name: string;
  lang: string;
  /** Installed on the device (works without a network). */
  local: boolean;
  isDefault: boolean;
}

export interface SpeakOptions {
  voiceURI: string | null;
  lang: string;
  volume: number;
  rate: number;
  onEnd: () => void;
  onError: (message: string) => void;
}

export interface SpeechBackend {
  readonly supported: boolean;
  getVoices(): VoiceInfo[];
  /** Voices often load after the page does; the callback fires when the list changes. Returns an unsubscribe function. */
  onVoicesChanged(cb: () => void): () => void;
  speak(text: string, options: SpeakOptions): void;
  cancel(): void;
}

export type Gender = 'female' | 'male' | 'unknown';

const FEMALE = new Set(['female', 'woman', 'samantha', 'victoria', 'karen', 'moira', 'tessa', 'fiona', 'susan', 'zira', 'hazel', 'helen', 'catherine', 'linda', 'heather', 'sabrina', 'amy', 'emma', 'joanna', 'kendra', 'kimberly', 'salli', 'ivy', 'nicole', 'olivia', 'allison', 'ava', 'serena', 'jenny', 'aria', 'libby', 'sonia', 'natasha', 'clara', 'michelle', 'jessa', 'ana', 'eva', 'catherine', 'veena', 'tracy', 'zoe', 'kathy', 'princess', 'siri']);
const MALE = new Set(['male', 'man', 'daniel', 'alex', 'fred', 'david', 'mark', 'george', 'james', 'richard', 'oliver', 'tom', 'thomas', 'arthur', 'ryan', 'guy', 'aaron', 'rishi', 'gordon', 'lee', 'ralph', 'albert', 'bruce', 'junior', 'liam', 'eric', 'brian', 'matthew', 'joey', 'justin', 'kevin', 'russell', 'christopher', 'davis', 'jason', 'ravi']);

/** Guess a voice's gender from its name. Returns 'unknown' when the name gives no clear signal. */
export function classifyVoice(v: Pick<VoiceInfo, 'name'>): Gender {
  const words = v.name.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const f = words.some((w) => FEMALE.has(w));
  const m = words.some((w) => MALE.has(w));
  if (f && !m) return 'female';
  if (m && !f) return 'male';
  return 'unknown';
}

export interface VoiceChoice {
  voice: VoiceInfo | null;
  /** True when the voice is the one the person asked for (their explicit pick, or a name that matches the gender asked for). */
  exact: boolean;
  /** What to tell the person when the result is not exactly what they asked for, or null. */
  message: string | null;
  /** How many voices were left out because they stream audio from a server. */
  hiddenRemote: number;
  /** The usable voices, best first, for a voice picker. */
  usable: VoiceInfo[];
}

const isEnglish = (v: VoiceInfo): boolean => /^en([-_]|$)/i.test(v.lang);
/** Voices the system labels as higher quality (iOS and macOS Enhanced/Premium, Windows Natural/Neural) sound far less robotic, so they come first. */
const qualityRank = (v: VoiceInfo): number => (/\b(enhanced|premium|natural|neural)\b/i.test(v.name) ? 0 : 1);
const langRank = (v: VoiceInfo): number => (/^en[-_]GB/i.test(v.lang) ? 0 : /^en[-_]US/i.test(v.lang) ? 1 : 2);

/** Pick the best installed voice for the preferences. Never returns a voice that is not installed on the device. */
export function chooseVoice(voices: readonly VoiceInfo[], prefs: Pick<TrainerPrefs, 'voiceGender' | 'voiceURI'>): VoiceChoice {
  const local = voices.filter((v) => v.local);
  const hiddenRemote = voices.length - local.length;
  const english = local.filter(isEnglish).sort((a, b) => qualityRank(a) - qualityRank(b) || Number(b.isDefault) - Number(a.isDefault) || langRank(a) - langRank(b) || a.name.localeCompare(b.name));
  const usable = english;
  if (usable.length === 0) {
    return {
      voice: null,
      exact: false,
      hiddenRemote,
      usable,
      message: local.length === 0
        ? 'No voices are installed on this device that can speak without a network, so spoken coaching is unavailable here. The written advice is unaffected.'
        : 'No English voice is installed on this device, so spoken coaching is unavailable here. The written advice is unaffected.',
    };
  }
  if (prefs.voiceURI) {
    const picked = usable.find((v) => v.uri === prefs.voiceURI);
    if (picked) return { voice: picked, exact: true, message: null, hiddenRemote, usable };
  }
  const want = prefs.voiceGender;
  const matching = usable.filter((v) => classifyVoice(v) === want);
  if (matching.length) return { voice: matching[0]!, exact: true, message: null, hiddenRemote, usable };
  const fallback = usable.find((v) => classifyVoice(v) === 'unknown') ?? usable[0]!;
  return {
    voice: fallback,
    exact: false,
    hiddenRemote,
    usable,
    message: `No ${want} English voice was found on this device, so ${fallback.name} is used instead. Browsers do not say whether a voice is male or female; this is judged from the voice's name, so it can be wrong.`,
  };
}

export type SpeechStatus = 'unsupported' | 'loading' | 'ready' | 'no-voice';

export interface SpeechState {
  status: SpeechStatus;
  choice: VoiceChoice | null;
  speaking: boolean;
  /** Set when the last attempt to speak failed; cleared by the next success. */
  error: string | null;
  /** Text of the last thing spoken (or attempted), for "replay". */
  last: string | null;
}

export const MAX_SPOKEN_CHARS = 420;
const clip = (t: string): string => (t.length <= MAX_SPOKEN_CHARS ? t : `${t.slice(0, t.lastIndexOf('.', MAX_SPOKEN_CHARS) > 80 ? t.lastIndexOf('.', MAX_SPOKEN_CHARS) + 1 : MAX_SPOKEN_CHARS)}`);

export const PREVIEW_TEXT = 'This is how your Trainer will sound. If a move looks risky, I will tell you before you play it.';

export class SpeechManager {
  private prefs: Pick<TrainerPrefs, 'speech' | 'voiceGender' | 'voiceURI' | 'volume'> = { speech: false, voiceGender: 'female', voiceURI: null, volume: 0.8 };
  private state: SpeechState;
  private listeners = new Set<() => void>();
  private unsubscribe: (() => void) | null = null;
  private token = 0;
  private disposed = false;
  private loadTimer: ReturnType<typeof setTimeout> | null = null;
  private loadTries = 0;

  constructor(private readonly backend: SpeechBackend, private readonly loadAttempts = 8, private readonly loadIntervalMs = 250) {
    this.state = { status: backend.supported ? 'loading' : 'unsupported', choice: null, speaking: false, error: null, last: null };
    if (backend.supported) {
      this.refresh();
      this.unsubscribe = backend.onVoicesChanged(() => this.refresh());
      this.scheduleLoadCheck();
    }
  }

  /** Voices often arrive after the page loads. Look again a few times before concluding that there are none. */
  private scheduleLoadCheck(): void {
    if (this.disposed || this.state.status !== 'loading') return;
    this.loadTimer = setTimeout(() => {
      this.loadTries++;
      this.refresh(this.loadTries >= this.loadAttempts);
      this.scheduleLoadCheck();
    }, this.loadIntervalMs);
  }

  private refresh(final = false): void {
    if (this.disposed || !this.backend.supported) return;
    const voices = this.backend.getVoices();
    if (voices.length === 0 && !final) {
      this.set({ status: 'loading' });
      return;
    }
    const choice = chooseVoice(voices, this.prefs);
    this.set({ choice, status: choice.voice ? 'ready' : 'no-voice' });
  }

  private set(patch: Partial<SpeechState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  getState(): SpeechState {
    return this.state;
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  configure(prefs: Pick<TrainerPrefs, 'speech' | 'voiceGender' | 'voiceURI' | 'volume'>): void {
    const was = this.prefs;
    this.prefs = { ...prefs };
    if (!prefs.speech && this.state.speaking) this.stop();
    if (was.voiceGender !== prefs.voiceGender || was.voiceURI !== prefs.voiceURI) this.refresh(this.state.status !== 'loading');
  }

  /** Speak a message if spoken coaching is on and a voice is available. Cancels anything still being spoken. Returns whether it started. */
  speak(text: string): boolean {
    this.set({ last: text });
    if (!this.prefs.speech) return false;
    return this.start(text);
  }

  /** Speak regardless of the on/off switch (used by "Replay" and "Preview", which the person asks for directly). */
  speakNow(text: string): boolean {
    this.set({ last: text });
    return this.start(text);
  }

  replay(): boolean {
    return this.state.last ? this.start(this.state.last) : false;
  }

  preview(): boolean {
    return this.start(PREVIEW_TEXT);
  }

  private start(text: string): boolean {
    if (this.disposed || !this.backend.supported) return false;
    const voice = this.state.choice?.voice ?? null;
    if (!voice) return false;
    // Cancel what is still speaking so messages never overlap or arrive late.
    this.backend.cancel();
    const mine = ++this.token;
    this.set({ speaking: true, error: null });
    try {
      this.backend.speak(clip(text), {
        voiceURI: voice.uri,
        lang: voice.lang,
        volume: Math.max(0, Math.min(1, this.prefs.volume)),
        rate: 1,
        onEnd: () => {
          if (mine === this.token) this.set({ speaking: false });
        },
        onError: (message) => {
          if (mine === this.token) this.set({ speaking: false, error: message });
        },
      });
    } catch (e) {
      this.set({ speaking: false, error: e instanceof Error ? e.message : 'Speech failed' });
      return false;
    }
    return true;
  }

  /** Stop speaking now and ignore the end/error callbacks of whatever was cancelled. */
  stop(): void {
    this.token++;
    if (this.backend.supported) {
      try {
        this.backend.cancel();
      } catch {
        /* ignore */
      }
    }
    if (this.state.speaking) this.set({ speaking: false });
  }

  dispose(): void {
    this.stop();
    this.disposed = true;
    if (this.loadTimer) clearTimeout(this.loadTimer);
    this.unsubscribe?.();
    this.listeners.clear();
  }
}

/** The real backend: window.speechSynthesis. Everything is guarded, because support and behaviour vary by browser. */
export class WebSpeechBackend implements SpeechBackend {
  private synth: SpeechSynthesis | null = typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined' ? window.speechSynthesis : null;
  private raw: SpeechSynthesisVoice[] = [];

  get supported(): boolean {
    return this.synth !== null;
  }

  getVoices(): VoiceInfo[] {
    if (!this.synth) return [];
    this.raw = this.synth.getVoices();
    return this.raw.map((v) => ({ uri: v.voiceURI, name: v.name, lang: v.lang, local: v.localService, isDefault: v.default }));
  }

  onVoicesChanged(cb: () => void): () => void {
    const s = this.synth;
    if (!s) return () => undefined;
    s.addEventListener('voiceschanged', cb);
    return () => s.removeEventListener('voiceschanged', cb);
  }

  speak(text: string, o: SpeakOptions): void {
    if (!this.synth) throw new Error('Speech is not supported in this browser');
    const u = new SpeechSynthesisUtterance(text);
    const v = this.raw.find((x) => x.voiceURI === o.voiceURI && x.localService);
    if (!v) throw new Error('The chosen voice is not available');
    u.voice = v;
    u.lang = o.lang;
    u.volume = o.volume;
    u.rate = o.rate;
    u.onend = () => o.onEnd();
    u.onerror = (e) => (e.error === 'canceled' || e.error === 'interrupted' ? o.onEnd() : o.onError(`Speech failed (${e.error})`));
    this.synth.speak(u);
  }

  cancel(): void {
    this.synth?.cancel();
  }
}
