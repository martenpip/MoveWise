import { findLevel } from '../engine/levels';
import { INELIGIBLE_TEXT, buildRating, ineligibleReason } from '../profile/rating';
import type { SavedGame } from '../storage/types';

export interface GameProgress {
  /** One honest sentence about the rating effect of the game. */
  ratingText: string;
  /** True when the game changed the rating. */
  rated: boolean;
  /** Set when this game took a rated player (10+ rated games) to a clearly new highest rating. */
  personalBest: number | null;
}

/**
 * What a just-finished game did to the player's rating. (Achievements are handled by `checkAchievements`.) `before` must not contain `record`.
 * Pure, so it is tested without the UI.
 */
export function summariseGame(before: SavedGame[], record: SavedGame, ratingEpoch: number): GameProgress {
  const after = [...before, record];
  const reason = ineligibleReason(record, ratingEpoch);
  const ratingBefore = buildRating(before, { ratingEpoch });
  const ratingAfter = buildRating(after, { ratingEpoch });
  const personalBest =
    !reason && ratingAfter.ratedGames >= 10 && ratingAfter.current >= ratingBefore.peak + 25 && ratingAfter.peak === ratingAfter.current
      ? Math.round(ratingAfter.current)
      : null;
  if (reason === 'trainer' || reason === 'practice-bot') {
    return { ratingText: reason === 'trainer' ? 'This game was played with the Trainer, so it is practice and your rating did not change.' : 'This was a practice bot (below 1000), so your rating did not change.', rated: false, personalBest: null };
  }
  if (reason) {
    return { ratingText: `This game did not count toward your rating (${INELIGIBLE_TEXT[reason].toLowerCase()}).`, rated: false, personalBest };
  }
  const d = ratingAfter.current - ratingBefore.current;
  const level = findLevel(record.botLevel ?? '')?.name ?? 'the bot';
  const sign = d >= 0 ? '+' : '−';
  const prov = ratingAfter.confidence === 'provisional' ? ' (provisional)' : '';
  return {
    ratingText: `Rating ${Math.round(ratingBefore.current)} → ${Math.round(ratingAfter.current)} (${sign}${Math.abs(Math.round(d))}) after your game against ${level}${prov}.`,
    rated: true,
    personalBest,
  };
}
