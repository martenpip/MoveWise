/**
 * One call that turns the stored data into everything the Profile and Home pages show.
 * Pure: the same inputs always give the same output, so it is straightforward to test.
 */
import type { SavedGame } from '../storage/types';
import { evaluateAchievements, type Achievement, type AchievementState } from './achievements';
import { buildRating, ineligibleReason, type Ineligible, type RatingSummary } from './rating';
import {
  averageMoves, dayStreaks, finishedGames, groupBy, inPeriod, openingStats, recentForm, resultsOverTime, streaks, tally,
  type Bucket, type FinishedGame, type GroupRow, type Period, type Record3, type Streaks,
} from './stats';
import { lessonStats, puzzleStats, qualityStats, type LessonStats, type PuzzleStats, type QualityStats } from './training';
import type { ActivityEvent, Profile } from './types';
import { LEVELS, PERSONALITIES, findLevel } from '../engine/levels';

/** Which statistics a game belongs to. Trainer games are always their own kind, whatever the bot's strength. */
export function kindOf(g: SavedGame): 'competitive' | 'practice' | 'trainer' {
  if (g.mode === 'trainer') return 'trainer';
  const level = findLevel(g.botLevel ?? '');
  return level && level.category === 'competitive' ? 'competitive' : 'practice';
}

export interface ProfileModel {
  profile: Profile;
  rating: RatingSummary;
  /** Rated games within the selected period (for the chart); `rating.history` is always all rated games. */
  overall: Record3;
  allTime: Record3;
  /**
   * The same period's games split by kind. Competitive = normal games against bots of 1000 and above; practice = normal games against
   * bots below 1000; trainer = every game played with the Trainer. They never overlap, and only competitive games can move the rating.
   */
  byKind: { competitive: Record3; practice: Record3; trainer: Record3 };
  streaks: Streaks;
  asWhite: Record3;
  asBlack: Record3;
  avgMoves: number | null;
  form: Array<'win' | 'loss' | 'draw'>;
  byLevel: Array<GroupRow & { name: string }>;
  byPersonality: Array<GroupRow & { name: string }>;
  results: Bucket[];
  openings: ReturnType<typeof openingStats>;
  /** Best result: the win against the highest-rated opponent. Worst: the loss against the lowest-rated one. */
  bestWin: FinishedGame | null;
  worstLoss: FinishedGame | null;
  activity: { current: number; best: number; activeDays: number };
  puzzles: PuzzleStats;
  lessons: LessonStats;
  quality: QualityStats;
  achievements: Achievement[];
  /** Games that exist but do not count toward the rating, grouped by reason. */
  unrated: Array<{ reason: Ineligible; count: number }>;
  period: Period;
}

export interface ModelInput {
  games: SavedGame[];
  activity: ActivityEvent[];
  profile: Profile;
  period: Period;
  now: number;
  /** Stored unlocks, so earned achievements stay earned (with their recorded dates). */
  achievementState?: AchievementState | null;
  /** Number of lessons shipped in this version (0 until lessons exist). */
  totalLessons?: number;
}

export function buildProfileModel({ games, activity, profile, period, now, totalLessons = 0, achievementState = null }: ModelInput): ProfileModel {
  const rating = buildRating(games, profile);
  const all = finishedGames(games);
  const scoped = inPeriod(all, period, now);

  const levelName = (id: string) => findLevel(id)?.name ?? id;
  const personalityName = (id: string) => PERSONALITIES.find((p) => p.id === id)?.name ?? id;
  const order = new Map(LEVELS.map((l, i) => [l.id, i]));
  const orderOf = (id: string) => order.get(findLevel(id)?.id ?? id) ?? 99;

  const byLevel = groupBy(scoped, (g) => g.game.botLevel)
    .map((r) => ({ ...r, name: levelName(r.key) }))
    .sort((a, b) => orderOf(a.key) - orderOf(b.key));
  const byPersonality = groupBy(scoped, (g) => g.game.botPersonality)
    .map((r) => ({ ...r, name: personalityName(r.key) }))
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));

  const ratingOf = (g: FinishedGame) => rating.history.find((p) => p.gameId === g.game.id)?.opponentRating ?? null;
  const rated = scoped.filter((g) => ratingOf(g) !== null);
  const wins = rated.filter((g) => g.outcome === 'win').sort((a, b) => ratingOf(b)! - ratingOf(a)!);
  const losses = rated.filter((g) => g.outcome === 'loss').sort((a, b) => ratingOf(a)! - ratingOf(b)!);

  const reasons = new Map<Ineligible, number>();
  for (const g of games) {
    const r = ineligibleReason(g, profile.ratingEpoch);
    if (r && r !== 'imported') reasons.set(r, (reasons.get(r) ?? 0) + 1);
  }

  return {
    profile,
    rating,
    overall: tally(scoped),
    allTime: tally(all),
    byKind: {
      competitive: tally(scoped.filter((g) => kindOf(g.game) === 'competitive')),
      practice: tally(scoped.filter((g) => kindOf(g.game) === 'practice')),
      trainer: tally(scoped.filter((g) => kindOf(g.game) === 'trainer')),
    },
    streaks: streaks(all),
    asWhite: tally(scoped.filter((g) => g.color === 'white')),
    asBlack: tally(scoped.filter((g) => g.color === 'black')),
    avgMoves: averageMoves(scoped),
    form: recentForm(all, 10),
    byLevel,
    byPersonality,
    results: resultsOverTime(scoped, period),
    openings: openingStats(scoped),
    bestWin: wins[0] ?? null,
    worstLoss: losses[0] ?? null,
    activity: dayStreaks([...games.filter((g) => g.source === 'played').map((g) => g.createdAt), ...activity.map((a) => a.at)], now),
    puzzles: puzzleStats(activity),
    lessons: lessonStats(activity, totalLessons),
    quality: qualityStats(activity),
    achievements: evaluateAchievements({ games, activity, rating }, achievementState),
    unrated: [...reasons.entries()].map(([reason, count]) => ({ reason, count })),
    period,
  };
}
