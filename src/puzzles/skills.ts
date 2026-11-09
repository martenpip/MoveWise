/**
 * The adaptive model: how well the player handles each tactical theme, and how sure that estimate is.
 *
 * For every theme a puzzle carries, each attempt is a result: "clean" (solved with no hint, no wrong move and without looking
 * at the solution) or not. Results are weighted so recent ones count more (a half-life of 12 attempts in that theme), and a
 * Wilson score interval turns them into a range, so three lucky solves can never look like mastery.
 *
 *  - `unknown`   fewer than 5 attempts: no judgement; the trainer explores the theme.
 *  - `weak`      at least 5 attempts and the upper end of the range is below 65%.
 *  - `learning`  everything in between.
 *  - `mastered`  at least 10 attempts, the lower end of the range is at least 70%, you succeeded on at least 3 different days
 *                and the latest 5 attempts were mostly clean (at least 4 of 5). A good streak alone is not mastery.
 * Rush attempts and positions from your own games are included as evidence of skill; only the RATING ignores them.
 */
import type { PuzzleEvent } from '../profile/types';
import { TRACKED } from './themes';

export type SkillLevel = 'unknown' | 'weak' | 'learning' | 'mastered';

export interface ThemeSkill {
  theme: string;
  attempts: number;
  clean: number;
  /** Recency-weighted success rate, 0..1. */
  weighted: number;
  low: number;
  high: number;
  level: SkillLevel;
  /** Latest attempt time, ms. */
  lastAt: number;
  /** A strong recent run that does not (yet) meet the bar for mastery. */
  hotStreak: boolean;
  days: number;
}

export const HALF_LIFE = 12;
export const MIN_ATTEMPTS = 5;
export const MASTERY_ATTEMPTS = 10;

export const isClean = (e: Pick<PuzzleEvent, 'solved' | 'hintsUsed' | 'wrongMoves' | 'usedSolution'>): boolean =>
  e.solved && e.hintsUsed === 0 && !(e.wrongMoves ?? 0) && !e.usedSolution;

/** Wilson score interval (z = 1.28, an 80% interval) for a proportion with weights. */
export function wilson(successes: number, n: number, z = 1.28): { low: number; high: number } {
  if (n <= 0) return { low: 0, high: 1 };
  const p = successes / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { low: Math.max(0, (c - m) / d), high: Math.min(1, (c + m) / d) };
}

const dayKey = (t: number): string => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

export function themeSkills(events: readonly PuzzleEvent[]): Map<string, ThemeSkill> {
  const by = new Map<string, PuzzleEvent[]>();
  for (const e of [...events].sort((a, b) => a.at - b.at)) {
    for (const t of new Set(e.themes)) if (TRACKED.has(t)) by.set(t, [...(by.get(t) ?? []), e]);
  }
  const out = new Map<string, ThemeSkill>();
  for (const [theme, list] of by) {
    const n = list.length;
    let wSum = 0, wClean = 0, w2 = 0;
    list.forEach((e, i) => {
      const w = Math.pow(0.5, (n - 1 - i) / HALF_LIFE);
      wSum += w;
      w2 += w * w;
      if (isClean(e)) wClean += w;
    });
    const clean = list.filter(isClean).length;
    // Kish effective sample size: old results fade, so the interval widens a little instead of pretending to know more.
    const nEff = Math.max(1, (wSum * wSum) / w2);
    const { low, high } = wilson((wClean / wSum) * nEff, nEff);
    const recent = list.slice(-5);
    const recentClean = recent.filter(isClean).length;
    const days = new Set(list.filter(isClean).map((e) => dayKey(e.at))).size;
    const mastered = n >= MASTERY_ATTEMPTS && low >= 0.7 && days >= 3 && recent.length >= 5 && recentClean >= 4;
    const level: SkillLevel = n < MIN_ATTEMPTS ? 'unknown' : mastered ? 'mastered' : high < 0.65 ? 'weak' : 'learning';
    out.set(theme, {
      theme, attempts: n, clean, weighted: wClean / wSum, low, high, level,
      lastAt: list[list.length - 1]!.at,
      hotStreak: !mastered && recent.length >= 5 && recentClean === 5,
      days,
    });
  }
  return out;
}

export const levelOf = (m: Map<string, ThemeSkill>, theme: string): SkillLevel => m.get(theme)?.level ?? 'unknown';
