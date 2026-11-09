/** Shared shapes for the achievement system (kept free of logic so definitions, engine, storage and UI can all import them). */
import type { ActivityEvent } from './types';
import type { AcademyShape, Curriculum, Feature, FeatureFlags } from './features';
import type { RatingSummary } from './rating';
import type { SavedGame } from '../storage/types';

export type AchievementCategory = 'start' | 'winning' | 'tactics' | 'learning' | 'improvement' | 'consistency';

export const CATEGORIES: Array<{ id: AchievementCategory; title: string; blurb: string }> = [
  { id: 'start', title: 'Getting started', blurb: 'First steps and games played.' },
  { id: 'winning', title: 'Winning', blurb: 'Results against the bots.' },
  { id: 'tactics', title: 'Tactics', blurb: 'Puzzle solving.' },
  { id: 'learning', title: 'Learning', blurb: 'Lessons and the curriculum.' },
  { id: 'improvement', title: 'Improvement', blurb: 'Lasting growth, not lucky swings.' },
  { id: 'consistency', title: 'Consistency', blurb: 'Showing up day after day.' },
];

/** How special an achievement is. Only "rare" gets the fuller sound and a little confetti. */
export type Rarity = 'common' | 'uncommon' | 'rare';

/** Badge artwork: a chess piece, or one of the drawn symbols. */
export type Motif =
  | 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king'
  | 'flame' | 'bolt' | 'target' | 'book' | 'puzzle' | 'star' | 'trend' | 'crown' | 'calendar' | 'trophy'
  | 'mortarboard' | 'fork' | 'pin' | 'arrowup' | 'flag' | 'check';

/** Everything an achievement may look at. Always built from real saved data. */
export interface AchievementContext {
  games: SavedGame[];
  activity: ActivityEvent[];
  rating: RatingSummary;
  /** Which features exist. Defaults to the real FEATURES flags. Tests pass their own. */
  features?: FeatureFlags;
  curriculum?: Curriculum;
  /** Academy structure, for chapter / course achievements. Defaults to the real curriculum. */
  academy?: AcademyShape;
}

/** How far along an achievement is, and (if satisfied) when it first became true. */
export interface Evaluation {
  current: number;
  target: number;
  unit?: string;
  /** Baseline for the percentage (e.g. the starting rating). Default 0. */
  from?: number;
  /** When the condition was first met: the time of the real event that met it. Null if not met. */
  at: number | null;
  /** Extra honest context for the progress line, e.g. "Current losing streak: 2". */
  detail?: string;
}

export interface AchievementDef {
  /** Stable forever: stored unlocks refer to it. */
  id: string;
  category: AchievementCategory;
  title: string;
  /** What it means, in a sentence. */
  description: string;
  /** The exact rule, so there is never any doubt why something did or did not unlock. */
  condition: string;
  icon: Motif;
  rarity: Rarity;
  /** Inactive until this feature exists in the app. */
  requires?: Feature;
  evaluate(c: DerivedContext): Evaluation;
}

/** Context plus the pieces most definitions need, computed once per evaluation. */
export interface DerivedContext extends AchievementContext {
  features: FeatureFlags;
  curriculum: Curriculum;
  academy: AcademyShape;
}

export interface Achievement {
  id: string;
  category: AchievementCategory;
  title: string;
  description: string;
  condition: string;
  icon: Motif;
  rarity: Rarity;
  requires?: Feature;
  /** False when the feature that would earn it does not exist in this build. */
  available: boolean;
  unavailableReason?: string;
  earned: boolean;
  /** When it was earned (ms): the time of the qualifying event, as first recorded. */
  earnedAt: number | null;
  progress: { current: number; target: number; unit?: string; pct: number; detail?: string };
}

/** A stored unlock. Written once, never changed, never removed by deleting games. */
export interface AchievementRecord {
  id: string;
  /** When the qualifying event happened (e.g. the game that completed the goal). */
  unlockedAt: number;
  /** When MoveWise noticed and stored it. */
  recordedAt: number;
}

export interface AchievementState {
  version: 1;
  /** When achievements were first set up on this device. Unlocks found in existing history at that moment are silent. */
  initialisedAt: number;
  unlocked: AchievementRecord[];
}
