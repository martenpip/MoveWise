import type { GameResult } from '../chess/types';
import { DEFAULT_SOUND_PREFS, type SoundPrefs } from '../audio/kinds';
import type { AchievementState } from '../profile/achievementTypes';
import type { ActivityEvent, Profile } from '../profile/types';
import type { GameReview } from '../review/types';
import type { DailyRecord } from '../puzzles/daily';
import type { LearningPosition } from '../puzzles/learn';
import type { AcademyRecord } from '../academy/types';
import type { NotebookEntry } from '../notebook/types';
import { DEFAULT_TRAINER_PREFS, type TrainerPrefs } from '../trainer/types';
import type { RushScore } from '../puzzles/rush';
import type { PuzzlePack } from '../puzzles/types';

export type ThemeChoice = 'system' | 'dark' | 'light';
export type BoardTheme = 'walnut' | 'slate' | 'moss' | 'midnight' | 'graphite' | 'ember';
export const BOARD_THEMES: readonly BoardTheme[] = ['walnut', 'slate', 'moss', 'midnight', 'graphite', 'ember'];

export interface Settings {
  theme: ThemeChoice;
  boardTheme: BoardTheme;
  /** Sound preferences (master, categories, volumes). The old format was a single boolean. */
  sound: SoundPrefs;
  showLegalMoves: boolean;
  showEvalBar: boolean;
  /** A tiny vibration when a piece moves (phones that allow it). Missing on older saves = on. */
  haptics: boolean;
  /** Last-used bot setup, so "quick play" remembers it. */
  bot: { level: string; personality: string; color: 'white' | 'black' | 'random' };
  /** Mistake Notebook preferences. Missing on older saves = defaults. */
  notebook: { autoSave: boolean };
  /** Play with Trainer preferences, including spoken coaching. */
  trainer: TrainerPrefs;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  boardTheme: 'walnut',
  sound: DEFAULT_SOUND_PREFS,
  showLegalMoves: true,
  showEvalBar: false,
  haptics: true,
  bot: { level: 'r400', personality: 'balanced', color: 'white' },
  notebook: { autoSave: true },
  trainer: DEFAULT_TRAINER_PREFS,
};

export interface SavedGame {
  id: string;
  createdAt: number;
  white: string;
  black: string;
  /** Which side the human played, or null for imported games. */
  human: 'white' | 'black' | null;
  botLevel: string | null;
  botPersonality: string | null;
  startFen: string;
  uciMoves: string[];
  result: GameResult;
  /** Reason the game ended, when known (e.g. "checkmate", "resignation"). */
  reason: string | null;
  source: 'played' | 'imported';
  /** How many times the player took a move back. Games with take-backs are not rated. Missing on older saves = 0. */
  takebacks?: number;
  /** 'trainer' for games played with the Trainer: always unranked, kept as practice. Missing on older saves = a normal game. */
  mode?: 'normal' | 'trainer';
}

/** The game in progress, restored after a reload. */
export interface CurrentGame {
  startFen: string;
  uciMoves: string[];
  human: 'white' | 'black';
  botLevel: string;
  botPersonality: string;
  resigned: 'white' | 'black' | null;
  /** Take-backs used so far; kept across reloads so a reload cannot hide them. */
  takebacks: number;
  /** 'trainer' when the game was started with the Trainer. */
  mode?: 'normal' | 'trainer';
  updatedAt: number;
}

export const BACKUP_VERSION = 3;

export interface BackupFile {
  app: 'MoveWise';
  /** 2 added `profile` and `activity`; 3 added `achievements`. Versions 1 and 2 are still accepted on import. */
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  settings: Settings;
  games: SavedGame[];
  currentGame: CurrentGame | null;
  profile: Profile | null;
  activity: ActivityEvent[];
  /** Stored achievement unlocks (their timestamps), or null if never set up. */
  achievements: AchievementState | null;
  /**
   * Stored Game Reviews (added after version 3 shipped, so the field is optional: older files simply have none, and
   * older apps ignore it). Reviews are derived data; a malformed one is dropped on import instead of failing the file.
   */
  reviews?: GameReview[];
  /**
   * Puzzle training data other than the attempts themselves (those are `activity` records): daily puzzle history, Rush high
   * scores, packs the player installed (the bundled starter pack is part of the app and is not exported) and exercises made
   * from the player's own games. Optional, like `reviews`: older files have none and older apps ignore it.
   */
  puzzles?: PuzzleData;
  /**
   * Academy progress (lesson, assessment and meta records). Optional like `reviews` and `puzzles`: older files have none and
   * older apps ignore it. On import each record is merged by `updatedAt`, so importing never loses newer local progress.
   */
  academy?: AcademyRecord[];
  /**
   * Mistake Notebook entries (added in v0.8). Optional like the other late additions: older files have none and older apps ignore
   * it. On import each entry is merged by `updatedAt`.
   */
  notebook?: NotebookEntry[];
}

export interface PuzzleData {
  daily: DailyRecord[];
  rush: RushScore[];
  packs: PuzzlePack[];
  positions: LearningPosition[];
}
export const EMPTY_PUZZLE_DATA: PuzzleData = { daily: [], rush: [], packs: [], positions: [] };

export interface Store {
  /** False when running on the in-memory fallback (data is lost on reload). */
  readonly persistent: boolean;
  getSettings(): Promise<Settings>;
  putSettings(s: Settings): Promise<void>;
  listGames(): Promise<SavedGame[]>;
  getGame(id: string): Promise<SavedGame | undefined>;
  putGame(g: SavedGame): Promise<void>;
  /** Deletes the game together with its Game Review, that review's Profile record and the practice positions made from it. */
  deleteGame(id: string): Promise<void>;
  getCurrentGame(): Promise<CurrentGame | null>;
  putCurrentGame(g: CurrentGame | null): Promise<void>;
  getProfile(): Promise<Profile | null>;
  putProfile(p: Profile): Promise<void>;
  /** Puzzle / lesson / review records (written by features that are not built yet). */
  listActivity(): Promise<ActivityEvent[]>;
  addActivity(e: ActivityEvent): Promise<void>;
  /** Permanent record of unlocked achievements (progress itself is always recomputed from games). */
  /** Game Reviews (see src/review). One per game; saving again replaces it. */
  getReview(gameId: string): Promise<GameReview | undefined>;
  listReviews(): Promise<GameReview[]>;
  putReview(r: GameReview): Promise<void>;
  /** Removes a game's review and its Profile record; the game itself is kept. */
  deleteReview(gameId: string): Promise<void>;
  deleteActivity(id: string): Promise<void>;
  /** Puzzle trainer data (see PuzzleData). */
  listDaily(): Promise<DailyRecord[]>;
  getDaily(date: string): Promise<DailyRecord | undefined>;
  putDaily(r: DailyRecord): Promise<void>;
  listRush(): Promise<RushScore[]>;
  putRush(s: RushScore): Promise<void>;
  listPacks(): Promise<PuzzlePack[]>;
  putPack(p: PuzzlePack): Promise<void>;
  deletePack(id: string): Promise<void>;
  listLearning(): Promise<LearningPosition[]>;
  getLearning(id: string): Promise<LearningPosition | undefined>;
  putLearning(l: LearningPosition): Promise<void>;
  deleteLearning(id: string): Promise<void>;
  /** Academy progress records (see src/academy). Keyed by record id. */
  listAcademy(): Promise<AcademyRecord[]>;
  putAcademy(r: AcademyRecord): Promise<void>;
  /** Mistake Notebook entries (see src/notebook). They are independent of games: deleting a game never deletes them. */
  listNotebook(): Promise<NotebookEntry[]>;
  getNotebook(id: string): Promise<NotebookEntry | undefined>;
  putNotebook(e: NotebookEntry): Promise<void>;
  deleteNotebook(id: string): Promise<void>;
  getAchievements(): Promise<AchievementState | null>;
  putAchievements(s: AchievementState): Promise<void>;
  exportAll(): Promise<BackupFile>;
  importAll(file: unknown): Promise<{ games: number; activity: number; achievements: number }>;
  clearAll(): Promise<void>;
}
