/**
 * Reads saved data, syncs achievement unlocks into storage and reports what is new.
 * Calls are queued per store, so two quick calls (e.g. a game ending while the app is starting up) can never both
 * "discover" the same unlock: the second one sees what the first stored. Combined with the pure, idempotent
 * `syncAchievements`, an achievement is announced at most once.
 */
import type { Store } from '../storage/types';
import { syncAchievements, type SyncResult } from './achievements';
import { buildRating } from './rating';

const queues = new WeakMap<Store, Promise<unknown>>();

export function checkAchievements(store: Store, now: number = Date.now()): Promise<SyncResult> {
  const run = async (): Promise<SyncResult> => {
    const [games, activity, profile, prev] = await Promise.all([store.listGames(), store.listActivity(), store.getProfile(), store.getAchievements()]);
    const rating = buildRating(games, { ratingEpoch: profile?.ratingEpoch ?? 0 });
    const result = syncAchievements(prev, { games, activity, rating }, now);
    if (result.changed) await store.putAchievements(result.state);
    return result;
  };
  const before = queues.get(store) ?? Promise.resolve();
  const next = before.then(run, run); // a failed earlier call must not block later ones
  queues.set(store, next.catch(() => undefined));
  return next;
}
