/**
 * The daily puzzle. One per local calendar day, chosen deterministically from the installed collection, so it needs no
 * network and is the same on every reload. The first time a day's puzzle is requested the choice is stored (see the
 * `puzzleDaily` store); later requests, even after the rating changed or packs were installed, return the stored choice.
 */
import { hashString } from './select';
import type { Puzzle } from './types';

export interface DailyRecord {
  /** Local date, YYYY-MM-DD. */
  date: string;
  puzzleId: string;
  /** Puzzle rating of the player when the choice was made (the difficulty target). */
  targetRating: number;
  pickedAt: number;
  /** When it was first completed (solved), if it was. */
  solvedAt?: number;
  /** True if the first attempt that day was a clean solve. */
  clean?: boolean;
}

/** Local calendar date (not UTC) as YYYY-MM-DD. */
export function localDateKey(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Deterministic choice for a date: puzzles within 250 points of the target (widening if there are too few). */
export function pickDaily(date: string, puzzles: readonly Puzzle[], targetRating: number, avoid: ReadonlySet<string> = new Set()): Puzzle | null {
  if (!puzzles.length) return null;
  const sorted = [...puzzles].sort((a, b) => (a.id < b.id ? -1 : 1));
  let width = 250;
  let pool: Puzzle[] = [];
  while (width <= 4000) {
    pool = sorted.filter((p) => Math.abs(p.rating - targetRating) <= width && !avoid.has(p.id));
    if (pool.length >= 12) break;
    width += 250;
  }
  if (!pool.length) pool = sorted;
  return pool[hashString(`movewise-daily:${date}`) % pool.length] ?? null;
}

/** Consecutive days up to `today` on which the daily puzzle was solved. */
export function dailyStreak(records: readonly DailyRecord[], today: string): number {
  const solved = new Set(records.filter((r) => r.solvedAt !== undefined).map((r) => r.date));
  let streak = 0;
  const d = new Date(today + 'T12:00:00');
  if (!solved.has(today)) d.setDate(d.getDate() - 1); // today may still be open
  for (;;) {
    const key = localDateKey(d.getTime());
    if (!solved.has(key)) return streak;
    streak++;
    d.setDate(d.getDate() - 1);
  }
}
