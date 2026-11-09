import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Position } from '../../chess/position';
import { WHITE, moveFrom, moveTo, movePromo, squareName, type Color } from '../../chess/types';
import { soundForMove } from '../../audio/moveSound';
import type { PuzzleEvent, PuzzleMode } from '../../profile/types';
import { puzzleRating } from '../../puzzles/rating';
import { wouldBeRated } from '../../puzzles/rating';
import { judgeAlternative, fmt, type Judgement } from '../../puzzles/alternatives';
import { makeEvent } from '../../puzzles/attempt';
import { localDateKey, pickDaily, type DailyRecord } from '../../puzzles/daily';
import { explainPuzzle, type EngineNote } from '../../puzzles/explain';
import { MAX_HINT, hintFor, type Hint } from '../../puzzles/hints';
import { learningPuzzle, type LearningPosition } from '../../puzzles/learn';
import type { Library } from '../../puzzles/library';
import { MAX_STRIKES, afterMiss, afterSolve, highScore, rushOver, rushPuzzle, startRush, type RushMinutes, type RushScore, type RushState } from '../../puzzles/rush';
import { nextPuzzle, seeded, type TrainMode } from '../../puzzles/select';
import { PuzzleSession } from '../../puzzles/solver';
import { primaryTheme, themeLabel } from '../../puzzles/themes';
import { checkMotif } from '../../puzzles/motif';
import type { Puzzle } from '../../puzzles/types';
import { EXPLAIN_LEVELS, type ExplainLevel } from '../../review/explain';
import { describeMove, formatLine } from '../../review/facts';
import { useApp } from '../app';
import { Board } from '../Board';
import { useLibrary, usePuzzleData } from '../puzzleData';
import { newId } from '../shared';

export type SolveSource =
  | { kind: 'train'; mode: TrainMode; theme?: string; /** Only puzzles in which MoveWise itself found the theme's pattern. */ confirmed?: boolean }
  | { kind: 'daily' }
  | { kind: 'id'; id: string }
  | { kind: 'game'; gameId: string; ply: number }
  | { kind: 'rush'; minutes: RushMinutes };

const LEVEL_KEY = 'mw-puzzle-level';
const loadLevel = (): ExplainLevel => {
  try {
    const v = localStorage.getItem(LEVEL_KEY);
    return v === 'beginner' || v === 'intermediate' || v === 'advanced' ? v : 'beginner';
  } catch {
    return 'beginner';
  }
};

const PROMO = ['', '', 'n', 'b', 'r', 'q'];
const uciOf = (from: number, to: number, promo: number) => `${squareName(from)}${squareName(to)}${PROMO[promo] ?? ''}`;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface Shown {
  fen: string;
  last: { from: number; to: number } | null;
}
const sq = (s: string) => s.charCodeAt(0) - 97 + (Number(s[1]) - 1) * 8;
const lastOf = (uci: string) => ({ from: sq(uci.slice(0, 2)), to: sq(uci.slice(2, 4)) });

interface Run {
  puzzle: Puzzle;
  session: PuzzleSession;
  why: string;
  mode: PuzzleMode;
  sittingId: string;
  startedAt: number;
  rated: boolean;
  /** Hints shown for the current move (they restart on each move of a multi-move puzzle). */
  hint: number;
  hints: Hint[];
  /** Highest hint level used anywhere in this attempt. */
  maxHint: number;
  wrong: number;
  usedSolution: boolean;
  /** Whether the attempt has been written (at the first failure, or at completion). */
  recorded: boolean;
  /** The practice position's try count was already increased for this sitting. */
  counted: boolean;
  failed: boolean;
  solved: boolean;
  /** Solved on a later try after failing. */
  retrySolved: boolean;
  viaAlternative: string | null;
  ratingBefore: number;
  ratingAfter: number | null;
  daily?: DailyRecord;
  lp?: LearningPosition;
}

interface RushView { state: RushState; endsAt: number; left: number; over: boolean; saved: RushScore | null; best: number }

export function PuzzleSolve({ source }: { source: SolveSource }) {
  const { store, evalEngine, settings, playSound, notifyDataChanged, checkAchievements } = useApp();
  const { library, error } = useLibrary();
  const data = usePuzzleData();
  const [, bump] = useState(0);
  const force = () => bump((n) => n + 1);
  const runRef = useRef<Run | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const [judge, setJudge] = useState<Judgement | null>(null);
  const [wrongMove, setWrongMove] = useState<{ san: string; sq: number } | null>(null);
  const [level, setLevel] = useState<ExplainLevel>(loadLevel);
  const [engineNote, setEngineNote] = useState<EngineNote | null>(null);
  const [replay, setReplay] = useState<number | null>(null);
  const [empty, setEmpty] = useState<string | null>(null);
  const [rush, setRush] = useState<RushView | null>(null);
  const mounted = useRef(true);
  const seenIds = useRef(new Set<string>());
  const eventsRef = useRef<PuzzleEvent[]>([]);
  eventsRef.current = data.events;
  const rushRef = useRef<RushView | null>(rush);
  rushRef.current = rush;
  const loadedFor = useRef('');

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /* ---------------- starting a puzzle ---------------- */
  const startPuzzle = useCallback(
    (puzzle: Puzzle, why: string, mode: PuzzleMode, extra: { daily?: DailyRecord; lp?: LearningPosition } = {}) => {
      const session = new PuzzleSession(puzzle);
      const events = eventsRef.current;
      runRef.current = {
        puzzle, session, why, mode, sittingId: newId(), startedAt: Date.now(),
        rated: wouldBeRated(events, puzzle.id, mode) && !puzzle.custom,
        hint: 0, hints: [], maxHint: 0, wrong: 0, usedSolution: false, recorded: false, counted: false, failed: false, solved: false, retrySolved: false, viaAlternative: null,
        ratingBefore: puzzleRating(events).rating, ratingAfter: null, ...extra,
      };
      seenIds.current.add(puzzle.id);
      setShown({ fen: session.startFen, last: lastOf(puzzle.moves[0]!) });
      setMessage(null);
      setJudge(null);
      setWrongMove(null);
      setEngineNote(null);
      setReplay(null);
      setBusy(false);
      force();
    },
    [],
  );

  const loadNext = useCallback(
    async (lib: Library) => {
      const rating = puzzleRating(eventsRef.current).rating;
      const now = Date.now();
      if (source.kind === 'train') {
        const pool = source.confirmed && source.theme ? lib.puzzles.filter((p) => checkMotif(p, source.theme!) === 'confirmed') : lib.puzzles;
        const pick = nextPuzzle(source.mode, { puzzles: pool, events: eventsRef.current, rating, now, rng: seeded(now ^ seenIds.current.size), exclude: seenIds.current }, { theme: source.theme })
          ?? nextPuzzle(source.mode, { puzzles: pool, events: eventsRef.current, rating, now, rng: seeded(now) }, { theme: source.theme });
        if (!pick) {
          setEmpty(source.mode === 'review' ? 'Nothing to review: every puzzle you have tried is solved cleanly. Well done.' : 'No puzzles match this choice in the installed collection.');
          runRef.current = null;
          force();
          return;
        }
        setEmpty(null);
        startPuzzle(pick.puzzle, pick.why, source.mode);
      } else if (source.kind === 'id') {
        const p = lib.byId.get(source.id);
        if (!p) {
          setEmpty('This puzzle is not in the installed collection (its pack may have been removed).');
          return;
        }
        startPuzzle(p, 'Revisiting a puzzle. This attempt will not change your rating.', 'id');
      } else if (source.kind === 'daily') {
        const date = localDateKey(now);
        let rec = await store.getDaily(date);
        if (!rec) {
          const p = pickDaily(date, lib.puzzles, Math.round(rating));
          if (!p) {
            setEmpty('There are no puzzles installed.');
            return;
          }
          rec = { date, puzzleId: p.id, targetRating: Math.round(rating), pickedAt: now };
          await store.putDaily(rec);
        }
        const p = lib.byId.get(rec.puzzleId);
        if (!p) {
          setEmpty('Today’s puzzle comes from a pack that is no longer installed.');
          return;
        }
        startPuzzle(p, rec.solvedAt ? 'You have already solved today’s puzzle. Replaying it does not change your rating.' : `Daily puzzle for ${date}.`, 'daily', { daily: rec });
      } else if (source.kind === 'game') {
        const lp = await store.getLearning(`${source.gameId}:${source.ply}`);
        if (!lp) {
          setEmpty('This practice position was not found. It may have been removed with its game.');
          return;
        }
        startPuzzle(learningPuzzle(lp, Math.round(rating)), lp.scored ? 'From your own game: find the mating sequence you missed. Not counted in your puzzle rating.' : 'A learning position from your game. Find the move the engine preferred. Not scored.', 'game', { lp });
      } else {
        const r = rushRef.current;
        if (!r) return;
        const p = rushPuzzle(lib.puzzles, r.state);
        if (!p) {
          finishRush();
          return;
        }
        r.state.used = [...r.state.used, p.id];
        startPuzzle(p, '', 'rush');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source, store, startPuzzle],
  );

  const sourceKey = JSON.stringify(source);
  useEffect(() => {
    if (!library || !data.loaded || loadedFor.current === sourceKey) return;
    loadedFor.current = sourceKey;
    if (source.kind === 'rush') {
      const state = startRush(data.rating.rating);
      setRush({ state, endsAt: Date.now() + source.minutes * 60_000, left: source.minutes * 60_000, over: false, saved: null, best: highScore(data.rush, source.minutes)?.solved ?? 0 });
      rushRef.current = { state, endsAt: Date.now() + source.minutes * 60_000, left: source.minutes * 60_000, over: false, saved: null, best: 0 };
    }
    void loadNext(library);
  }, [library, data.loaded, sourceKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------------- Rush clock ---------------- */
  useEffect(() => {
    if (source.kind !== 'rush' || !rush || rush.over) return;
    const t = setInterval(() => {
      const r = rushRef.current;
      if (!r || r.over) return;
      const left = Math.max(0, r.endsAt - Date.now());
      if (left <= 0) finishRush();
      else setRush({ ...r, left });
    }, 250);
    return () => clearInterval(t);
  }, [source.kind, rush?.over, !!rush]); // eslint-disable-line react-hooks/exhaustive-deps

  async function finishRush() {
    const r = rushRef.current;
    if (!r || r.over || source.kind !== 'rush') return;
    const score: RushScore = { id: newId(), at: Date.now(), minutes: source.minutes, solved: r.state.solved, strikes: r.state.strikes, best: r.state.level };
    const prev = highScore(data.rush, source.minutes)?.solved ?? 0;
    const next = { ...r, over: true, saved: score, best: Math.max(prev, score.solved) };
    rushRef.current = next;
    setRush(next);
    runRef.current = null;
    if (score.solved > 0 || score.strikes > 0) await store.putRush(score).catch(() => undefined);
    notifyDataChanged();
    void checkAchievements();
  }

  /* ---------------- recording ---------------- */
  const record = useCallback(
    async (run: Run, solved: boolean) => {
      const ev = makeEvent({
        puzzle: run.puzzle, mode: run.mode, sittingId: run.sittingId, at: run.startedAt, timeMs: Date.now() - run.startedAt,
        hintsUsed: run.maxHint, wrongMoves: run.wrong, usedSolution: run.usedSolution, solved, rated: run.rated, retrySolved: run.retrySolved,
      });
      // Finishing on a retry completes the daily puzzle or exercise, even though the first attempt stays a miss for the rating.
      const done = solved || run.retrySolved;
      try {
        await store.addActivity(ev);
        run.recorded = true;
        const before = puzzleRating(eventsRef.current.filter((e) => e.id !== ev.id));
        const after = puzzleRating([...eventsRef.current.filter((e) => e.id !== ev.id), ev]);
        run.ratingBefore = before.rating;
        run.ratingAfter = ev.rated ? after.rating : null;
        if (run.lp) {
          const fresh = (await store.getLearning(run.lp.id)) ?? run.lp;
          const first = !run.counted;
          run.counted = true;
          await store.putLearning({ ...fresh, tries: fresh.tries + (first ? 1 : 0), lastTriedAt: Date.now(), ...(done && !run.usedSolution && !fresh.solvedAt ? { solvedAt: Date.now() } : {}) });
        }
        if (run.daily && done && !run.usedSolution && !run.daily.solvedAt) {
          run.daily = { ...run.daily, solvedAt: Date.now(), clean: run.maxHint === 0 && run.wrong === 0 };
          await store.putDaily(run.daily);
        }
        notifyDataChanged();
        void checkAchievements();
      } catch {
        setMessage({ kind: 'error', text: 'This result could not be saved on this device.' });
      }
    },
    [store, notifyDataChanged, checkAchievements],
  );

  /* ---------------- moves ---------------- */
  const sound = useCallback(
    (fen: string, uci: string) => {
      const d = describeMove(fen, uci);
      if (d) playSound(soundForMove({ capture: d.captured !== 0, castle: d.castle, promotion: d.promotion, check: d.check && !d.checkmate, checkmate: d.checkmate }));
    },
    [playSound],
  );

  const complete = useCallback(
    async (run: Run) => {
      run.solved = true;
      if (!run.recorded && !run.usedSolution) await record(run, true);
      else if (run.recorded && run.failed && !run.usedSolution) {
        run.retrySolved = true;
        await record(run, false);
      }
      if (run.mode === 'rush') return;
      playSound('success');
      if (run.ratingAfter !== null && Math.round(run.ratingAfter) !== Math.round(run.ratingBefore)) setTimeout(() => playSound('notify'), 450);
      force();
    },
    [record, playSound],
  );

  async function onMove(from: number, to: number, promo: number) {
    const run = runRef.current;
    if (!run || busy || run.session.done || replay !== null) return;
    const s = run.session;
    const uci = uciOf(from, to, promo);
    const before = s.fen;
    const attempt = s.attempt(uci);
    if (attempt.kind === 'illegal') return;
    setMessage(null);
    setWrongMove(null);
    setJudge(null);
    if (attempt.kind === 'correct') {
      setBusy(true);
      if (!attempt.done) {
        run.hint = 0;
        run.hints = [];
      }
      const afterPlayer = new Position(before);
      afterPlayer.makeMove(afterPlayer.parseUci(attempt.uci)!);
      setShown({ fen: afterPlayer.toFen(), last: lastOf(attempt.uci) });
      sound(before, attempt.uci);
      if (attempt.reply) {
        await wait(520);
        if (!mounted.current) return;
        sound(afterPlayer.toFen(), attempt.reply);
        setShown({ fen: s.fen, last: lastOf(attempt.reply) });
        setMessage({ kind: 'ok', text: 'Correct. Keep going.' });
      }
      setBusy(false);
      if (attempt.done) {
        if (attempt.viaMate) setMessage({ kind: 'ok', text: 'A different move, but it is checkmate, so it solves the puzzle.' });
        await complete(run);
        if (run.mode === 'rush') await rushNext(true);
      }
      force();
      return;
    }
    // A wrong move. Rush is strict and fast; elsewhere the engine is asked whether it is an equally good alternative.
    const afterWrong = new Position(before);
    afterWrong.makeMove(afterWrong.parseUci(uci)!);
    setShown({ fen: afterWrong.toFen(), last: lastOf(uci) });
    sound(before, uci);
    setBusy(true);
    let verdict: Judgement | null = null;
    if (run.mode !== 'rush') {
      setMessage({ kind: 'info', text: 'Checking your move…' });
      verdict = await judgeAlternative(s, uci, evalEngine, { movetimeMs: 450 });
      if (!mounted.current) return;
    }
    if (verdict?.accept) {
      s.acceptAlternative(uci);
      run.viaAlternative = uci;
      setBusy(false);
      setMessage({ kind: 'ok', text: `You found a different winning move. ${verdict.reason} The stored solution was ${solutionLine(run)}.` });
      setJudge(verdict);
      await complete(run);
      force();
      return;
    }
    playSound('error');
    await wait(run.mode === 'rush' ? 350 : 650);
    if (!mounted.current) return;
    run.wrong++;
    setShown({ fen: before, last: s.view.lastMove });
    setBusy(false);
    setJudge(verdict);
    setWrongMove({ san: attempt.san, sq: to });
    if (run.mode === 'rush') {
      const r = rushRef.current;
      if (r) {
        const state = afterMiss(r.state);
        rushRef.current = { ...r, state };
        setRush(rushRef.current);
        await record(run, false);
        if (rushOver(state)) await finishRush();
        else await rushNext(false);
      }
      return;
    }
    if (!run.failed) {
      run.failed = true;
      await record(run, false);
    }
    setMessage({ kind: 'error', text: `${attempt.san} is not the solution. You can try again, ask for a hint, or see why it fails.` });
    force();
  }

  const solutionLine = (run: Run) => formatLine({ startFen: run.session.startFen, uci: run.puzzle.moves.slice(1), san: sanLine(run.puzzle) }, 6);

  async function rushNext(solved: boolean) {
    const r = rushRef.current;
    if (!r || !library) return;
    if (solved) {
      rushRef.current = { ...r, state: afterSolve(r.state) };
      setRush(rushRef.current);
    }
    await wait(solved ? 350 : 250);
    if (mounted.current && !rushRef.current?.over) await loadNext(library);
  }

  /* ---------------- hints, solution, retry ---------------- */
  const askHint = () => {
    const run = runRef.current;
    if (!run || run.session.done) return;
    if (run.hint >= MAX_HINT) return;
    run.hint++;
    run.maxHint = Math.max(run.maxHint, run.hint);
    run.hints.push(hintFor(run.session, run.hint as 1 | 2 | 3));
    force();
  };

  async function showSolution() {
    const run = runRef.current;
    if (!run || run.session.done || busy) return;
    run.usedSolution = true;
    if (!run.recorded) {
      run.failed = true;
      await record(run, false);
    } else {
      await record(run, false);
    }
    setBusy(true);
    setMessage({ kind: 'info', text: 'Here is the solution.' });
    while (!run.session.done && mounted.current) {
      const next = run.session.expected!;
      const before = run.session.fen;
      const a = run.session.attempt(next);
      if (a.kind !== 'correct') break;
      const afterP = new Position(before);
      afterP.makeMove(afterP.parseUci(next)!);
      setShown({ fen: afterP.toFen(), last: lastOf(next) });
      sound(before, next);
      await wait(800);
      if (a.reply) {
        sound(afterP.toFen(), a.reply);
        setShown({ fen: run.session.fen, last: lastOf(a.reply) });
        await wait(700);
      }
    }
    run.solved = false;
    setBusy(false);
    setMessage(null);
    force();
  }

  const retry = () => {
    setMessage(null);
    setJudge(null);
    setWrongMove(null);
  };

  /* ---------------- explanation ---------------- */
  const run = runRef.current;
  const finished = !!run && run.session.done;
  const explanation = useMemo(() => (run && finished && run.mode !== 'rush' ? explainPuzzle(run.puzzle, level, engineNote) : null), [run, finished, level, engineNote]);

  useEffect(() => {
    if (!run || !finished || level !== 'advanced' || engineNote || run.mode === 'rush') return;
    let live = true;
    evalEngine
      .evaluate({ startFen: run.puzzle.fen, moves: run.puzzle.moves.slice(0, 2), depth: 14, maxTimeMs: 700 })
      .then((r) => {
        if (!live) return;
        const white = run.session.playerColor === WHITE;
        const sign = white ? 1 : -1;
        setEngineNote({ engine: r.engine ?? 'The engine', cp: r.mate === null ? sign * r.scoreCp : null, mate: r.mate === null ? null : sign * r.mate, depth: r.depth });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [run, finished, level, engineNote, evalEngine]);

  /* ---------------- board ---------------- */
  const view = useMemo(() => {
    if (!run || !shown) return null;
    let fen = shown.fen;
    let last = shown.last;
    if (replay !== null && finished) {
      const pos = new Position(run.session.startFen);
      let lm = lastOf(run.puzzle.moves[0]!);
      const line = run.puzzle.moves.slice(1);
      for (let i = 0; i < Math.min(replay, line.length); i++) {
        const m = pos.parseUci(line[i]!);
        if (m === undefined) break;
        pos.makeMove(m);
        lm = lastOf(line[i]!);
      }
      fen = pos.toFen();
      last = replay === 0 ? lastOf(run.puzzle.moves[0]!) : lm;
    }
    const pos = new Position(fen);
    return { board: pos.board, turn: pos.turn, check: pos.inCheck() ? pos.kings[pos.turn] : -1, last, legal: pos.legalMoves(), fen };
  }, [run, shown, replay, finished]);

  const interactive = !!run && !run.session.done && !busy && replay === null && (source.kind !== 'rush' || !rush?.over);
  const dests = useCallback((from: number) => (view ? view.legal.filter((m) => moveFrom(m) === from).map(moveTo) : []), [view]);
  const hintSquare = run?.hints.find((h) => h.level === 3)?.square ?? null;
  const highlights = [
    ...(hintSquare !== null && run && !run.session.done ? [{ sq: hintSquare, tone: 'hint' as const }] : []),
    ...(wrongMove ? [{ sq: wrongMove.sq, tone: 'bad' as const }] : []),
  ];

  /* ---------------- render ---------------- */
  if (error) return <div className="card" style={{ maxWidth: 640, margin: '0 auto' }}><h1>Puzzles</h1><div className="notice error" role="alert">{error}</div><a className="btn" href="#/puzzles">Back</a></div>;
  if (!library || !data.loaded) return <p className="muted" role="status">Loading puzzles…</p>;
  if (empty && (!run || source.kind !== 'rush'))
    return (
      <div className="card" style={{ maxWidth: 640, margin: '0 auto' }}>
        <h1>Puzzles</h1>
        <p>{empty}</p>
        <a className="btn primary" href="#/puzzles">Back to Puzzles</a>
      </div>
    );

  if (source.kind === 'rush' && rush?.over) return <RushResult rush={rush} minutes={source.minutes} />;
  if (!run || !view) return <p className="muted" role="status">Preparing the puzzle…</p>;

  const playerWhite = run.session.playerColor === WHITE;
  const turnWord = playerWhite ? 'White' : 'Black';
  const theme = primaryTheme(run.puzzle.themes);
  const showTheme = finished || source.kind === 'train' && source.mode === 'theme';
  const step = run.session.step + 1;
  const total = run.session.totalSteps;
  const nextHref = source.kind === 'train' || source.kind === 'rush' ? null : '#/puzzles/play/practice';
  const isRush = run.mode === 'rush';
  const custom = run.puzzle.custom;

  return (
    <div className="game-layout">
      <div className="board-col">
        <a href={isRush ? '#/puzzles' : '#/puzzles'} className="small">← Puzzles</a>
        {isRush && rush && (
          <div className="pz-rush" role="timer" aria-live="off">
            <span className="pz-clock" aria-label={`${Math.ceil(rush.left / 1000)} seconds left`}>{clock(rush.left)}</span>
            <span>Solved <b>{rush.state.solved}</b></span>
            <span aria-label={`${rush.state.strikes} of ${MAX_STRIKES} strikes`}>{Array.from({ length: MAX_STRIKES }, (_, i) => (i < rush.state.strikes ? '✗' : '○')).join(' ')}</span>
            <button className="btn small" type="button" onClick={() => void finishRush()}>End</button>
          </div>
        )}
        <div className="board-frame pz-board">
          <Board
            board={view.board}
            orientation={playerWhite ? 'white' : 'black'}
            lastMove={view.last}
            checkSquare={view.check}
            interactive={interactive}
            isMovable={(s) => view.board[s] !== 0 && (view.board[s]! >> 3) === view.turn && view.turn === run.session.playerColor}
            destinations={dests}
            needsPromotion={(f, t) => view.legal.some((m) => moveFrom(m) === f && moveTo(m) === t && movePromo(m) !== 0)}
            onMove={(f, t, p) => void onMove(f, t, p)}
            onSound={playSound}
            showLegalMoves={settings.showLegalMoves}
            promoColor={view.turn as Color}
            highlights={highlights}
            ariaLabel={`Puzzle board. ${turnWord} to move. Move ${Math.min(step, total)} of ${total}.`}
          />
        </div>
        {finished && replay !== null && (
          <div className="btn-row" role="group" aria-label="Replay the solution">
            <button className="btn small" type="button" onClick={() => setReplay(0)} disabled={replay === 0}>{'|<'}</button>
            <button className="btn small" type="button" onClick={() => setReplay(Math.max(0, replay - 1))} disabled={replay === 0} aria-label="Previous move">◀</button>
            <button className="btn small" type="button" onClick={() => setReplay(Math.min(run.puzzle.moves.length - 1, replay + 1))} disabled={replay >= run.puzzle.moves.length - 1} aria-label="Next move">▶</button>
            <button className="btn small" type="button" onClick={() => setReplay(null)}>Back to the final position</button>
          </div>
        )}
      </div>

      <aside className="stack" aria-label="Puzzle panel">
        <div className="card pz-task">
          <p className="pz-instr" data-testid="puzzle-instruction" data-puzzle-id={run.puzzle.id} data-ready={interactive ? "yes" : "no"}>
            {finished ? (run.solved ? 'Solved.' : 'Puzzle finished.') : <>Find the best move for <b>{turnWord}</b>{total > 1 ? ` (move ${Math.min(step, total)} of ${total})` : ''}.</>}
          </p>
          {run.why && !isRush && <p className="muted small">{run.why}</p>}
          {custom && !custom.scored && <div className="notice" role="note">Learning position: not scored, and it does not change any puzzle statistics.</div>}
          {message && <div className={`notice ${message.kind === 'ok' ? 'ok' : message.kind === 'error' ? 'error' : ''}`} role="status" data-testid="puzzle-message">{message.text}</div>}
          {!isRush && (
            <p className="muted small">
              {showTheme && theme ? <>Theme: <b>{themeLabel(theme)}</b> · </> : null}
              {finished ? <>Puzzle rating {run.puzzle.rating} · </> : null}
              {run.rated ? 'Counts for your puzzle rating.' : 'Does not change your puzzle rating.'}
            </p>
          )}
        </div>

        {!finished && !isRush && (
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Need help?</h2>
            {run.hints.map((h) => <p key={h.level} className="pz-hint" data-testid={`hint-${h.level}`}><b>Hint {h.level}.</b> {h.text}</p>)}
            <div className="btn-row">
              <button className="btn" type="button" onClick={askHint} disabled={run.hint >= MAX_HINT || busy} data-testid="hint-button">
                {run.hint === 0 ? 'Hint' : run.hint >= MAX_HINT ? 'No more hints' : 'Another hint'}
              </button>
              {wrongMove && <button className="btn" type="button" onClick={retry}>Try again</button>}
              <button className="btn" type="button" onClick={() => void showSolution()} disabled={busy}>Show solution</button>
            </div>
            <p className="muted small">Hints are taken from the puzzle’s own solution. Using one is recorded and counts as half a solve for the rating. Showing the solution counts as a miss.</p>
            {wrongMove && judge && judge.refutation && judge.refutation.san.length > 0 && (
              <details className="pz-why" open>
                <summary><b>Why does {wrongMove.san} fail?</b></summary>
                <p>{judge.engine ?? 'The engine'} rates the position {judge.played !== null ? fmt(judge.played) : 'unclear'} for you after {wrongMove.san}, against {judge.stored !== null ? fmt(judge.stored) : 'a better score'} after the solution. Its best reply: <span className="pv">{formatLine(judge.refutation, 4)}</span></p>
              </details>
            )}
          </div>
        )}

        {finished && explanation && (
          <div className="card pz-explain" data-testid="puzzle-explanation">
            <h2 style={{ marginTop: 0 }}>{run.solved && !run.usedSolution ? (run.wrong === 0 && run.maxHint === 0 && !run.viaAlternative ? 'Well done' : 'Solved') : 'The solution'}: {explanation.headline}</h2>
            {run.ratingAfter !== null && run.solved && (
              <p className="pz-rating-change" data-testid="rating-change">
                Puzzle rating {Math.round(run.ratingBefore)} → <b>{Math.round(run.ratingAfter)}</b> ({run.ratingAfter >= run.ratingBefore ? '+' : '−'}{Math.abs(Math.round(run.ratingAfter - run.ratingBefore))})
              </p>
            )}
            {run.ratingAfter !== null && !run.solved && <p className="pz-rating-change">Puzzle rating {Math.round(run.ratingBefore)} → <b>{Math.round(run.ratingAfter)}</b> ({Math.round(run.ratingAfter - run.ratingBefore)})</p>}
            <div className="seg" role="group" aria-label="Explanation level">
              {EXPLAIN_LEVELS.map((l) => (
                <button key={l.id} type="button" aria-pressed={level === l.id} title={l.hint} onClick={() => { setLevel(l.id); try { localStorage.setItem(LEVEL_KEY, l.id); } catch { /* ignore */ } }}>{l.label}</button>
              ))}
            </div>
            {explanation.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
            <p className="pv" data-testid="solution-line">{formatLine(explanation.line)}</p>
            <div className="btn-row">
              <button className="btn small" type="button" onClick={() => setReplay(0)}>Play it through</button>
            </div>
            {custom && <p className="small"><a href={`#/games/${custom.gameId}/review`}>Back to the review of this game</a></p>}
            <p className="muted small">Theme tags and ratings come from the Lichess puzzle data; the moves and every fact above were checked by MoveWise’s rules engine.</p>
          </div>
        )}

        {finished && !isRush && (
          <div className="card">
            <div className="btn-row">
              {source.kind === 'train' && <button className="btn primary" type="button" onClick={() => library && void loadNext(library)} data-testid="next-puzzle">Next puzzle</button>}
              {nextHref && <a className="btn primary" href={nextHref}>More practice</a>}
              {theme && source.kind !== 'rush' && <a className="btn" href={`#/puzzles/play/theme/${theme}`}>Another {themeLabel(theme).toLowerCase()}</a>}
              <a className="btn" href="#/puzzles">Puzzles home</a>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function sanLine(p: Puzzle): string[] {
  const pos = new Position(p.fen);
  const out: string[] = [];
  p.moves.forEach((u, i) => {
    const m = pos.parseUci(u);
    if (m === undefined) return;
    if (i > 0) out.push(pos.toSan(m));
    pos.makeMove(m);
  });
  return out;
}

const clock = (ms: number): string => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function RushResult({ rush, minutes }: { rush: { state: RushState; saved: RushScore | null; best: number }; minutes: RushMinutes }) {
  const newBest = rush.saved !== null && rush.saved.solved > 0 && rush.saved.solved >= rush.best;
  return (
    <div className="card" style={{ maxWidth: 560, margin: '0 auto' }} data-testid="rush-result">
      <h1>Puzzle Rush: {minutes} minutes</h1>
      <p className="pz-big">{rush.state.solved} solved</p>
      <p className="muted">{rush.state.strikes >= MAX_STRIKES ? 'Three misses ended the run.' : 'Time ran out.'} {newBest ? 'That is your best score for this length.' : `Your best for ${minutes} minutes is ${rush.best}.`}</p>
      <p className="muted small">Puzzle Rush is practice. It never changes your puzzle rating.</p>
      <div className="btn-row">
        <a className="btn primary" href={`#/puzzles/rush/${minutes}`} onClick={() => setTimeout(() => location.reload(), 0)}>Play again</a>
        <a className="btn" href="#/puzzles">Puzzles home</a>
      </div>
    </div>
  );
}
