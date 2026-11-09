import type { AchievementState } from '../profile/achievementTypes';
import { useEffect, useState } from 'react';
import { EngineCancelled } from '../engine/client';
import type { BotReply } from '../engine/engine';
import { useApp } from './app';
import type { ActivityEvent, Profile } from '../profile/types';
import { defaultProfile } from '../profile/types';
import type { SavedGame } from '../storage/types';

export interface EvalState {
  reply: BotReply | null;
  busy: boolean;
  error: string | null;
}

/**
 * Evaluate a position in the background worker whenever it changes.
 * Requests are debounced and any in-flight search is cancelled when the position changes
 * or the component unmounts, so a stale result can never appear.
 */
export function useEngineEval(
  enabled: boolean,
  startFen: string,
  uciMoves: string[],
  depth: number,
  maxTimeMs: number,
): EvalState {
  const { evalEngine } = useApp();
  const [state, setState] = useState<EvalState>({ reply: null, busy: false, error: null });
  const key = `${startFen}|${uciMoves.join(' ')}|${depth}|${maxTimeMs}`;

  useEffect(() => {
    if (!enabled) {
      setState({ reply: null, busy: false, error: null });
      return;
    }
    let live = true;
    setState((s) => ({ ...s, busy: true, error: null }));
    const timer = setTimeout(() => {
      evalEngine
        .evaluate({ startFen, moves: uciMoves, depth, maxTimeMs })
        .then((reply) => live && setState({ reply, busy: false, error: null }))
        .catch((e: unknown) => {
          if (!live || e instanceof EngineCancelled) return;
          setState({ reply: null, busy: false, error: e instanceof Error ? e.message : String(e) });
        });
    }, 180);
    return () => {
      live = false;
      clearTimeout(timer);
      evalEngine.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, evalEngine]);

  return state;
}

/* ---------------------- stored data for profile pages ---------------------- */

export interface StoredData {
  games: SavedGame[];
  activity: ActivityEvent[];
  profile: Profile;
  achievements: AchievementState | null;
}

/**
 * Loads games, activity and the local profile from the store. The profile is created on first use (no account,
 * no network): its start date is the earliest saved game or today. Reloads when `dataVersion` changes.
 */
export function useStoredData(): { data: StoredData | null; error: string | null; reload: () => void } {
  const { store, dataVersion, notifyDataChanged } = useApp();
  const [data, setData] = useState<StoredData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [games, activity, existing, achievements] = await Promise.all([store.listGames(), store.listActivity(), store.getProfile(), store.getAchievements()]);
        let profile = existing;
        if (!profile) {
          const earliest = games.length ? Math.min(...games.map((g) => g.createdAt)) : undefined;
          profile = defaultProfile(Date.now(), earliest);
          await store.putProfile(profile).catch(() => undefined);
        }
        if (live) {
          setData({ games, activity, profile, achievements });
          setError(null);
        }
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : 'Could not read your saved data.');
      }
    })();
    return () => {
      live = false;
    };
  }, [store, dataVersion]);

  return { data, error, reload: notifyDataChanged };
}

/** Whether a CSS media query currently matches, kept up to date (for example a phone-width screen). False where matchMedia is missing. */
export function useMediaQuery(query: string): boolean {
  const get = () => (typeof matchMedia === 'function' ? matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}
