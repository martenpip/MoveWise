/**
 * Reading and writing the Notebook. Every change is a read-merge-write that runs one at a time (a promise queue), so two quick
 * actions (say, an automatic save finishing while the player saves a position by hand) cannot overwrite each other.
 */
import type { ReviewAnalysis } from '../review/analyse';
import type { Store } from '../storage/types';
import { autoEntries, entryFromPly, mergeEntry, type GameInfo } from './capture';
import { gradeFor, reschedule, type Attempt } from './srs';
import type { NotebookEntry } from './types';

let queue: Promise<unknown> = Promise.resolve();
/** Run `fn` after everything queued before it, whether or not that succeeded. */
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => undefined);
  return next;
}

export interface SaveResult {
  added: NotebookEntry[];
  merged: NotebookEntry[];
  unchanged: number;
}

async function upsert(store: Store, entries: NotebookEntry[], now: number): Promise<SaveResult> {
  const result: SaveResult = { added: [], merged: [], unchanged: 0 };
  for (const e of entries) {
    const have = await store.getNotebook(e.id);
    if (!have) {
      await store.putNotebook(e);
      result.added.push(e);
      continue;
    }
    const m = mergeEntry(have, e, now);
    if (m === have) result.unchanged += 1;
    else {
      await store.putNotebook(m);
      result.merged.push(m);
    }
  }
  return result;
}

/** Save the mistakes of a finished review that meet the automatic-saving rules. */
export function saveFromReview(store: Store, analysis: ReviewAnalysis, game: GameInfo, now = Date.now()): Promise<SaveResult> {
  return serial(() => upsert(store, autoEntries(analysis, game, now), now));
}

/** Save one move of a review by hand, whatever its verdict. Resolves to null when the move cannot be practised. */
export function saveMove(store: Store, analysis: ReviewAnalysis, ply: number, game: GameInfo, now = Date.now()): Promise<{ entry: NotebookEntry; existed: boolean } | null> {
  return serial(async () => {
    const p = analysis.plies.find((x) => x.ply === ply);
    const e = p ? entryFromPly(analysis, p, game, now, true) : null;
    if (!e) return null;
    const have = await store.getNotebook(e.id);
    if (have) {
      const m = mergeEntry(have, e, now);
      if (m !== have) await store.putNotebook(m);
      return { entry: m, existed: true };
    }
    await store.putNotebook(e);
    return { entry: e, existed: false };
  });
}

/** Record the outcome of one practice attempt and schedule the next review. */
export function recordAttempt(store: Store, id: string, attempt: Attempt, now = Date.now(), extraAlternative?: string): Promise<NotebookEntry | null> {
  return serial(async () => {
    const have = await store.getNotebook(id);
    if (!have) return null;
    const srs = reschedule(have.srs, gradeFor(attempt), now);
    const alternatives = extraAlternative && extraAlternative !== have.best.uci && !have.alternatives.includes(extraAlternative) ? [...have.alternatives, extraAlternative].slice(0, 12) : have.alternatives;
    const next = { ...have, srs, alternatives, updatedAt: now };
    await store.putNotebook(next);
    return next;
  });
}

export function removeEntry(store: Store, id: string): Promise<void> {
  return serial(() => store.deleteNotebook(id));
}
