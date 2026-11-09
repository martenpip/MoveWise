import type { Store } from '../storage/types';
import { analyseReview } from './analyse';
import { buildReviewEvent, reviewEventId } from './event';
import type { GameReview } from './types';
import { saveFromReview } from '../notebook/service';

/**
 * Save a review. An unfinished review is stored as it is (so it can be resumed) and writes nothing to the Profile.
 * A finished one also writes (or replaces) the game's Profile record, or removes it when there is nothing honest to
 * record (no personal perspective). Returns whether a Profile record exists afterwards.
 */
export async function saveReview(store: Store, review: GameReview, now = Date.now()): Promise<boolean> {
  await store.putReview(review);
  if (!review.complete) {
    await store.deleteActivity(reviewEventId(review.gameId));
    return false;
  }
  const analysis = analyseReview(review);
  const event = buildReviewEvent(analysis, now);
  // Qualifying mistakes go to the Mistake Notebook. A failure here must never fail the review itself.
  try {
    const settings = await store.getSettings();
    const game = await store.getGame(review.gameId);
    if (game && settings.notebook.autoSave && review.perspective) {
      await saveFromReview(store, analysis, { gameId: game.id, white: game.white, black: game.black, playedAt: game.createdAt }, now);
    }
  } catch {
    /* ignore */
  }
  if (event) {
    await store.addActivity(event);
    return true;
  }
  await store.deleteActivity(reviewEventId(review.gameId));
  return false;
}
