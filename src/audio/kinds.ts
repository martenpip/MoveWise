/**
 * Sound vocabulary and preferences. Pure data: no browser APIs, so it is shared by the sound manager,
 * the settings page, the backup validator and the tests.
 */

export type SoundCategory = 'board' | 'ui' | 'achievements';

export const BOARD_SOUNDS = [
  'move',
  'capture',
  'check',
  'checkmate',
  'castle',
  'promotion',
  'illegal',
  'select',
  'resultWin',
  'resultLoss',
  'resultDraw',
] as const;
export const UI_SOUNDS = ['click', 'nav', 'toggleOn', 'toggleOff', 'setting', 'modalOpen', 'modalClose', 'success', 'error'] as const;
export const ACHIEVEMENT_SOUNDS = ['achievement', 'achievementRare', 'notify'] as const;

export type SoundKind = (typeof BOARD_SOUNDS)[number] | (typeof UI_SOUNDS)[number] | (typeof ACHIEVEMENT_SOUNDS)[number];
export const ALL_SOUNDS: readonly SoundKind[] = [...BOARD_SOUNDS, ...UI_SOUNDS, ...ACHIEVEMENT_SOUNDS];

export interface SoundMeta {
  category: SoundCategory;
  /**
   * Higher wins when two sounds are requested within a few milliseconds of each other. The lower one is dropped
   * (never both), so one action can never produce a pile of sounds.
   */
  priority: number;
}

const board = (priority: number): SoundMeta => ({ category: 'board', priority });
const ui: SoundMeta = { category: 'ui', priority: 1 };
const ach: SoundMeta = { category: 'achievements', priority: 4 };

export const SOUND_META: Record<SoundKind, SoundMeta> = {
  select: board(1.5),
  illegal: board(2),
  move: board(2),
  capture: board(2),
  castle: board(2),
  resultWin: board(2),
  resultLoss: board(2),
  resultDraw: board(2),
  promotion: board(2.5),
  check: board(2.5),
  checkmate: board(3),
  click: ui,
  nav: ui,
  toggleOn: ui,
  toggleOff: ui,
  setting: ui,
  modalOpen: ui,
  modalClose: ui,
  success: ui,
  error: ui,
  achievement: ach,
  achievementRare: ach,
  notify: ach,
};

export interface SoundPrefs {
  /** Master switch. Off means nothing is ever played. */
  master: boolean;
  board: boolean;
  ui: boolean;
  achievements: boolean;
  /** 0..1 overall volume. */
  volume: number;
  /** 0..1 relative volume of board and UI sounds (multiplied by `volume`). */
  boardVolume: number;
  uiVolume: number;
  /** A very quiet tick when a piece is picked up. */
  selectSound: boolean;
  /** Play move sounds when stepping one move forward through a game (replay, analysis, history). */
  replay: boolean;
  /** Also play a sound when taking a move back or stepping backwards. Off by default. */
  undo: boolean;
}

export const DEFAULT_SOUND_PREFS: SoundPrefs = {
  master: true,
  board: true,
  ui: true,
  achievements: true,
  volume: 0.7,
  boardVolume: 1,
  uiVolume: 0.6,
  selectSound: false,
  replay: true,
  undo: false,
};

const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
const vol = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);

/**
 * Accepts anything read from storage or an imported file. The old settings format stored one boolean; its value is
 * not carried over (it was off by default and covered a single beep), so such files get the new defaults.
 */
export function sanitizeSoundPrefs(raw: unknown): SoundPrefs {
  const d = DEFAULT_SOUND_PREFS;
  if (typeof raw !== 'object' || raw === null) return { ...d };
  const v = raw as Record<string, unknown>;
  return {
    master: bool(v.master, d.master),
    board: bool(v.board, d.board),
    ui: bool(v.ui, d.ui),
    achievements: bool(v.achievements, d.achievements),
    volume: vol(v.volume, d.volume),
    boardVolume: vol(v.boardVolume, d.boardVolume),
    uiVolume: vol(v.uiVolume, d.uiVolume),
    selectSound: bool(v.selectSound, d.selectSound),
    replay: bool(v.replay, d.replay),
    undo: bool(v.undo, d.undo),
  };
}

/** Effective gain (0..1) for a sound under the given preferences, or 0 when it must stay silent. */
export function gainFor(kind: SoundKind, prefs: SoundPrefs): number {
  if (!prefs.master) return 0;
  const { category } = SOUND_META[kind];
  if (!prefs[category]) return 0;
  if (kind === 'select' && !prefs.selectSound) return 0;
  const rel = category === 'board' ? prefs.boardVolume : category === 'ui' ? prefs.uiVolume : 1;
  return prefs.volume * rel;
}
