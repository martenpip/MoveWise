import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { soundForMove, replaySound } from '../../audio/moveSound';
import { Game } from '../../chess/game';
import { Position } from '../../chess/position';
import { WHITE, parseSquare, type Color } from '../../chess/types';
import { BUILTIN_ENGINE_INFO } from '../../engine/client';
import type { ReviewEvent } from '../../profile/types';
import { reviews as reviewEvents } from '../../profile/training';
import { analyseReview, ENDGAME_MATERIAL, OPENING_PLIES, type CriticalMoment, type PlyAnalysis, type ReviewAnalysis } from '../../review/analyse';
import { CLASS_LABEL, EXPLAIN_LEVELS, TAG_LABEL, explainPly, type ExplainLevel } from '../../review/explain';
import { describeMove, formatLine, type Line } from '../../review/facts';
import { formatEval, pct, plural } from '../../review/format';
import { saveReview } from '../../review/persist';
import { SHOWN_GLYPH, SHOWN_LABEL, SHOWN_SENTENCE, hasBadge, shownClass, type ShownClass } from '../../review/shown';
import { newReview, progressOf, runReview } from '../../review/runner';
import { BLUNDER_AT, INACCURACY_AT, MISTAKE_AT } from '../../review/score';
import { summarise, type GameSummary, type Insight } from '../../review/summary';
import { REVIEW_PRESETS, RULES_ENGINE, searchEngines, type GameReview, type MoveClass, type ReviewPreset, type Side } from '../../review/types';
import type { SavedGame } from '../../storage/types';
import { go, useApp } from '../app';
import { AcademySuggestions } from './AcademySuggestions';
import { Board } from '../Board';
import { ReviewGraph } from '../ReviewGraph';
import { NotebookSummary, SaveMoveToNotebook } from './ReviewPractice';
import { CapturedRow, EvalBar, formatDate, AlignSideToBoard } from '../shared';

/* ------------------------------ small helpers ------------------------------ */

const LEVEL_KEY = 'mw-review-level';
function loadLevel(): ExplainLevel {
  try {
    const v = localStorage.getItem(LEVEL_KEY);
    return v === 'beginner' || v === 'intermediate' || v === 'advanced' ? v : 'beginner';
  } catch {
    return 'beginner';
  }
}
function saveLevel(l: ExplainLevel): void {
  try {
    localStorage.setItem(LEVEL_KEY, l);
  } catch {
    /* storage may be blocked; the choice then lasts for this visit only */
  }
}

const GLYPH: Record<MoveClass, string> = { best: '★', good: '✓', inaccuracy: '?!', mistake: '?', blunder: '??', forced: '•' };

function ClassBadge({ cls }: { cls: ShownClass }) {
  return (
    <span className={`rv-badge cls-${cls}`}>
      <span aria-hidden="true">{SHOWN_GLYPH[cls]}</span> {SHOWN_LABEL[cls]}
    </span>
  );
}

/** Names the engine(s) that really produced a review, never claiming Stockfish unless it was Stockfish. */
export function reviewEngineLabel(engines: readonly string[]): string {
  const names = searchEngines(engines).map((e) => (e === BUILTIN_ENGINE_INFO.name ? 'Built-in engine (not Stockfish)' : e));
  if (names.length === 0) return 'No engine (every position was decided by the rules)';
  return names.length === 1 ? names[0]! : names.join(' and ');
}

const moveName = (p: PlyAnalysis): string => `${Math.ceil(p.ply / 2)}${p.color === 'white' ? '.' : '…'} ${p.san}`;

function duration(positions: number, ms: number): string {
  const s = Math.max(1, Math.round((positions * ms) / 1000));
  return s < 90 ? `${s} seconds` : `${Math.round(s / 60)} minutes`;
}

interface PosView {
  board: Int8Array;
  lastMove: { from: number; to: number } | null;
  checkSquare: number;
  turn: Color;
  fen: string;
}
function posView(fen: string, lastUci: string | null): PosView {
  const pos = new Position(fen);
  const lastMove = lastUci && lastUci.length >= 4 ? { from: parseSquare(lastUci.slice(0, 2)), to: parseSquare(lastUci.slice(2, 4)) } : null;
  return { board: pos.board, lastMove, checkSquare: pos.inCheck() ? pos.kings[pos.turn] : -1, turn: pos.turn, fen };
}

function fenAfterSteps(line: Line, steps: number): { fen: string; last: string | null } {
  const pos = new Position(line.startFen);
  let last: string | null = null;
  for (let i = 0; i < steps && i < line.uci.length; i++) {
    const m = pos.parseUci(line.uci[i]!);
    if (m === undefined) break;
    pos.makeMove(m);
    last = line.uci[i]!;
  }
  return { fen: pos.toFen(), last };
}

interface Variation {
  line: Line;
  label: string;
  step: number;
  /** The move shown on the board when step is 0 (the position the line starts from). */
  baseLast: string | null;
}

const CRITICAL_TEXT: Record<string, string> = {
  blunder: 'Blunder',
  mistake: 'Mistake',
  'missed-mate': 'Missed a forced checkmate',
  'missed-capture': 'Missed a way to win material',
  'allowed-mate': 'Allowed a forced checkmate',
};

/* ------------------------------ the page ------------------------------ */

interface RunState {
  done: number;
  total: number;
  engine: string;
  error: string | null;
}

export function ReviewPage({ id }: { id: string }) {
  const { store, evalEngine, settings, playSound, notifyDataChanged, checkAchievements, dataVersion } = useApp();
  const [record, setRecord] = useState<SavedGame | null | undefined>(undefined);
  const [review, setReview] = useState<GameReview | null | undefined>(undefined);
  const [history, setHistory] = useState<ReviewEvent[]>([]);
  const [run, setRun] = useState<RunState | null>(null);
  const [preset, setPreset] = useState<ReviewPreset>('standard');
  const [chosenSide, setChosenSide] = useState<Side | null | undefined>(undefined);
  const [again, setAgain] = useState(false);
  const [level, setLevel] = useState<ExplainLevel>(loadLevel);
  const [ply, setPly] = useState(0);
  const [flipped, setFlipped] = useState(false);
  // The ply for which the engine's move is being shown. It is drawn on the position BEFORE the move was played, because that is the
  // position the engine chose it in; on the position after, the arrow can point at a move that is not even possible.
  const [showBestAt, setShowBestAt] = useState<number | null>(null);
  const [variation, setVariation] = useState<Variation | null>(null);
  const [tab, setTab] = useState<'summary' | 'move' | 'moves'>('summary');
  const [announce, setAnnounce] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const plyRef = useRef(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abortRef.current?.abort(); // an unfinished review is kept, and can be resumed
    };
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [g, r, act] = await Promise.all([store.getGame(id), store.getReview(id), store.listActivity()]);
        if (!live) return;
        setRecord(g ?? null);
        setReview(r ?? null);
        setHistory(reviewEvents(act).filter((e) => e.gameId !== id));
      } catch (e) {
        if (live) {
          setRecord(null);
          setLoadError(e instanceof Error ? e.message : 'Could not read your saved data.');
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [store, id, dataVersion]);

  /* the game, for sounds and captured pieces */
  const game = useMemo(() => {
    if (!record) return null;
    try {
      const g = new Game(record.startFen);
      for (const u of record.uciMoves) g.playUci(u);
      return g;
    } catch {
      return null;
    }
  }, [record]);

  const analysis: ReviewAnalysis | null = useMemo(() => {
    if (!review?.complete) return null;
    try {
      return analyseReview(review);
    } catch {
      return null;
    }
  }, [review]);

  const summary: GameSummary | null = useMemo(() => (analysis && record ? summarise(analysis, record.result, history, level) : null), [analysis, record, history, level]);

  const side: Side | null = review ? review.perspective : (chosenSide === undefined ? (record?.human ?? null) : chosenSide);

  /* ----- running a review ----- */

  const startRun = useCallback(
    async (base: GameReview, persistPartial: boolean) => {
      const ctl = new AbortController();
      abortRef.current = ctl;
      const label = (r: GameReview) => reviewEngineLabel(r.engines);
      const firstEngine = evalEngine.info.kind === 'stockfish' ? evalEngine.info.name : 'Built-in engine (not Stockfish)';
      setRun({ ...progressOf(base), engine: firstEngine, error: null });
      let lastSaved = progressOf(base).done;
      try {
        const outcome = await runReview(base, {
          engine: evalEngine,
          signal: ctl.signal,
          onProgress: (done, total, r) => {
            if (!mounted.current) return;
            setRun({ done, total, engine: r.engines.length ? label(r) : firstEngine, error: null });
            if (done % 5 === 0) setAnnounce(`Analysed ${done} of ${total} positions`);
            if (persistPartial && done - lastSaved >= 5) {
              lastSaved = done;
              void saveReview(store, { ...r, positions: [...r.positions] }).catch(() => undefined);
            }
          },
        });
        if (outcome === 'complete' || persistPartial) await saveReview(store, base);
        if (!mounted.current) return;
        if (outcome === 'complete') {
          setReview({ ...base, positions: [...base.positions] });
          setAgain(false);
          setPly(0);
          plyRef.current = 0;
          setTab('summary');
          notifyDataChanged();
          void checkAchievements();
        } else if (persistPartial) {
          setReview({ ...base, positions: [...base.positions] });
        }
        setRun(null);
      } catch (e) {
        if (mounted.current) setRun({ ...progressOf(base), engine: 'The engine', error: e instanceof Error ? e.message : String(e) });
      } finally {
        if (abortRef.current === ctl) abortRef.current = null;
      }
    },
    [evalEngine, store, notifyDataChanged, checkAchievements],
  );

  const begin = (resume: boolean) => {
    if (!record) return;
    const settingsFor = REVIEW_PRESETS[preset];
    if (resume && review && !review.complete) {
      void startRun({ ...review, positions: [...review.positions], engines: [...review.engines] }, true);
      return;
    }
    const fresh = newReview({ id: record.id, startFen: record.startFen, uciMoves: record.uciMoves }, { preset: settingsFor.preset, movetimeMs: settingsFor.movetimeMs, depth: settingsFor.depth }, side);
    void startRun(fresh, !review?.complete);
  };

  const stop = () => abortRef.current?.abort();

  /* ----- navigation ----- */

  const total = review?.moves.length ?? 0;
  const goPly = useCallback(
    (to: number, opts?: { quiet?: boolean }) => {
      const target = Math.max(0, Math.min(total, to));
      if (game && !opts?.quiet) {
        const sfx = replaySound(game.moves, plyRef.current, target, settings.sound);
        if (sfx) playSound(sfx);
      }
      plyRef.current = target;
      setPly(target);
      setShowBestAt(null);
      setVariation(null);
      if (target > 0) setTab((t) => (t === 'summary' ? 'move' : t));
    },
    [game, total, settings.sound, playSound],
  );

  const stepVariation = useCallback(
    (delta: number) => {
      setVariation((v) => {
        if (!v) return v;
        const step = Math.max(0, Math.min(v.line.uci.length, v.step + delta));
        if (delta > 0 && step !== v.step && v.line.uci[v.step]) {
          const before = fenAfterSteps(v.line, v.step).fen;
          const d = describeMove(before, v.line.uci[v.step]!);
          if (d && settings.sound.replay) playSound(soundForMove({ capture: d.captured !== 0, castle: d.castle, promotion: d.promotion, check: d.check && !d.checkmate, checkmate: d.checkmate }));
        }
        return { ...v, step };
      });
    },
    [playSound, settings.sound.replay],
  );

  const critical = analysis?.critical ?? [];
  const jumpCritical = (dir: 1 | -1) => {
    if (!critical.length) return;
    const list = dir === 1 ? critical.filter((c) => c.ply > plyRef.current) : [...critical].reverse().filter((c) => c.ply < plyRef.current);
    const target = list[0] ?? (dir === 1 ? critical[0] : critical[critical.length - 1]);
    if (target) {
      goPly(target.ply, { quiet: true });
      setTab('move');
    }
  };

  const nav = useRef({ goPly, stepVariation, variation, total, flip: () => setFlipped((f) => !f) });
  nav.current = { goPly, stepVariation, variation, total, flip: () => setFlipped((f) => !f) };
  useEffect(() => {
    if (!analysis) return;
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input,textarea,select,.board,[role="slider"]')) return;
      const n = nav.current;
      if (e.key === 'ArrowLeft') n.variation ? n.stepVariation(-1) : n.goPly(plyRef.current - 1);
      else if (e.key === 'ArrowRight') n.variation ? n.stepVariation(1) : n.goPly(plyRef.current + 1);
      else if (e.key === 'Home') n.variation ? n.stepVariation(-99) : n.goPly(0);
      else if (e.key === 'End') n.variation ? n.stepVariation(99) : n.goPly(n.total);
      else if (e.key === 'Escape' && n.variation) setVariation(null);
      else if (e.key === 'f') n.flip();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [analysis]);

  useEffect(() => {
    if (record && review === null) setPreset('standard');
  }, [record, review]);

  /* ----- render ----- */

  if (record === undefined || review === undefined) return <p className="muted" role="status">Loading…</p>;
  if (record === null || !game)
    return (
      <div className="card" style={{ maxWidth: 600, margin: '0 auto' }}>
        <h1>Game not found</h1>
        <p className="muted">{loadError ?? 'It may have been deleted, or it could not be read.'}</p>
        <a className="btn" href="#/games">Back to games</a>
      </div>
    );

  const expectedEngine =
    evalEngine.getPreference() === 'stockfish' && evalEngine.hasStockfish && !evalEngine.stockfishProblem
      ? evalEngine.stockfishInfo!.name
      : null;
  const choose = (s: Side | null) => {
    setChosenSide(s);
    if (review) void changeSide(s);
  };
  async function changeSide(s: Side | null) {
    if (!review) return;
    const next: GameReview = { ...review, perspective: s, updatedAt: Date.now() };
    try {
      await saveReview(store, next);
      setReview(next);
      notifyDataChanged();
    } catch {
      /* the choice is kept on screen even if it could not be saved */
      setReview(next);
    }
  }

  const header = (
    <div className="card">
      <a href={`#/games/${record.id}`} className="small">← Back to the game</a>
      <h1 style={{ margin: '6px 0 2px' }}>Game review</h1>
      <p className="muted small" style={{ margin: 0 }}>
        {record.white} vs {record.black} · {formatDate(record.createdAt)} · {plural(Math.ceil(record.uciMoves.length / 2), 'move')} · Result {record.result}
      </p>
    </div>
  );

  /* ----- not ready: set up, or running ----- */
  if (!analysis || !review?.complete || again) {
    const unfinished = review && !review.complete ? progressOf(review) : null;
    const positions = record.uciMoves.length + 1;
    return (
      <div className="stack" style={{ maxWidth: 760, margin: '0 auto' }}>
        {header}
        {record.uciMoves.length === 0 ? (
          <div className="card"><p>This game has no moves, so there is nothing to review.</p></div>
        ) : run ? (
          <RunningCard run={run} onStop={stop} announce={announce} />
        ) : (
          <SetupCard
            record={record}
            positions={positions}
            preset={preset}
            onPreset={setPreset}
            side={side}
            onSide={(s) => setChosenSide(s)}
            expectedEngine={expectedEngine}
            problem={evalEngine.getPreference() === 'builtin' ? 'The Analysis engine is set to the built-in engine in Settings.' : evalEngine.stockfishProblem}
            unfinished={unfinished}
            replacing={again && !!review?.complete}
            onStart={() => begin(false)}
            onResume={() => begin(true)}
            onCancelAgain={again ? () => setAgain(false) : undefined}
          />
        )}
        {review && !review.complete && !run && !again && (
          <p className="muted small">Your progress is saved on this device, so you can leave and come back.</p>
        )}
        {!analysis && review?.complete && !again && (
          <div className="notice error" role="alert">This saved review could not be read. You can analyse the game again.</div>
        )}
      </div>
    );
  }

  /* ----- ready ----- */
  const current: PlyAnalysis | null = ply > 0 ? analysis.plies[ply - 1]! : null;
  const shown: ShownClass | null = current ? shownClass(current) : null;
  const weak = !!current && (current.cls === 'inaccuracy' || current.cls === 'mistake' || current.cls === 'blunder');
  const canShowBest = !variation && weak && !!current!.best && current!.best.uci !== current!.uci;
  const showingBest = canShowBest && showBestAt === ply;
  const view: PosView = (() => {
    if (variation) {
      const r = fenAfterSteps(variation.line, variation.step);
      return posView(r.fen, variation.step === 0 ? variation.baseLast : r.last);
    }
    if (showingBest) return posView(current!.fenBefore, ply > 1 ? analysis.plies[ply - 2]!.uci : null);
    return posView(ply === 0 ? record.startFen : current!.fenAfter, current ? current.uci : null);
  })();
  const nextArrow = variation && variation.line.uci[variation.step] ? variation.line.uci[variation.step]! : null;
  const arrowUci = nextArrow ?? (showingBest ? current!.best!.uci : null);
  const arrows = arrowUci ? [{ from: parseSquare(arrowUci.slice(0, 2)), to: parseSquare(arrowUci.slice(2, 4)), tone: 'best' as const }] : [];
  const badge = !variation && !showingBest && current && shown && hasBadge(shown) ? { sq: current.played.to, cls: shown, glyph: SHOWN_GLYPH[shown] } : null;
  const evalNow = review.positions[showingBest ? ply - 1 : ply]!;
  const topColor: Color = flipped ? WHITE : 1;
  const bottomColor: Color = topColor === WHITE ? 1 : WHITE;
  const nameOf = (c: Color) => (c === WHITE ? record.white : record.black);
  const strip = (c: Color) => {
    const s = analysis.sides[c === WHITE ? 'white' : 'black'];
    return (
      <div className="player-strip">
        <span>
          {nameOf(c)} <span className="muted small">({c === WHITE ? 'White' : 'Black'})</span>
          {s.accuracy !== null && <span className="rv-acc"> · {pct(s.accuracy)} accuracy</span>}
        </span>
        <CapturedRow board={view.board} ofColor={(c ^ 1) as Color} showLeadFor={c} />
      </div>
    );
  };

  return (
    <div className="game-layout">
      <AlignSideToBoard />
      <h1 className="sr-only">{`Review of ${record.white} against ${record.black}`}</h1>
      <div className="board-col">
        <a href={`#/games/${record.id}`} className="small">← Back to the game</a>
        {!variation && (
          <div className="rv-bubble" data-testid="review-bubble" role="status">
            {current && shown ? (
              <>
                <span className={`rv-bub-icon cls-${shown}`} aria-hidden="true">{SHOWN_GLYPH[shown]}</span>
                <div className="rv-bub-text">
                  <b>{showingBest ? `Best was ${current.best!.san}` : `${current.san} ${SHOWN_SENTENCE[shown]}`}</b>
                  <span className="rv-bub-sub">
                    {showingBest ? 'This is the position before your move.' : weak && current.best && current.best.uci !== current.uci ? `The best move was ${current.best.san}.` : shown === 'brilliant' ? 'You gave up material for a stronger position.' : shown === 'best' ? 'The engine’s top choice.' : shown === 'good' ? 'Close to the best move.' : ''}
                  </span>
                </div>
                <span className="rv-pill" aria-label={`Evaluation ${formatEval(evalNow)}`}>{formatEval(evalNow)}</span>
              </>
            ) : (
              <div className="rv-bub-text"><b>Start of the game</b><span className="rv-bub-sub">Use the arrows to step through the moves.</span></div>
            )}
          </div>
        )}
        {strip(topColor)}
        <div className="board-and-eval">
          <EvalBar cp={variation ? null : evalNow.cp} mate={variation ? null : evalNow.mate} flipped={flipped} />
          <div className="board-frame">
            <Board
              board={view.board}
              orientation={flipped ? 'black' : 'white'}
              lastMove={view.lastMove}
              checkSquare={view.checkSquare}
              interactive={false}
              isMovable={() => false}
              destinations={() => []}
              needsPromotion={() => false}
              onMove={() => undefined}
              showLegalMoves={settings.showLegalMoves}
              promoColor={view.turn}
              arrows={arrows}
              badge={badge}
              ariaLabel={variation ? `Preview of ${variation.label}, step ${variation.step} of ${variation.line.uci.length}` : `Review of ${record.white} versus ${record.black}, move ${ply} of ${total}${current ? `, ${current.san}, ${SHOWN_LABEL[shownClass(current)]}` : ''}`}
            />
          </div>
        </div>
        {strip(bottomColor)}

        {variation ? (
          <div className="rv-variation" role="group" aria-label="Previewing a line">
            <div className="grow">
              <b>{variation.label}</b>
              <div className="muted small">Step {variation.step} of {variation.line.uci.length}. This is the engine’s line, not the game.</div>
            </div>
            <button className="btn small" type="button" onClick={() => stepVariation(-1)} disabled={variation.step === 0} aria-label="Previous step">◀</button>
            <button className="btn small" type="button" onClick={() => stepVariation(1)} disabled={variation.step >= variation.line.uci.length} aria-label="Next step">▶</button>
            <button className="btn small primary" type="button" onClick={() => setVariation(null)}>Back to the game</button>
          </div>
        ) : (
          <div className="btn-row rv-nav">
            <button className="btn small" type="button" onClick={() => goPly(0)} disabled={ply === 0} aria-label="Start of the game">{'|<'}</button>
            <button className="btn small" type="button" onClick={() => goPly(ply - 1)} disabled={ply === 0} aria-label="Previous move">◀</button>
            <button className="btn small" type="button" onClick={() => goPly(ply + 1)} disabled={ply === total} aria-label="Next move">▶</button>
            <button className="btn small" type="button" onClick={() => goPly(total)} disabled={ply === total} aria-label="End of the game">{'>|'}</button>
            <button className="btn small" type="button" onClick={() => jumpCritical(-1)} disabled={!critical.length}>◀ Key moment</button>
            <button className="btn small" type="button" onClick={() => jumpCritical(1)} disabled={!critical.length}>Key moment ▶</button>
            <button className="btn small" type="button" onClick={() => setFlipped((f) => !f)}>Flip</button>
            {canShowBest && (
              <button className="btn small primary" type="button" data-testid="review-show-best" aria-pressed={showingBest} onClick={() => setShowBestAt(showingBest ? null : ply)}>
                {showingBest ? 'Back to the move' : 'Show best move'}
              </button>
            )}
          </div>
        )}

        <ReviewGraph series={analysis.winSeries} plies={analysis.plies} positions={review.positions as NonNullable<GameReview['positions'][number]>[]} current={ply} onSelect={(p) => goPly(p, { quiet: true })} />
      </div>

      <aside className="stack" aria-label="Review panel">
        <div className="card rv-head">
          <p className="rv-engine" data-testid="review-engine">
            <b>Analysed on this device by {reviewEngineLabel(analysis.engines)}.</b>
          </p>
          <p className="muted small">
            {REVIEW_PRESETS[review.settings.preset].label} review{analysis.meanDepth !== null ? ` · average depth ${analysis.meanDepth.toFixed(0)}` : ''} · {formatDate(review.updatedAt)} · nothing was sent anywhere.
          </p>
          <div className="rv-levels" role="group" aria-label="Explanation level">
            <span className="muted small">Explain at</span>
            <div className="seg">
              {EXPLAIN_LEVELS.map((l) => (
                <button key={l.id} type="button" aria-pressed={level === l.id} title={l.hint} onClick={() => { setLevel(l.id); saveLevel(l.id); }}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="seg rv-tabs" role="group" aria-label="Review sections">
          <button type="button" aria-pressed={tab === 'summary'} onClick={() => setTab('summary')}>Summary</button>
          <button type="button" aria-pressed={tab === 'move'} onClick={() => setTab('move')}>This move</button>
          <button type="button" aria-pressed={tab === 'moves'} onClick={() => setTab('moves')}>All moves</button>
        </div>

        {tab === 'summary' && summary && (
          <SummaryPanel
            analysis={analysis}
            summary={summary}
            side={side}
            onSide={choose}
            onJump={(p) => { goPly(p, { quiet: true }); setTab('move'); }}
            critical={critical}
            review={review}
          />
        )}
        {tab === 'summary' && summary && record && <NotebookSummary analysis={analysis} game={record} />}

        {tab === 'move' && (
          <MovePanel
            record={record}
            plyAnalysis={current}
            analysis={analysis}
            level={level}
            perspective={side}
            fen={view.fen}
            onPreview={(line, label, baseLast) => { setVariation({ line, label, step: 0, baseLast }); }}
            critical={critical}
            onJump={(p) => goPly(p, { quiet: true })}
            evalText={formatEval(evalNow)}
          />
        )}

        {tab === 'moves' && (
          <div className="card">
            <h2 style={{ marginTop: 0 }}>All moves</h2>
            <ReviewMoveList plies={analysis.plies} current={ply} onSelect={(p) => { goPly(p); setTab('move'); }} />
            <p className="muted small" style={{ marginTop: 8 }}>
              <span className="rv-glyph cls-inaccuracy">?!</span> inaccuracy · <span className="rv-glyph cls-mistake">?</span> mistake · <span className="rv-glyph cls-blunder">??</span> blunder · <span className="rv-glyph cls-best">★</span> found a winning idea
            </p>
          </div>
        )}

        <Method review={review} analysis={analysis} />

        <div className="card">
          <div className="btn-row">
            <button className="btn small" type="button" onClick={() => { setAgain(true); setVariation(null); }}>Analyse again…</button>
            <button
              className="btn small danger"
              type="button"
              onClick={async () => {
                if (!window.confirm('Delete this review from this device? The game itself is kept.')) return;
                await store.deleteReview(record.id);
                notifyDataChanged();
                go(`/games/${record.id}`);
              }}
            >
              Delete review
            </button>
          </div>
        </div>
        <div className="sr-only" aria-live="polite">{announce}</div>
      </aside>
    </div>
  );
}

/* ------------------------------ set-up and progress ------------------------------ */

function SetupCard({
  record, positions, preset, onPreset, side, onSide, expectedEngine, problem, unfinished, replacing, onStart, onResume, onCancelAgain,
}: {
  record: SavedGame;
  positions: number;
  preset: ReviewPreset;
  onPreset: (p: ReviewPreset) => void;
  side: Side | null;
  onSide: (s: Side | null) => void;
  expectedEngine: string | null;
  problem: string | null;
  unfinished: { done: number; total: number } | null;
  replacing: boolean;
  onStart: () => void;
  onResume: () => void;
  onCancelAgain?: () => void;
}) {
  return (
    <section className="card" aria-labelledby="h-rv-setup">
      <h2 id="h-rv-setup">{replacing ? 'Analyse this game again' : 'Review this game'}</h2>
      <p>
        Game Review runs a chess engine over every position of this game, on this device, and then shows where the game was decided, what each move did and what to learn from it.
        It needs no internet and sends nothing anywhere.
      </p>
      <p className="rv-engine-line" data-testid="review-engine-expected">
        <b>Engine:</b> {expectedEngine ?? 'Built-in engine (not Stockfish)'}
      </p>
      {!expectedEngine && (
        <div className="notice" role="note">
          <b>Stockfish is not being used.</b> {problem ?? 'It is not available.'} The built-in engine is much weaker, so its verdicts are rougher. {' '}
          <a href="#/settings">Engine settings</a>
        </div>
      )}
      <h3>How thorough?</h3>
      <div className="choice-grid" role="group" aria-label="Review depth">
        {(Object.keys(REVIEW_PRESETS) as ReviewPreset[]).map((p) => (
          <button key={p} type="button" className="choice" aria-pressed={preset === p} onClick={() => onPreset(p)}>
            <b>{REVIEW_PRESETS[p].label}</b>
            <span className="muted small">{REVIEW_PRESETS[p].hint}</span>
            <span className="muted small">at most {duration(positions, REVIEW_PRESETS[p].movetimeMs)}</span>
          </button>
        ))}
      </div>
      <h3>Whose moves is this about?</h3>
      <div className="seg" role="group" aria-label="Which side you played">
        <button type="button" aria-pressed={side === 'white'} onClick={() => onSide('white')}>I played White</button>
        <button type="button" aria-pressed={side === 'black'} onClick={() => onSide('black')}>I played Black</button>
        <button type="button" aria-pressed={side === null} onClick={() => onSide(null)}>Not my game</button>
      </div>
      <p className="muted small">
        {record.human ? 'Taken from the game.' : 'MoveWise cannot know who you were in an imported game.'} Your summary and your Profile statistics are about your side only. For “Not my game” both sides are shown and nothing is added to your Profile.
      </p>
      <div className="btn-row" style={{ marginTop: 14 }}>
        {unfinished && unfinished.done > 0 && (
          <button className="btn primary" type="button" onClick={onResume}>Resume ({unfinished.done} of {unfinished.total} done)</button>
        )}
        <button className={`btn ${unfinished && unfinished.done > 0 ? '' : 'primary'}`} type="button" onClick={onStart}>
          {unfinished && unfinished.done > 0 ? 'Start over' : replacing ? 'Analyse again' : 'Start review'}
        </button>
        {onCancelAgain && <button className="btn" type="button" onClick={onCancelAgain}>Keep the current review</button>}
      </div>
      {replacing && <p className="muted small">The current review stays until the new one is finished.</p>}
    </section>
  );
}

function RunningCard({ run, onStop, announce }: { run: RunState; onStop: () => void; announce: string }) {
  if (run.error) {
    return (
      <section className="card" aria-labelledby="h-rv-run">
        <h2 id="h-rv-run">The review stopped</h2>
        <div className="notice error" role="alert">{run.error}</div>
        <p className="muted small">What was analysed so far is saved. Go back and choose Resume to continue.</p>
        <a className="btn" href="#/games">Back to games</a>
      </section>
    );
  }
  return (
    <section className="card" aria-labelledby="h-rv-run">
      <h2 id="h-rv-run">Analysing…</h2>
      <p data-testid="review-progress-text">
        Position {Math.min(run.done + 1, run.total)} of {run.total} · {run.engine}
      </p>
      <progress className="rv-progress" max={run.total} value={run.done} aria-label="Review progress" />
      <p className="muted small">Everything happens on this device. You can stop at any time; what is done is kept.</p>
      <div className="btn-row">
        <button className="btn" type="button" onClick={onStop}>Stop and keep progress</button>
      </div>
      <div className="sr-only" aria-live="polite">{announce}</div>
    </section>
  );
}

/* ------------------------------ summary ------------------------------ */

function SummaryPanel({
  analysis, summary, side, onSide, onJump, critical, review,
}: {
  analysis: ReviewAnalysis;
  summary: GameSummary;
  side: Side | null;
  onSide: (s: Side | null) => void;
  onJump: (ply: number) => void;
  critical: CriticalMoment[];
  review: GameReview;
}) {
  const me = side ? analysis.sides[side] : null;
  const f = (v: number | null, d = 0) => (v === null ? '—' : v.toFixed(d));
  const insight = (i: Insight) => (
    <li key={i.id}>
      <span className="grow">{i.text}</span>
      {i.ply ? <button className="btn small" type="button" onClick={() => onJump(i.ply!)}>Show</button> : null}
    </li>
  );
  const sideRow = (label: string, get: (s: ReviewAnalysis['sides']['white']) => string) => (
    <tr>
      <th scope="row">{label}</th>
      <td>{get(analysis.sides.white)}</td>
      <td>{get(analysis.sides.black)}</td>
    </tr>
  );
  const critText = (c: CriticalMoment): string => {
    const p = analysis.plies[c.ply - 1]!;
    if (c.kind === 'opponent-error') {
      return `Opponent’s ${CLASS_LABEL[p.cls].toLowerCase()} at ${moveName(p)}: ${c.exploited ? 'you took advantage of it' : 'it was not taken advantage of'}`;
    }
    const who = side === null ? `${p.color === 'white' ? 'White' : 'Black'}: ` : '';
    return `${who}${CRITICAL_TEXT[c.kind]} at ${moveName(p)}`;
  };

  return (
    <>
      <section className="card" aria-labelledby="h-rv-sum">
        <h2 id="h-rv-sum">Summary</h2>
        <p className="rv-headline" data-testid="review-headline">{summary.headline}</p>
        {me && me.accuracy !== null && me.acpl !== null && (
          <dl className="tiles">
            <div className="tile"><dt>Accuracy</dt><dd data-testid="review-accuracy">{pct(me.accuracy)}</dd></div>
            <div className="tile"><dt>Avg. centipawn loss</dt><dd>{f(me.acpl)}</dd></div>
            <div className="tile"><dt>Engine’s first choice</dt><dd>{me.engineMatches}/{me.judged}</dd></div>
            <div className="tile"><dt>Blunders</dt><dd>{me.counts.blunder}</dd></div>
            <div className="tile"><dt>Mistakes</dt><dd>{me.counts.mistake}</dd></div>
            <div className="tile"><dt>Inaccuracies</dt><dd>{me.counts.inaccuracy}</dd></div>
          </dl>
        )}
        {summary.comparison && <p className="muted">{summary.comparison}</p>}
        {summary.caveats.map((c) => <div key={c} className="notice" role="note">{c}</div>)}
        {side === null && (
          <>
            <p className="muted small">Which side did you play? Your personal summary and Profile statistics are about your own moves.</p>
            <div className="seg" role="group" aria-label="Which side you played">
              <button type="button" aria-pressed={false} onClick={() => onSide('white')}>I played White</button>
              <button type="button" aria-pressed={false} onClick={() => onSide('black')}>I played Black</button>
            </div>
          </>
        )}
      </section>

      <section className="card rv-lesson" aria-labelledby="h-rv-lesson">
        <h2 id="h-rv-lesson">{summary.lesson.title}</h2>
        {summary.lesson.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
        {summary.lesson.tip && <p className="rv-tip"><b>Tip:</b> {summary.lesson.tip}</p>}
        {summary.lesson.ply !== null && <button className="btn small" type="button" onClick={() => onJump(summary.lesson.ply!)}>Show this move</button>}
      </section>

      <AcademySuggestions gameId={review.gameId} />

      {(summary.strengths.length > 0 || summary.weaknesses.length > 0) && (
        <section className="card" aria-labelledby="h-rv-sw">
          <h2 id="h-rv-sw">Strengths and weaknesses</h2>
          {summary.strengths.length > 0 && (
            <>
              <h3>What went well</h3>
              <ul className="list">{summary.strengths.map(insight)}</ul>
            </>
          )}
          {summary.weaknesses.length > 0 && (
            <>
              <h3>What to work on</h3>
              <ul className="list">{summary.weaknesses.map(insight)}</ul>
            </>
          )}
          {summary.recurring.length > 0 && <ul className="list">{summary.recurring.map(insight)}</ul>}
          <p className="rv-focus"><b>{summary.focus}</b></p>
        </section>
      )}
      {summary.strengths.length === 0 && summary.weaknesses.length === 0 && <p className="rv-focus card"><b>{summary.focus}</b></p>}

      {critical.length > 0 && (
        <section className="card" aria-labelledby="h-rv-key">
          <h2 id="h-rv-key">Key moments</h2>
          <ul className="list">
            {critical.map((c) => (
              <li key={c.ply}>
                <span className="grow">{critText(c)}</span>
                <button className="btn small" type="button" onClick={() => onJump(c.ply)}>Show</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card" aria-labelledby="h-rv-both">
        <h2 id="h-rv-both">Both players</h2>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
          <table>
            <thead><tr><th scope="col"><span className="sr-only">Measure</span></th><th scope="col">White</th><th scope="col">Black</th></tr></thead>
            <tbody>
              {sideRow('Accuracy', (s) => (s.accuracy === null ? '—' : pct(s.accuracy)))}
              {sideRow('Avg. centipawn loss', (s) => f(s.acpl))}
              {sideRow('Best moves', (s) => String(s.counts.best))}
              {sideRow('Good moves', (s) => String(s.counts.good))}
              {sideRow('Inaccuracies', (s) => String(s.counts.inaccuracy))}
              {sideRow('Mistakes', (s) => String(s.counts.mistake))}
              {sideRow('Blunders', (s) => String(s.counts.blunder))}
              {sideRow(`Opening loss (to move ${OPENING_PLIES / 2})`, (s) => f(s.phases.opening.acpl))}
              {sideRow('Middlegame loss', (s) => f(s.phases.middlegame.acpl))}
              {sideRow('Endgame loss', (s) => f(s.phases.endgame.acpl))}
            </tbody>
          </table>
        </div>
        <p className="muted small">
          Loss is in centipawns (100 = one pawn); lower is better. A dash means the side made fewer than 3 decisions in that phase, which is too few to report. Forced moves are not counted.
          {review.complete ? '' : ''}
        </p>
      </section>
    </>
  );
}

/* ------------------------------ this move ------------------------------ */

function MovePanel({
  plyAnalysis, analysis, level, perspective, fen, onPreview, critical, onJump, evalText, record,
}: {
  record: SavedGame | null | undefined;
  plyAnalysis: PlyAnalysis | null;
  analysis: ReviewAnalysis;
  level: ExplainLevel;
  perspective: Side | null;
  fen: string;
  onPreview: (line: Line, label: string, baseLast: string | null) => void;
  critical: CriticalMoment[];
  onJump: (ply: number) => void;
  evalText: string;
}) {
  if (!plyAnalysis) {
    return (
      <section className="card" aria-labelledby="h-rv-move">
        <h2 id="h-rv-move">This move</h2>
        <p className="muted">Choose a move on the graph, in the list or with the arrow keys to see what it did.</p>
        {critical.length > 0 && <button className="btn small" type="button" onClick={() => onJump(critical[0]!.ply)}>Go to the first key moment</button>}
      </section>
    );
  }
  const ex = explainPly(plyAnalysis, level, analysis, perspective);
  const prevLast = plyAnalysis.ply > 1 ? analysis.plies[plyAnalysis.ply - 2]!.uci : null;
  return (
    <section className="card" aria-labelledby="h-rv-move">
      <h2 id="h-rv-move" style={{ marginBottom: 6 }}>
        <span className="rv-movename">{moveName(plyAnalysis)}</span> <ClassBadge cls={shownClass(plyAnalysis)} />
      </h2>
      <h3 className="rv-headline-move" data-testid="review-move-headline">{ex.headline}</h3>
      {ex.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
      {plyAnalysis.tags.length > 0 && (
        <p className="rv-tags">{plyAnalysis.tags.map((t) => <span key={t} className="rv-tag">{TAG_LABEL[t]}</span>)}</p>
      )}
      {ex.lines.map((l) => (
        <div key={l.id} className="rv-line-card">
          <div className="muted small">{l.label}</div>
          <p className="pv">{formatLine(l.line, 8)}</p>
          <button
            className="btn small"
            type="button"
            onClick={() => onPreview(l.line, `${l.label}: ${formatLine(l.line, 3)}…`, l.id === 'best' ? prevLast : plyAnalysis.uci)}
          >
            Preview on the board
          </button>
        </div>
      ))}
      {ex.tip && <p className="rv-tip"><b>Tip:</b> {ex.tip}</p>}
      {record && <SaveMoveToNotebook analysis={analysis} ply={plyAnalysis.ply} game={record} />}
      <p className="muted small">
        Evaluation after this move: <b>{evalText}</b> (White’s view). {ex.engineNote}
      </p>
      <p className="small">
        <a href={`#/analysis?fen=${encodeURIComponent(fen)}`}>Open this position in the Analysis board</a>
      </p>
    </section>
  );
}

function ReviewMoveList({ plies, current, onSelect }: { plies: PlyAnalysis[]; current: number; onSelect: (ply: number) => void }) {
  const mark = (p: PlyAnalysis) => {
    if (p.brilliant) return SHOWN_GLYPH.brilliant;
    if (p.cls === 'inaccuracy' || p.cls === 'mistake' || p.cls === 'blunder') return GLYPH[p.cls];
    if (p.tags.includes('found-mate') || p.tags.includes('found-tactic')) return GLYPH.best;
    return '';
  };
  const cell = (p: PlyAnalysis) => (
    <button key={`m${p.ply}`} type="button" aria-current={current === p.ply} aria-label={`${moveName(p)}, ${SHOWN_LABEL[shownClass(p)]}`} onClick={() => onSelect(p.ply)}>
      {p.san}
      {mark(p) && <span className={`rv-glyph cls-${p.brilliant ? 'brilliant' : p.cls === 'best' ? 'best' : p.cls}`} aria-hidden="true"> {mark(p)}</span>}
    </button>
  );
  const rows = [];
  for (let i = 0; i < plies.length; i += 2) {
    rows.push(<div key={`n${i}`} className="num">{i / 2 + 1}.</div>, cell(plies[i]!), plies[i + 1] ? cell(plies[i + 1]!) : <span key={`e${i}`} />);
  }
  return <div className="movelist" role="group" aria-label="Move list with verdicts">{rows}</div>;
}

/* ------------------------------ method ------------------------------ */

function Method({ review, analysis }: { review: GameReview; analysis: ReviewAnalysis }) {
  const budget = review.settings.movetimeMs / 1000;
  return (
    <details className="card rv-method">
      <summary><b>How these numbers are calculated</b></summary>
      <p>
        <b>The engine.</b> Every position of the game was searched by {reviewEngineLabel(analysis.engines)} for up to {budget.toFixed(1)} seconds (it stops sooner when it has looked as deep as it was asked to), and its score, preferred move and expected line were stored.
        {analysis.engines.includes(RULES_ENGINE) ? ' A position where the game had ended (checkmate, stalemate, a draw rule) is scored by the rules of chess instead.' : ''} Nothing else is stored or sent anywhere. Scores here are from White’s point of view.
      </p>
      <p>
        <b>Win chance.</b> A score in centipawns (100 = one pawn) is turned into a chance of winning with the same logistic curve Lichess publishes: 50 + 50 × (2 / (1 + e<sup>−0.00368208 × centipawns</sup>) − 1).
        A move’s <b>loss</b> is how many points of win chance it gave up compared with the engine’s best, measured from your side.
      </p>
      <table>
        <thead><tr><th scope="col">Verdict</th><th scope="col">Points of win chance lost</th></tr></thead>
        <tbody>
          <tr><th scope="row">Best</th><td>the engine’s first choice, or within 1</td></tr>
          <tr><th scope="row">Good</th><td>under {INACCURACY_AT}</td></tr>
          <tr><th scope="row">Inaccuracy</th><td>{INACCURACY_AT} to under {MISTAKE_AT}</td></tr>
          <tr><th scope="row">Mistake</th><td>{MISTAKE_AT} to under {BLUNDER_AT}</td></tr>
          <tr><th scope="row">Blunder</th><td>{BLUNDER_AT} or more</td></tr>
        </tbody>
      </table>
      <p className="muted small">These thresholds are MoveWise’s own. A move that is the only legal one is never judged.</p>
      <p>
        <b>Accuracy.</b> Each move gets 103.1668 × e<sup>−0.04354 × (win chance lost)</sup> − 3.1669, limited to 0–100 (the Lichess formula). A game’s accuracy is the average of two things: the moves’ mean weighted by how swingy the position was, and their harmonic mean, which lets a few bad moves count for more than in a plain average.
        It is an estimate for comparing your own games over time. It is not a rating and not comparable with other sites’ numbers.
      </p>
      <p>
        <b>Average centipawn loss.</b> The mean of the centipawns each of your moves gave up, with every score limited to ±1000 first so one mate does not dominate. Lower is better.
      </p>
      <p>
        <b>Phases.</b> The opening is the first {OPENING_PLIES / 2} moves of each side. The endgame starts once all pieces other than pawns and kings are worth {ENDGAME_MATERIAL} points or less together (queen 9, rook 5, bishop and knight 3) and stays an endgame. Everything between is the middlegame.
      </p>
      <p>
        <b>What the notes say.</b> “Left a piece to be captured”, “Lost material”, “Missed a way to win material”, forced mates and “Gave away an advantage” appear only when the engine’s own stored line, checked by the rules of chess, shows it. If no such fact exists, the explanation says only what the engine preferred and shows its line.
      </p>
      <p className="muted small">
        <b>Limits.</b> Each position is searched for a single best line. A move is judged by comparing the engine’s score before and after it, so other good moves are not listed, and a shallow search can miss something. Treat every verdict as a strong hint.
      </p>
    </details>
  );
}
