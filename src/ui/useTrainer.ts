import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EngineCancelled } from '../engine/client';
import type { AnalysisEngine } from '../engine/analysis';
import { checkMove, type MoveCheck, type MoveVerdict, type TrainerEval, type TrainerEvaluation } from '../trainer/check';
import type { SpeechManager } from '../trainer/speech';
import type { TrainerMessage, TrainerMessageKind, TrainerPrefs } from '../trainer/types';

const MAX_MESSAGES = 8;
const CACHE_LIMIT = 60;

/** Search settings for the Trainer: quick enough to answer while the player is still looking at the board. */
export const TRAINER_DEPTH = 14;
export const TRAINER_MS = 700;

export interface TrainerApi {
  messages: TrainerMessage[];
  /** True while a move is being checked. */
  checking: boolean;
  /** Counts of the verdicts the Trainer reached on the player's moves this game. */
  tally: Record<MoveVerdict, number>;
  post: (kind: TrainerMessageKind, text: string, speak: boolean) => void;
  /** Warm the cache with the evaluation of the position the player is about to move in. */
  prefetch: (fen: string) => void;
  check: (fen: string, uci: string) => Promise<MoveCheck>;
  recordVerdict: (v: MoveVerdict) => void;
  reset: () => void;
  /** Stop speaking and drop in-flight checks (a new move, take-back, new game or leaving the page). */
  quiet: () => void;
  /** Bumps whenever `quiet` or `reset` ran, so callers can tell that a check they started has gone stale. */
  epoch: number;
}

const EMPTY_TALLY: Record<MoveVerdict, number> = { best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };

/**
 * The Trainer's state for one game: its messages, a small evaluation cache, and the engine plumbing. It owns no listeners or timers
 * of its own; the speech manager and the engine are shared app resources that the app disposes.
 */
export function useTrainer(active: boolean, evalEngine: AnalysisEngine, speech: SpeechManager, prefs: TrainerPrefs): TrainerApi {
  const [messages, setMessages] = useState<TrainerMessage[]>([]);
  const [checking, setChecking] = useState(false);
  const [tally, setTally] = useState(EMPTY_TALLY);
  const [epoch, setEpoch] = useState(0);
  const idRef = useRef(0);
  const epochRef = useRef(0);
  const cache = useRef(new Map<string, TrainerEvaluation>());
  const pending = useRef(new Map<string, Promise<TrainerEvaluation | null>>());
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  const evaluate: TrainerEval = useCallback(
    async (fen, moves) => {
      const key = `${fen}|${moves.join(',')}`;
      const hit = cache.current.get(key);
      if (hit) return hit;
      const running = pending.current.get(key);
      if (running) return running;
      const run = (async () => {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const r = await evalEngine.evaluate({ startFen: fen, moves, depth: TRAINER_DEPTH, maxTimeMs: TRAINER_MS });
            const e: TrainerEvaluation = { cp: r.scoreCp, mate: r.mate, uci: r.uci, pv: r.pv, depth: r.depth };
            if (cache.current.size >= CACHE_LIMIT) cache.current.delete(cache.current.keys().next().value!);
            cache.current.set(key, e);
            return e;
          } catch (e) {
            // Another part of the app may have cancelled the shared analysis engine; one retry is enough.
            if (!(e instanceof EngineCancelled)) return null;
          }
        }
        return null;
      })().finally(() => pending.current.delete(key));
      pending.current.set(key, run);
      return run;
    },
    [evalEngine],
  );

  const post = useCallback(
    (kind: TrainerMessageKind, text: string, speak: boolean) => {
      // Callers only post inside Trainer games; `active` is not checked here because the welcome is posted in the same
      // tick that starts the game, before this hook has re-rendered with active = true.
      if (!text) return;
      const id = ++idRef.current;
      setMessages((m) => [...m.slice(-(MAX_MESSAGES - 1)), { id, kind, text, speak }]);
      if (speak) speech.speak(text);
    },
    [speech],
  );

  const prefetch = useCallback(
    (fen: string) => {
      if (active && prefsRef.current.warnings) void evaluate(fen, []);
    },
    [active, evaluate],
  );

  const check = useCallback(
    async (fen: string, uci: string) => {
      setChecking(true);
      try {
        return await checkMove(fen, uci, evaluate);
      } finally {
        setChecking(false);
      }
    },
    [evaluate],
  );

  const recordVerdict = useCallback((v: MoveVerdict) => setTally((t) => ({ ...t, [v]: t[v] + 1 })), []);

  const quiet = useCallback(() => {
    epochRef.current++;
    setEpoch(epochRef.current);
    speech.stop();
    setChecking(false);
  }, [speech]);

  const reset = useCallback(() => {
    quiet();
    setMessages([]);
    setTally(EMPTY_TALLY);
    cache.current.clear();
    pending.current.clear();
  }, [quiet]);

  // Leaving the page: nothing may keep speaking.
  useEffect(() => () => speech.stop(), [speech]);

  return useMemo(() => ({ messages, checking, tally, post, prefetch, check, recordVerdict, reset, quiet, epoch }), [messages, checking, tally, post, prefetch, check, recordVerdict, reset, quiet, epoch]);
}
