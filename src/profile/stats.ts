/**
 * Game statistics computed from saved games. Every number here is derived from real finished games against
 * MoveWise bots; nothing is estimated or stored separately. Functions take `now` explicitly so they are testable.
 */
import { identifyOpening } from './openings';
import { outcomeOf, type Outcome } from './rating';
import type { SavedGame } from '../storage/types';

export type Period = '7d' | '30d' | '90d' | 'all';
export const PERIODS: Array<{ id: Period; label: string; days: number | null }> = [
  { id: '7d', label: '7 days', days: 7 },
  { id: '30d', label: '30 days', days: 30 },
  { id: '90d', label: '90 days', days: 90 },
  { id: 'all', label: 'All time', days: null },
];
const DAY = 86_400_000;

export interface FinishedGame {
  game: SavedGame;
  outcome: Outcome;
  color: 'white' | 'black';
  /** Half-moves played. */
  plies: number;
}

/** Finished games the player played against a bot in MoveWise (not imported games). */
export function finishedGames(games: SavedGame[]): FinishedGame[] {
  const out: FinishedGame[] = [];
  for (const g of games) {
    if (g.source !== 'played' || !g.human) continue;
    const outcome = outcomeOf(g);
    if (!outcome) continue;
    out.push({ game: g, outcome, color: g.human, plies: g.uciMoves.length });
  }
  return out.sort((a, b) => a.game.createdAt - b.game.createdAt || a.game.id.localeCompare(b.game.id));
}

export function inPeriod(games: FinishedGame[], period: Period, now: number): FinishedGame[] {
  const days = PERIODS.find((p) => p.id === period)?.days ?? null;
  if (days === null) return games;
  const from = now - days * DAY;
  return games.filter((g) => g.game.createdAt >= from);
}

export interface Record3 {
  n: number;
  wins: number;
  draws: number;
  losses: number;
  /** Wins / games, or null with no games. */
  winRate: number | null;
  /** (wins + draws/2) / games, or null with no games. */
  score: number | null;
}

export function tally(games: FinishedGame[]): Record3 {
  let wins = 0, draws = 0, losses = 0;
  for (const g of games) {
    if (g.outcome === 'win') wins++;
    else if (g.outcome === 'draw') draws++;
    else losses++;
  }
  const n = games.length;
  return { n, wins, draws, losses, winRate: n ? wins / n : null, score: n ? (wins + draws / 2) / n : null };
}

export interface Streaks {
  currentWin: number;
  bestWin: number;
  currentLoss: number;
  worstLoss: number;
}

/** Streaks over games in chronological order. A draw ends both a winning and a losing streak. */
export function streaks(games: FinishedGame[]): Streaks {
  let w = 0, l = 0, bestW = 0, worstL = 0;
  for (const g of games) {
    if (g.outcome === 'win') { w++; l = 0; } else if (g.outcome === 'loss') { l++; w = 0; } else { w = 0; l = 0; }
    bestW = Math.max(bestW, w);
    worstL = Math.max(worstL, l);
  }
  return { currentWin: w, bestWin: bestW, currentLoss: l, worstLoss: worstL };
}

export interface GroupRow extends Record3 {
  key: string;
}

export function groupBy(games: FinishedGame[], keyOf: (g: FinishedGame) => string | null): GroupRow[] {
  const map = new Map<string, FinishedGame[]>();
  for (const g of games) {
    const k = keyOf(g);
    if (k === null) continue;
    (map.get(k) ?? map.set(k, []).get(k)!).push(g);
  }
  return [...map.entries()].map(([key, gs]) => ({ key, ...tally(gs) }));
}

export interface OpeningRow extends GroupRow {
  /** True when this is how the player started (as White) or the system they faced/chose as Black. */
  color: 'white' | 'black';
}

/** Openings by colour. Games that match nothing in the opening table are counted separately. */
export function openingStats(games: FinishedGame[]): { white: GroupRow[]; black: GroupRow[]; unrecognised: number } {
  const white: FinishedGame[] = [];
  const black: FinishedGame[] = [];
  const names = new Map<string, string>();
  let unrecognised = 0;
  for (const g of games) {
    const line = identifyOpening(g.game.startFen, g.game.uciMoves);
    if (!line) { unrecognised++; continue; }
    names.set(g.game.id, line.name);
    (g.color === 'white' ? white : black).push(g);
  }
  const rows = (gs: FinishedGame[]) =>
    groupBy(gs, (g) => names.get(g.game.id) ?? null).sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
  return { white: rows(white), black: rows(black), unrecognised };
}

export interface Bucket {
  /** Start of the bucket (ms). */
  start: number;
  label: string;
  wins: number;
  draws: number;
  losses: number;
}

const startOfDay = (t: number): number => {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};
const startOfWeek = (t: number): number => {
  const s = startOfDay(t);
  const dow = (new Date(s).getDay() + 6) % 7; // Monday = 0
  return startOfDay(s - dow * DAY);
};
const fmtDay = (t: number): string => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** Results over time: daily for ≤30 days, weekly beyond. Only buckets that contain games are returned. */
export function resultsOverTime(games: FinishedGame[], period: Period): Bucket[] {
  const weekly = period === '90d' || period === 'all';
  const map = new Map<number, Bucket>();
  for (const g of games) {
    const start = weekly ? startOfWeek(g.game.createdAt) : startOfDay(g.game.createdAt);
    const b = map.get(start) ?? { start, label: weekly ? `Week of ${fmtDay(start)}` : fmtDay(start), wins: 0, draws: 0, losses: 0 };
    if (g.outcome === 'win') b.wins++;
    else if (g.outcome === 'draw') b.draws++;
    else b.losses++;
    map.set(start, b);
  }
  return [...map.values()].sort((a, b) => a.start - b.start);
}

export function averageMoves(games: FinishedGame[]): number | null {
  if (!games.length) return null;
  return games.reduce((a, g) => a + Math.ceil(g.plies / 2), 0) / games.length;
}

/** Local calendar-day key (YYYY-MM-DD). */
export function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Whole-day number of the LOCAL calendar date of a timestamp. Built from the local year/month/day and counted in
 * UTC days, so consecutive calendar days always differ by exactly 1, even across daylight-saving changes and for
 * time zones far from UTC. (Dividing local-midnight timestamps by 24 h can be off by one in those cases.)
 */
export function dayIndex(t: number): number {
  const d = new Date(t);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
}

/** Consecutive-day activity streaks from a set of timestamps. `current` counts today (or yesterday, so an unfinished day does not break it). */
export function dayStreaks(timestamps: number[], now: number): { current: number; best: number; activeDays: number } {
  const days = [...new Set(timestamps.map(dayKey))].sort();
  if (!days.length) return { current: 0, best: 0, activeDays: 0 };
  const toIndex = (k: string) => {
    const [y, m, d] = k.split('-').map(Number);
    return Math.round(Date.UTC(y!, m! - 1, d!) / DAY);
  };
  const idx = days.map(toIndex);
  let best = 1, run = 1;
  for (let i = 1; i < idx.length; i++) {
    run = idx[i]! - idx[i - 1]! === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  // current run ending today or yesterday
  const today = toIndex(dayKey(now));
  const last = idx[idx.length - 1]!;
  let current = 0;
  if (today - last <= 1) {
    current = 1;
    for (let i = idx.length - 1; i > 0 && idx[i]! - idx[i - 1]! === 1; i--) current++;
  }
  return { current, best, activeDays: days.length };
}

/** Timestamp (start of day) of the day a consecutive-day streak first reached `length`, or null if it never did. */
export function firstStreakReached(timestamps: number[], length: number): number | null {
  const starts = [...new Set(timestamps.map((t) => startOfDay(t)))].sort((a, b) => a - b);
  let run = 0;
  for (let i = 0; i < starts.length; i++) {
    run = i > 0 && dayIndex(starts[i]!) - dayIndex(starts[i - 1]!) === 1 ? run + 1 : 1;
    if (run >= length) return starts[i]!;
  }
  return null;
}

/**
 * When a consecutive-day streak first reached `length`: the time of the last activity on that day (so the unlock
 * time is a real moment something happened), or null. Also reports the longest run so far, for progress display.
 */
export function streakReached(timestamps: number[], length: number): { at: number | null; best: number } {
  const byDay = new Map<number, number>();
  for (const t of timestamps) {
    const i = dayIndex(t);
    byDay.set(i, Math.max(byDay.get(i) ?? 0, t));
  }
  const days = [...byDay.keys()].sort((a, b) => a - b);
  let run = 0, best = 0, at: number | null = null;
  days.forEach((d, i) => {
    run = i > 0 && d - days[i - 1]! === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    if (at === null && run >= length) at = byDay.get(d)!;
  });
  return { at, best };
}

export function recentForm(games: FinishedGame[], n = 10): Outcome[] {
  return games.slice(-n).map((g) => g.outcome);
}
