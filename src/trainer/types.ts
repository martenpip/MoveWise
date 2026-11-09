/** Preferences for Play with Trainer. Spoken coaching is separate from the chess sound effects (src/audio). */
export interface TrainerPrefs {
  /** Speak the important coaching messages aloud (Web Speech API, voices installed on this device only). Off by default. */
  speech: boolean;
  /** The voice the person asked for. Browsers do not report a voice's gender, so this is matched from the voice's name. */
  voiceGender: 'female' | 'male';
  /** A specific installed voice chosen by the person (overrides the gender preference), or null. */
  voiceURI: string | null;
  /** 0 to 1. Independent of the sound-effect volume. */
  volume: number;
  /** Warn before a serious blunder is played. */
  warnings: boolean;
  /** How much detail the explanations give. */
  detail: 'beginner' | 'concise';
}

export const DEFAULT_TRAINER_PREFS: TrainerPrefs = {
  speech: false,
  voiceGender: 'female',
  voiceURI: null,
  volume: 0.8,
  warnings: true,
  detail: 'beginner',
};

export type TrainerMessageKind = 'welcome' | 'warning' | 'bot-move' | 'your-move' | 'threat' | 'result';

export interface TrainerMessage {
  id: number;
  kind: TrainerMessageKind;
  text: string;
  /** Whether this message is important enough to be spoken when spoken coaching is on. The text is always shown. */
  speak: boolean;
}
