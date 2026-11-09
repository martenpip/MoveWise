/**
 * Loading and saving puzzle data for the pages. The bundled starter pack is a static file that the service worker has
 * cached, so it loads with no network; installed packs come from IndexedDB.
 */
import { useEffect, useState } from 'react';
import type { PuzzleEvent } from '../profile/types';
import { puzzles as puzzleEvents } from '../profile/training';
import type { DailyRecord } from '../puzzles/daily';
import type { LearningPosition } from '../puzzles/learn';
import { buildLibrary, type Library } from '../puzzles/library';
import { puzzleRating, type PuzzleRating } from '../puzzles/rating';
import type { RushScore } from '../puzzles/rush';
import { BUNDLED_PACK_ID, PACK_FORMAT, type PuzzlePack } from '../puzzles/types';
import type { Store } from '../storage/types';
import { useApp } from './app';

let libraryCache: { library: Library; version: number } | null = null;
let libraryVersion = 0;
/** Call after installing or removing a pack so the next load rebuilds the collection. */
export function invalidateLibrary(): void {
  libraryVersion++;
}

export async function loadLibrary(store: Store, fetcher: typeof fetch = fetch): Promise<Library> {
  if (libraryCache && libraryCache.version === libraryVersion) return libraryCache.library;
  const problems: string[] = [];
  const packs: Array<{ pack: PuzzlePack; bundled: boolean }> = [];
  try {
    const res = await fetcher('./puzzles/lichess-starter.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const pack = (await res.json()) as PuzzlePack;
    if (pack.format !== PACK_FORMAT || pack.id !== BUNDLED_PACK_ID || !Array.isArray(pack.puzzles)) throw new Error('the bundled pack is not in the expected format');
    packs.push({ pack, bundled: true });
  } catch (e) {
    problems.push(`The bundled puzzle collection could not be loaded (${e instanceof Error ? e.message : String(e)}).`);
  }
  try {
    for (const pack of await store.listPacks()) packs.push({ pack, bundled: false });
  } catch {
    problems.push('Installed puzzle packs could not be read.');
  }
  const library = buildLibrary(packs, problems);
  libraryCache = { library, version: libraryVersion };
  return library;
}

export function useLibrary(): { library: Library | null; error: string | null } {
  const { store } = useApp();
  const [state, setState] = useState<{ library: Library | null; error: string | null }>({ library: libraryCache?.library ?? null, error: null });
  useEffect(() => {
    let live = true;
    loadLibrary(store)
      .then((library) => live && setState({ library, error: library.puzzles.length ? null : library.problems.join(' ') || 'No puzzles are installed.' }))
      .catch((e) => live && setState({ library: null, error: e instanceof Error ? e.message : String(e) }));
    return () => {
      live = false;
    };
  }, [store]);
  return state;
}

export interface PuzzleData {
  loaded: boolean;
  events: PuzzleEvent[];
  rating: PuzzleRating;
  daily: DailyRecord[];
  rush: RushScore[];
  positions: LearningPosition[];
}

const EMPTY: PuzzleData = { loaded: false, events: [], rating: puzzleRating([]), daily: [], rush: [], positions: [] };

/** All of the player's puzzle data; reloads whenever app data changes. */
export function usePuzzleData(): PuzzleData {
  const { store, dataVersion } = useApp();
  const [data, setData] = useState<PuzzleData>(EMPTY);
  useEffect(() => {
    let live = true;
    (async () => {
      const [activity, daily, rush, positions] = await Promise.all([store.listActivity(), store.listDaily(), store.listRush(), store.listLearning()]);
      const events = puzzleEvents(activity);
      if (live) setData({ loaded: true, events, rating: puzzleRating(events), daily, rush, positions });
    })().catch(() => live && setData({ ...EMPTY, loaded: true }));
    return () => {
      live = false;
    };
  }, [store, dataVersion]);
  return data;
}
