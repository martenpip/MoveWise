/**
 * Choosing the next puzzle. All selection is a weighted random draw with an injectable random source, so it is testable and,
 * for the daily puzzle, deterministic.
 *
 * Weight of a puzzle = rating fit × novelty × theme need.
 *  - rating fit: a bell curve around the target rating (the player's puzzle rating, a little lower for weak themes and higher
 *    for mastered ones). Beginners are not handed puzzles far above them and strong players are not handed trivial ones.
 *  - novelty: never-seen puzzles first; ones already solved cleanly are strongly avoided; failed ones may return after a pause.
 *  - theme need: weak themes ×3, themes still being learned ×1.5, unexplored themes ×1.5 (to find out where you stand),
 *    mastered themes ×0.25 (occasional review so the knowledge is kept) and ×1 again if not seen for 21 days.
 */
import type { PuzzleEvent } from '../profile/types';
import { isClean, levelOf, themeSkills, type SkillLevel, type ThemeSkill } from './skills';
import { TRACKED, primaryTheme } from './themes';
import type { Puzzle } from './types';

export type Rng = () => number;
/** Small seeded generator (mulberry32). */
export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export type TrainMode = 'practice' | 'theme' | 'weakness' | 'mixed' | 'review';

export interface Context {
  /** All installed puzzles. */
  puzzles: readonly Puzzle[];
  events: readonly PuzzleEvent[];
  /** Current puzzle rating (the training target). */
  rating: number;
  now: number;
  rng: Rng;
  /** Puzzle ids to avoid right now (for example the one just played). */
  exclude?: ReadonlySet<string>;
}

const DAY = 86_400_000;
const NEED: Record<SkillLevel, number> = { weak: 3, learning: 1.5, unknown: 1.5, mastered: 0.25 };
const OFFSET: Record<SkillLevel, number> = { weak: -150, learning: -50, unknown: -100, mastered: 100 };

export const trackedThemes = (p: Puzzle): string[] => p.themes.filter((t) => TRACKED.has(t));

function history(events: readonly PuzzleEvent[]): Map<string, PuzzleEvent[]> {
  const m = new Map<string, PuzzleEvent[]>();
  for (const e of [...events].sort((a, b) => a.at - b.at)) m.set(e.puzzleId, [...(m.get(e.puzzleId) ?? []), e]);
  return m;
}

function novelty(h: PuzzleEvent[] | undefined, now: number): number {
  if (!h?.length) return 1;
  const last = h[h.length - 1]!;
  if (isClean(last)) return 0.03;
  return now - last.at > DAY ? 0.6 : 0.05; // an unsolved puzzle may come back, but not straight away
}

interface Scored { puzzle: Puzzle; weight: number }

export function scorePuzzles(ctx: Context, subset: readonly Puzzle[], skills: Map<string, ThemeSkill>, themeBias?: (theme: string) => number): Scored[] {
  const hist = history(ctx.events);
  return subset.map((p) => {
    const themes = trackedThemes(p);
    // The puzzle's need is that of its neediest theme; its target rating follows the same theme.
    let need = 1, offset = 0, bestNeed = -1;
    for (const t of themes) {
      const lvl = levelOf(skills, t);
      const sk = skills.get(t);
      let n = NEED[lvl];
      if (lvl === 'mastered' && sk && ctx.now - sk.lastAt > 21 * DAY) n = 1;
      n *= themeBias?.(t) ?? 1;
      if (n > bestNeed) { bestNeed = n; need = n; offset = OFFSET[lvl]; }
    }
    const target = ctx.rating + offset;
    const fit = Math.exp(-Math.pow((p.rating - target) / 220, 2) / 2);
    const nov = novelty(hist.get(p.id), ctx.now);
    return { puzzle: p, weight: need * fit * nov + 1e-9 };
  });
}

export function pickWeighted(items: readonly Scored[], rng: Rng): Puzzle | null {
  const total = items.reduce((a, s) => a + s.weight, 0);
  if (!items.length || !(total > 0)) return null;
  let r = rng() * total;
  for (const s of items) {
    r -= s.weight;
    if (r <= 0) return s.puzzle;
  }
  return items[items.length - 1]!.puzzle;
}

export interface Pick {
  puzzle: Puzzle;
  /** Why this puzzle was chosen, shown to the player in plain words. */
  why: string;
}

/** Puzzles whose latest attempt was not a clean solve ("review incorrect puzzles"). Oldest-failed first. */
export function incorrectPuzzles(ctx: Context): Puzzle[] {
  const hist = history(ctx.events);
  const byId = new Map(ctx.puzzles.map((p) => [p.id, p]));
  const out: { p: Puzzle; at: number }[] = [];
  for (const [id, h] of hist) {
    const p = byId.get(id);
    const last = h[h.length - 1]!;
    if (p && !isClean(last) && last.mode !== 'rush') out.push({ p, at: last.at });
  }
  return out.sort((a, b) => a.at - b.at).map((x) => x.p);
}

export function nextPuzzle(mode: TrainMode, ctx: Context, opts: { theme?: string } = {}): Pick | null {
  const skills = themeSkills(ctx.events);
  const pool = ctx.puzzles.filter((p) => !ctx.exclude?.has(p.id));
  if (mode === 'review') {
    const list = incorrectPuzzles({ ...ctx, puzzles: pool });
    if (!list.length) return null;
    return { puzzle: list[0]!, why: 'You did not solve this one cleanly last time. Can you now?' };
  }
  if (mode === 'theme') {
    const t = opts.theme;
    const subset = pool.filter((p) => t && p.themes.includes(t));
    const pick = pickWeighted(scorePuzzles(ctx, subset, skills, (x) => (x === t ? 1 : 0.2)), ctx.rng);
    return pick ? { puzzle: pick, why: `Theme training: ${t}.` } : null;
  }
  if (mode === 'weakness') {
    const weak = [...skills.values()].filter((s) => s.level === 'weak' || s.level === 'learning').sort((a, b) => a.weighted - b.weighted);
    if (!weak.length) {
      const pick = pickWeighted(scorePuzzles(ctx, pool, skills), ctx.rng);
      return pick ? { puzzle: pick, why: 'Not enough results yet to find a weak theme, so this is a mixed puzzle.' } : null;
    }
    const target = new Set(weak.slice(0, 3).map((s) => s.theme));
    const subset = pool.filter((p) => p.themes.some((t) => target.has(t)));
    const pick = pickWeighted(scorePuzzles(ctx, subset, skills, (x) => (target.has(x) ? 2 : 0.1)), ctx.rng);
    return pick ? { puzzle: pick, why: `Weakness training: ${[...target].join(', ')}.` } : null;
  }
  // Mixed practice ignores themes entirely (only rating fit and novelty), so no theme is favoured.
  const pick = pickWeighted(scorePuzzles(ctx, pool, mode === 'mixed' ? new Map() : skills), ctx.rng);
  if (!pick) return null;
  const prim = primaryTheme(pick.themes);
  const lvl = prim ? levelOf(skills, prim) : 'unknown';
  const why = mode === 'mixed' ? 'A mixed puzzle: you are not told the theme before you solve it.' : lvl === 'weak' ? 'Chosen because this kind of puzzle has been difficult for you.' : lvl === 'mastered' ? 'A short review of a theme you have mastered.' : 'Chosen for your current puzzle rating.';
  return { puzzle: pick, why };
}
