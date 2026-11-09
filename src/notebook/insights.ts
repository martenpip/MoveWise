/**
 * Patterns in the player's saved mistakes. An insight appears only when at least MIN_EVIDENCE distinct positions of one kind were
 * saved within the last WINDOW_DAYS, and it says what happened ("several knight forks") rather than judging the player.
 * Suggestions point at Academy lessons and puzzle themes that exist in this app.
 */
import { DAY_MS } from './srs';
import type { NotebookEntry } from './types';

export const MIN_EVIDENCE = 3;
export const WINDOW_DAYS = 90;

export interface Suggestion {
  lessons: string[];
  puzzleThemes: string[];
}

interface Pattern {
  id: string;
  /** Sentence, written to be read as "You have ...". */
  sentence: (n: number) => string;
  matches: (e: NotebookEntry) => boolean;
  suggest: Suggestion;
}

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

const PATTERNS: Pattern[] = [
  { id: 'knight-forks', sentence: (n) => `missed ${plural(n, 'a knight fork', 'several knight forks')} recently`, matches: (e) => e.themes.includes('knightFork'), suggest: { lessons: ['tac-forks'], puzzleThemes: ['fork'] } },
  { id: 'forks', sentence: () => 'missed several chances to attack two pieces at once', matches: (e) => e.themes.includes('fork') && !e.themes.includes('knightFork'), suggest: { lessons: ['tac-forks'], puzzleThemes: ['fork'] } },
  { id: 'free-pieces', sentence: () => 'overlooked undefended pieces that could have been taken several times', matches: (e) => e.themes.includes('hangingPiece'), suggest: { lessons: ['undefended-pieces', 'spot-threats'], puzzleThemes: ['hangingPiece'] } },
  { id: 'hung-pieces', sentence: () => 'left pieces where they could be captured several times', matches: (e) => e.kind === 'hung-piece' || e.tags.includes('hung-piece'), suggest: { lessons: ['undefended-pieces', 'spot-threats'], puzzleThemes: ['hangingPiece'] } },
  { id: 'missed-mates', sentence: () => 'missed a forced checkmate several times', matches: (e) => e.kind === 'missed-mate', suggest: { lessons: ['tac-mating-attacks'], puzzleThemes: ['mate'] } },
  { id: 'allowed-mates', sentence: () => 'overlooked your opponent’s mating threats several times', matches: (e) => e.kind === 'allowed-mate', suggest: { lessons: ['att-king-safety', 'opponent-threats'], puzzleThemes: ['mate'] } },
  { id: 'endgames', sentence: () => 'dropped points in endgames several times', matches: (e) => e.phase === 'endgame', suggest: { lessons: ['end-conversion', 'end-opposition'], puzzleThemes: ['endgame'] } },
  { id: 'advantage', sentence: () => 'let a good position slip several times', matches: (e) => e.tags.includes('threw-away-advantage'), suggest: { lessons: ['end-conversion'], puzzleThemes: ['promotion'] } },
];

export interface Insight {
  id: string;
  sentence: string;
  count: number;
  /** Notebook entries behind it. */
  entryIds: string[];
  suggest: Suggestion;
}

export function insightsFrom(entries: readonly NotebookEntry[], now: number): Insight[] {
  const recent = entries.filter((e) => now - e.savedAt <= WINDOW_DAYS * DAY_MS || e.occurrences.some((o) => now - o.at <= WINDOW_DAYS * DAY_MS));
  const out: Insight[] = [];
  for (const p of PATTERNS) {
    const hit = recent.filter(p.matches);
    if (hit.length >= MIN_EVIDENCE) out.push({ id: p.id, sentence: `You have ${p.sentence(hit.length)}.`, count: hit.length, entryIds: hit.map((e) => e.id), suggest: p.suggest });
  }
  return out.sort((a, b) => b.count - a.count);
}
