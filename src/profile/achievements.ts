/**
 * The achievement engine: a registry of definitions, pure evaluation from saved data, and idempotent syncing of
 * unlocks into a small persisted record. See achievementDefs.ts for the actual achievements and their rules.
 *
 *  - Progress is always recomputed from real saved games / activity, never stored, so it cannot drift or be faked.
 *  - Unlocks ARE stored (id + the time of the qualifying event). Once stored they are permanent: deleting a game,
 *    restarting the rating or changing time zone never takes one away, and the same unlock can never fire twice.
 *  - Future features register more definitions with `registerAchievements`; nothing here needs to change.
 */
import { CORE_ACHIEVEMENTS } from './achievementDefs';
import type { Achievement, AchievementContext, AchievementDef, AchievementRecord, AchievementState, DerivedContext } from './achievementTypes';
import { ACADEMY_SHAPE, CURRICULUM, FEATURES, FEATURE_NAMES } from './features';

export type { Achievement, AchievementCategory, AchievementContext, AchievementDef, AchievementRecord, AchievementState, Motif, Rarity } from './achievementTypes';
export { CATEGORIES } from './achievementTypes';

/* -------------------------------- registry -------------------------------- */

const registry: AchievementDef[] = [...CORE_ACHIEVEMENTS];

export const getAchievementDefs = (): readonly AchievementDef[] => registry;

/**
 * Add achievements (for a feature that did not exist before). Ids must be unique and stable forever.
 * Returns a function that removes them again (used by tests).
 */
export function registerAchievements(defs: AchievementDef[]): () => void {
  for (const d of defs) {
    if (registry.some((r) => r.id === d.id) || defs.filter((x) => x.id === d.id).length > 1) throw new Error(`Duplicate achievement id: ${d.id}`);
  }
  registry.push(...defs);
  return () => {
    for (const d of defs) {
      const i = registry.indexOf(d);
      if (i >= 0) registry.splice(i, 1);
    }
  };
}

/* ------------------------------- evaluation ------------------------------- */

const derive = (c: AchievementContext): DerivedContext => ({ ...c, features: c.features ?? FEATURES, curriculum: c.curriculum ?? CURRICULUM, academy: c.academy ?? ACADEMY_SHAPE });

/**
 * Every achievement with its current progress. `stored` (if given) makes earlier unlocks permanent: a stored
 * unlock shows as earned with its recorded time even if the data that earned it is gone.
 */
export function evaluateAchievements(c: AchievementContext, stored?: AchievementState | null): Achievement[] {
  const d = derive(c);
  const have = new Map((stored?.unlocked ?? []).map((r) => [r.id, r]));
  return registry.map((def): Achievement => {
    const available = !def.requires || d.features[def.requires];
    const ev = available ? def.evaluate(d) : { current: 0, target: 1, at: null };
    const rec = have.get(def.id);
    const earned = rec !== undefined || (available && ev.at !== null);
    const span = ev.target - (ev.from ?? 0);
    const pct = earned ? 1 : span > 0 ? Math.min(1, Math.max(0, (ev.current - (ev.from ?? 0)) / span)) : 0;
    return {
      id: def.id,
      category: def.category,
      title: def.title,
      description: def.description,
      condition: def.condition,
      icon: def.icon,
      rarity: def.rarity,
      requires: def.requires,
      available: available || earned,
      unavailableReason: available || earned ? undefined : `${FEATURE_NAMES[def.requires!]} are not built yet.`.replace('Game Review are', 'Game Review is'),
      earned,
      earnedAt: rec?.unlockedAt ?? (earned ? ev.at : null),
      progress: { current: earned ? ev.target : ev.current, target: ev.target, unit: ev.unit, pct, detail: earned ? undefined : ev.detail },
    };
  });
}

/** Achievements earned in `after` that were not earned in `before`. */
export function newlyEarned(before: Achievement[], after: Achievement[]): Achievement[] {
  const had = new Set(before.filter((a) => a.earned).map((a) => a.id));
  return after.filter((a) => a.earned && !had.has(a.id));
}

/* --------------------------------- syncing -------------------------------- */

export interface SyncResult {
  state: AchievementState;
  /** Unlocks recorded by this call. Empty if everything was already stored (idempotent). */
  newlyUnlocked: Achievement[];
  /** True the first time achievements are set up on a device: existing history is recorded silently. */
  firstRun: boolean;
  /** False when nothing needs writing. */
  changed: boolean;
}

/** Collapse duplicate ids, keeping the earliest unlock, and sort for stable output. */
export function normaliseState(s: AchievementState): AchievementState {
  const best = new Map<string, AchievementRecord>();
  for (const r of s.unlocked) {
    const prev = best.get(r.id);
    if (!prev || r.unlockedAt < prev.unlockedAt) best.set(r.id, r);
  }
  return { ...s, unlocked: [...best.values()].sort((a, b) => a.unlockedAt - b.unlockedAt || a.id.localeCompare(b.id)) };
}

/** Union of two stored states (used when importing a backup): an unlock in either one is kept, at its earliest time. */
export function mergeAchievementStates(a: AchievementState | null, b: AchievementState | null): AchievementState | null {
  if (!a) return b ? normaliseState(b) : null;
  if (!b) return normaliseState(a);
  return normaliseState({ version: 1, initialisedAt: Math.min(a.initialisedAt, b.initialisedAt), unlocked: [...a.unlocked, ...b.unlocked] });
}

/**
 * Record any achievement the data says is earned and that is not stored yet. Pure and idempotent: calling it twice
 * with the same data returns no new unlocks the second time. Unlocks are never removed.
 */
export function syncAchievements(prev: AchievementState | null, ctx: AchievementContext, now: number): SyncResult {
  const base = normaliseState(prev ?? { version: 1, initialisedAt: now, unlocked: [] });
  const have = new Set(base.unlocked.map((r) => r.id));
  const status = evaluateAchievements(ctx, base);
  const fresh = status.filter((a) => a.earned && !have.has(a.id));
  const unlocked = [...base.unlocked, ...fresh.map((a): AchievementRecord => ({ id: a.id, unlockedAt: a.earnedAt ?? now, recordedAt: now }))];
  const state = normaliseState({ ...base, unlocked });
  return {
    state,
    newlyUnlocked: fresh,
    firstRun: prev === null,
    changed: prev === null || fresh.length > 0 || state.unlocked.length !== (prev?.unlocked.length ?? 0),
  };
}
