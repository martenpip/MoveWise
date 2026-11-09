import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Position } from '../../chess/position';
import { moveFrom, moveTo, movePromo, moveToUci, type Color } from '../../chess/types';
import { soundForMove } from '../../audio/moveSound';
import { CURRICULUM_INDEX } from '../../academy/curriculum';
import { judgeMove, MAX_HINT, hintFor, type Evaluator, type Judgement } from '../../notebook/exercise';
import { insightsFrom } from '../../notebook/insights';
import { recordAttempt, removeEntry } from '../../notebook/service';
import { DAY_MS, daysUntilDue, gradeFor, type Attempt, sessionQueue, statusOf } from '../../notebook/srs';
import { KIND_LABEL, STATUS_LABEL, type NotebookEntry, type NotebookStatus } from '../../notebook/types';
import { themeLabel } from '../../puzzles/themes';
import { describeMove } from '../../review/facts';
import { go, useApp } from '../app';
import { Board } from '../Board';
import { formatDate } from '../shared';

/* ------------------------------ data ------------------------------ */

function useNotebook() {
  const { store, dataVersion } = useApp();
  const [entries, setEntries] = useState<NotebookEntry[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    store
      .listNotebook()
      .then((e) => live && (setEntries(e), setError(false)))
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [store, dataVersion]);
  return { entries, error };
}

const dueText = (e: NotebookEntry, now: number): string => {
  const d = daysUntilDue(e, now);
  if (d === 0) return 'Due today';
  return d === 1 ? 'Due tomorrow' : `Due in ${d} days`;
};

const nextText = (e: NotebookEntry, now: number): string => {
  if (e.srs.due - now <= 15 * 60_000) return 'You will see it again shortly.';
  const d = Math.round((e.srs.due - now) / DAY_MS);
  return d <= 1 ? 'You will see it again tomorrow.' : `You will see it again in ${d} days.`;
};

/* ------------------------------ exercise ------------------------------ */

interface ExerciseProps {
  entry: NotebookEntry;
  /** Called once the attempt has been recorded and the person chooses to continue. */
  onNext: (() => void) | null;
  nextLabel?: string;
}

type Phase = 'playing' | 'solved' | 'revealed';

export function Exercise({ entry, onNext, nextLabel = 'Next' }: ExerciseProps) {
  const { store, evalEngine, settings, playSound, notifyDataChanged, toast } = useApp();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const pos = useMemo(() => new Position(entry.fen), [entry.fen]);
  const legal = useMemo(() => pos.legalMoves(), [pos]);
  const [shown, setShown] = useState<{ fen: string; from: number; to: number } | null>(null);
  const [phase, setPhase] = useState<Phase>('playing');
  const [wrong, setWrong] = useState(0);
  const [hints, setHints] = useState<0 | 1 | 2 | 3>(0);
  const [message, setMessage] = useState<{ kind: 'info' | 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<NotebookEntry | null>(null);
  const [engineMissing, setEngineMissing] = useState(false);

  const view = useMemo(() => (shown ? new Position(shown.fen) : pos), [shown, pos]);
  const bestMove = useMemo(() => describeMove(entry.fen, entry.best.uci), [entry]);

  const evaluator: Evaluator = useCallback(
    async (fen, moves) => {
      try {
        const r = await evalEngine.evaluate({ startFen: fen, moves, depth: 14, maxTimeMs: 700 });
        return { cp: r.scoreCp, mate: r.mate };
      } catch {
        setEngineMissing(true);
        return null;
      }
    },
    [evalEngine],
  );

  const finish = useCallback(
    async (attempt: Attempt, alt?: string) => {
      try {
        const next = await recordAttempt(store, entry.id, attempt, Date.now(), alt);
        if (!mounted.current) return;
        if (next) setResult(next);
        notifyDataChanged();
      } catch {
        toast('This result could not be saved on this device.', 'error');
      }
    },
    [store, entry.id, notifyDataChanged, toast],
  );

  const sound = (fen: string, uci: string) => {
    const d = describeMove(fen, uci);
    if (d) playSound(soundForMove({ capture: d.captured !== 0, castle: d.castle, promotion: d.promotion, check: d.check && !d.checkmate, checkmate: d.checkmate }));
  };

  async function onMove(from: number, to: number, promo: number) {
    if (phase !== 'playing' || busy) return;
    const m = legal.find((x) => moveFrom(x) === from && moveTo(x) === to && (movePromo(x) === 0 || movePromo(x) === promo));
    if (m === undefined) return;
    const uci = moveToUci(m);
    const after = new Position(entry.fen);
    after.makeMove(m);
    setShown({ fen: after.toFen(), from, to });
    sound(entry.fen, uci);
    setBusy(true);
    setMessage({ kind: 'info', text: 'Checking your move…' });
    const verdict: Judgement = await judgeMove(entry, uci, evaluator);
    if (!mounted.current) return;
    setBusy(false);
    if (verdict.kind === 'best' || verdict.kind === 'acceptable') {
      setPhase('solved');
      setMessage({
        kind: 'ok',
        text: verdict.kind === 'best' ? 'Correct. That is the move the engine recommended.' : 'A good alternative. It keeps nearly the same evaluation as the engine’s choice, so it counts.',
      });
      await finish({ wrong, hints, solved: true, revealed: false }, verdict.kind === 'acceptable' && verdict.via === 'engine' ? uci : undefined);
      return;
    }
    playSound('error');
    setWrong((w) => w + 1);
    setShown(null);
    const why =
      verdict.reason === 'played-again'
        ? 'That is the move from your game, and it is the mistake. Try something different.'
        : verdict.reason === 'worse'
          ? 'That move gives away too much compared with the best one. Look again.'
          : 'That is not the move the engine recommended, and it could not be checked further right now. You can try again, ask for a hint, or reveal the answer.';
    setMessage({ kind: 'error', text: why });
  }

  function hint() {
    setHints((h) => (h >= MAX_HINT ? h : ((h + 1) as 1 | 2 | 3)));
  }

  async function reveal() {
    if (phase !== 'playing') return;
    setPhase('revealed');
    setMessage({ kind: 'info', text: `The recommended move is ${entry.best.san}.` });
    await finish({ wrong, hints, solved: false, revealed: true });
  }

  function retry() {
    setShown(null);
    setMessage(null);
  }

  const shownHints = Array.from({ length: hints }, (_, i) => hintFor(entry, (i + 1) as 1 | 2 | 3));
  const hintSquare = hints >= 3 ? (shownHints[2]?.square ?? null) : null;
  const done = phase !== 'playing';
  const whiteToMove = entry.sideToMove === 'white';
  const highlights = [
    ...(hintSquare !== null ? [{ sq: hintSquare, tone: 'hint' as const }] : []),
    ...(shown && phase === 'playing' && wrong >= 0 && message?.kind === 'error' ? [{ sq: shown.to, tone: 'bad' as const }] : []),
  ];
  const arrows = done && bestMove ? [{ from: bestMove.from, to: bestMove.to, tone: 'best' as const }] : [];
  const now = Date.now();

  return (
    <div className="nb-exercise" data-testid="nb-exercise">
      <div className="nb-board">
        <div className="board-frame">
          <Board
            board={view.board}
            orientation={entry.sideToMove}
            lastMove={shown ? { from: shown.from, to: shown.to } : null}
            checkSquare={-1}
            interactive={!done && !busy}
            isMovable={(s) => view.board[s] !== 0 && (view.board[s]! >> 3) === view.turn && view.turn === (whiteToMove ? 0 : 1)}
            destinations={(s) => legal.filter((m) => moveFrom(m) === s).map((m) => moveTo(m))}
            needsPromotion={(f, t) => legal.some((m) => moveFrom(m) === f && moveTo(m) === t && movePromo(m) !== 0)}
            onMove={(f, t, p) => void onMove(f, t, p)}
            onSound={(k) => playSound(k === 'select' ? 'select' : 'illegal')}
            showLegalMoves={settings.showLegalMoves}
            promoColor={view.turn as Color}
            highlights={highlights}
            arrows={arrows}
            ariaLabel={`Notebook position. ${whiteToMove ? 'White' : 'Black'} to move. Find the best move.`}
          />
        </div>
      </div>
      <div className="nb-panel">
        <p className="muted small" style={{ margin: 0 }}>
          {whiteToMove ? 'White' : 'Black'} to move{entry.origin.opponent ? `, from your game against ${entry.origin.opponent}` : ''}. Find the best move.
        </p>
        {message && (
          <p role="status" className={`nb-msg ${message.kind}`} data-testid="nb-message">
            <strong>{message.kind === 'ok' ? 'Correct. ' : message.kind === 'error' ? 'Not quite. ' : ''}</strong>
            {message.text}
          </p>
        )}
        {engineMissing && <p className="muted small">The engine could not check alternatives just now, so only the stored best move is accepted.</p>}
        {shownHints.length > 0 && (
          <ol className="nb-hints" aria-label="Hints">
            {shownHints.map((h) => (
              <li key={h.level}>
                <span className="muted small">Hint {h.level} of {MAX_HINT}</span>
                <div>{h.text}</div>
              </li>
            ))}
          </ol>
        )}
        {!done && (
          <div className="btn-row">
            <button className="btn" type="button" onClick={hint} disabled={hints >= MAX_HINT || busy}>
              {hints === 0 ? 'Give me a hint' : hints < MAX_HINT ? 'Another hint' : 'No more hints'}
            </button>
            {message?.kind === 'error' && (
              <button className="btn" type="button" onClick={retry}>
                Try again
              </button>
            )}
            <button className="btn" type="button" onClick={() => void reveal()} disabled={busy}>
              Show the answer
            </button>
          </div>
        )}
        {done && (
          <div className="nb-explain" data-testid="nb-explain">
            <h3 style={{ marginBottom: 4 }}>The idea</h3>
            <p>
              The recommended move is <strong>{entry.best.san}</strong>
              {entry.best.lineSan ? ` (line: ${entry.best.lineSan})` : ''}. {entry.explanation}
            </p>
            {entry.played && <p className="muted small">In your game you played {entry.played.san}.</p>}
            {result && (
              <p className="muted small" data-testid="nb-next">
                Result: {gradeFor({ wrong, hints, solved: phase === 'solved', revealed: phase === 'revealed' }) === 'failed' ? 'needs more practice' : 'recalled'}. {nextText(result, now)}
              </p>
            )}
            <div className="btn-row">
              {onNext && (
                <button className="btn primary" type="button" onClick={onNext} autoFocus>
                  {nextLabel}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ list ------------------------------ */

type View = 'all' | 'due' | 'upcoming' | 'recent' | 'retained' | 'needs-practice';
const VIEWS: Array<{ id: View; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'due', label: 'Due' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'recent', label: 'Recent' },
  { id: 'retained', label: 'Retained' },
  { id: 'needs-practice', label: 'Needs practice' },
];

function inView(view: View, e: NotebookEntry, now: number): boolean {
  const st = statusOf(e, now);
  switch (view) {
    case 'all':
      return true;
    case 'due':
      return st === 'due' || st === 'new' || (st === 'needs-practice' && e.srs.due <= now + DAY_MS);
    case 'upcoming':
      return st === 'upcoming' || st === 'learning';
    case 'recent':
      return now - e.savedAt <= 14 * DAY_MS;
    case 'retained':
      return st === 'retained';
    case 'needs-practice':
      return st === 'needs-practice';
  }
}

const DATE_RANGES = [
  { id: 'any', label: 'Any date', days: 0 },
  { id: '7', label: 'Last 7 days', days: 7 },
  { id: '30', label: 'Last 30 days', days: 30 },
  { id: '90', label: 'Last 90 days', days: 90 },
];

function EntryRow({ e, now }: { e: NotebookEntry; now: number }) {
  const st = statusOf(e, now);
  const themes = e.themes.map(themeLabel);
  return (
    <li>
      <div className="grow">
        <a href={`#/notebook/e/${encodeURIComponent(e.id)}`} data-testid="nb-row">
          <strong>
            {e.sideToMove === 'white' ? 'White' : 'Black'} to move, move {e.moveNumber}
          </strong>
        </a>
        <div className="muted small">
          {KIND_LABEL[e.kind]}
          {e.played ? `. You played ${e.played.san}, the engine preferred ${e.best.san}` : `. Best move ${e.best.san}`}
          {themes.length ? `. ${themes.join(', ')}` : ''}
        </div>
        <div className="muted small">
          {e.origin.label || 'Saved by hand'} - saved {formatDate(e.savedAt)} - {e.srs.attempts} {e.srs.attempts === 1 ? 'attempt' : 'attempts'}
        </div>
      </div>
      <span className={`chip nb-status nb-${st}`} data-testid="nb-status">
        {STATUS_LABEL[st]}
        <span className="muted small"> {st === 'retained' ? '' : dueText(e, now)}</span>
      </span>
    </li>
  );
}

function NotebookHome({ entries }: { entries: NotebookEntry[] }) {
  const { store, settings, updateSettings, notifyDataChanged } = useApp();
  const now = Date.now();
  const [view, setView] = useState<View>('all');
  const [theme, setTheme] = useState('any');
  const [severity, setSeverity] = useState('any');
  const [status, setStatus] = useState<'any' | NotebookStatus>('any');
  const [range, setRange] = useState('any');
  const [game, setGame] = useState('any');

  const themes = useMemo(() => [...new Set(entries.flatMap((e) => e.themes))].sort(), [entries]);
  const games = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of entries) if (e.origin.gameId) m.set(e.origin.gameId, e.origin.label || e.origin.gameId);
    return [...m.entries()];
  }, [entries]);

  const days = DATE_RANGES.find((r) => r.id === range)?.days ?? 0;
  const shown = entries
    .filter((e) => inView(view, e, now))
    .filter((e) => theme === 'any' || e.themes.includes(theme))
    .filter((e) => severity === 'any' || e.severity === severity)
    .filter((e) => status === 'any' || statusOf(e, now) === status)
    .filter((e) => !days || now - e.savedAt <= days * DAY_MS)
    .filter((e) => game === 'any' || e.origin.gameId === game)
    .sort((a, b) => a.srs.due - b.srs.due || b.savedAt - a.savedAt);

  const counts = useMemo(() => {
    const c: Record<View, number> = { all: 0, due: 0, upcoming: 0, recent: 0, retained: 0, 'needs-practice': 0 };
    for (const v of VIEWS) c[v.id] = entries.filter((e) => inView(v.id, e, now)).length;
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  const queue = sessionQueue(entries, now);
  const insights = useMemo(() => insightsFrom(entries, now), [entries]); // eslint-disable-line react-hooks/exhaustive-deps
  const filtered = theme !== 'any' || severity !== 'any' || status !== 'any' || range !== 'any' || game !== 'any';

  return (
    <>
      <section className="card" aria-labelledby="h-nb-today">
        <h2 id="h-nb-today" style={{ marginTop: 0 }}>Today</h2>
        {entries.length === 0 ? (
          <p>
            Your Notebook is empty. When you review a game, the mistakes that mattered are saved here automatically, and you can save any position by hand. Each one comes back as a short exercise on a spaced schedule.
          </p>
        ) : queue.length > 0 ? (
          <>
            <p data-testid="nb-due-summary">
              {queue.length === 1 ? '1 position is' : `${queue.length} positions are`} ready to review{entries.filter((e) => e.srs.due <= now + DAY_MS).length > queue.length ? ' (a session shows up to 10 at a time)' : ''}. It takes a few minutes.
            </p>
            <div className="btn-row">
              <button className="btn primary" type="button" onClick={() => go('/notebook/review')} data-testid="nb-start">
                Start review session
              </button>
            </div>
          </>
        ) : (
          <p data-testid="nb-due-summary">Nothing is due today. {entries.length} saved {entries.length === 1 ? 'position' : 'positions'}. You can still practise any of them from the list.</p>
        )}
      </section>

      {insights.length > 0 && (
        <section className="card" aria-labelledby="h-nb-insights" data-testid="nb-insights">
          <h2 id="h-nb-insights" style={{ marginTop: 0 }}>Patterns in your games</h2>
          <ul className="list">
            {insights.map((i) => (
              <li key={i.id}>
                <div className="grow">
                  <strong>{i.sentence}</strong>
                  <div className="muted small">Based on {i.count} saved positions from the last 90 days.</div>
                  <div className="small">
                    {i.suggest.lessons
                      .filter((l) => CURRICULUM_INDEX.lessons.has(l))
                      .map((l) => (
                        <a key={l} href={`#/academy/lesson/${l}`} style={{ marginRight: 12 }}>
                          Lesson: {CURRICULUM_INDEX.lessons.get(l)!.lesson.title}
                        </a>
                      ))}
                    {i.suggest.puzzleThemes.map((t) => (
                      <a key={t} href={`#/puzzles/play/theme/${t}`} style={{ marginRight: 12 }}>
                        {themeLabel(t)} puzzles
                      </a>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card" aria-labelledby="h-nb-list">
        <h2 id="h-nb-list" style={{ marginTop: 0 }}>Saved positions</h2>
        <div className="seg" role="group" aria-label="Show" style={{ flexWrap: 'wrap' }}>
          {VIEWS.map((v) => (
            <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => setView(v.id)} data-testid={`nb-view-${v.id}`}>
              {v.label} ({counts[v.id]})
            </button>
          ))}
        </div>
        <div className="nb-filters">
          <label>
            <span className="muted small">Theme</span>
            <select value={theme} onChange={(e) => setTheme(e.target.value)} aria-label="Filter by theme">
              <option value="any">Any theme</option>
              {themes.map((t) => (
                <option key={t} value={t}>{themeLabel(t)}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="muted small">Severity</span>
            <select value={severity} onChange={(e) => setSeverity(e.target.value)} aria-label="Filter by severity">
              <option value="any">Any severity</option>
              <option value="blunder">Blunder</option>
              <option value="mistake">Mistake</option>
              <option value="inaccuracy">Inaccuracy</option>
              <option value="manual">Saved by hand</option>
            </select>
          </label>
          <label>
            <span className="muted small">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as 'any' | NotebookStatus)} aria-label="Filter by status">
              <option value="any">Any status</option>
              {(Object.keys(STATUS_LABEL) as NotebookStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="muted small">Date saved</span>
            <select value={range} onChange={(e) => setRange(e.target.value)} aria-label="Filter by date">
              {DATE_RANGES.map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="muted small">Game</span>
            <select value={game} onChange={(e) => setGame(e.target.value)} aria-label="Filter by game">
              <option value="any">Any game</option>
              {games.map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </label>
        </div>
        {shown.length === 0 ? (
          <p className="muted" data-testid="nb-empty">{entries.length === 0 ? 'Nothing saved yet.' : filtered ? 'No saved positions match these filters.' : 'Nothing in this view yet.'}</p>
        ) : (
          <ul className="list" data-testid="nb-list">
            {shown.map((e) => (
              <EntryRow key={e.id} e={e} now={now} />
            ))}
          </ul>
        )}
      </section>

      <section className="card" aria-labelledby="h-nb-set">
        <h2 id="h-nb-set" style={{ marginTop: 0 }}>Saving</h2>
        <label className="switch">
          <input
            type="checkbox"
            checked={settings.notebook.autoSave}
            onChange={(ev) => updateSettings({ notebook: { ...settings.notebook, autoSave: ev.target.checked } })}
          />
          <span>Save important mistakes from Game Review automatically</span>
        </label>
        <p className="muted small">
          Only your own clear mistakes in games where the position was still playable are saved, at most five per game. Slight inaccuracies are never saved automatically, but you can save any move by hand from Game Review. Saved positions stay on this device and are kept when you delete the game they came from.
        </p>
        {entries.length > 0 && (
          <p className="muted small">Entries can be removed one at a time from their own page. Your Notebook is included in the backup you can export from Settings.</p>
        )}
        <span hidden>{String(store.persistent)}{String(notifyDataChanged.length)}</span>
      </section>
    </>
  );
}

/* ------------------------------ single entry ------------------------------ */

function EntryPage({ id, entries }: { id: string; entries: NotebookEntry[] }) {
  const { store, notifyDataChanged, toast } = useApp();
  const entry = entries.find((e) => e.id === id);
  const [round, setRound] = useState(0);
  if (!entry) {
    return (
      <section className="card">
        <p>This position is not in your Notebook any more.</p>
        <a className="btn" href="#/notebook">Back to the Notebook</a>
      </section>
    );
  }
  const now = Date.now();
  const st = statusOf(entry, now);
  return (
    <>
      <p>
        <a href="#/notebook">Back to the Notebook</a>
      </p>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>
          {KIND_LABEL[entry.kind]}: move {entry.moveNumber}
        </h2>
        <p className="muted small">
          {STATUS_LABEL[st]} - {dueText(entry, now)} - {entry.srs.attempts} {entry.srs.attempts === 1 ? 'attempt' : 'attempts'}
          {entry.origin.gameId ? <> - <a href={`#/games/${encodeURIComponent(entry.origin.gameId)}/review`}>Open the game review</a></> : null}
        </p>
        <Exercise key={`${entry.id}:${round}`} entry={entry} onNext={() => setRound((r) => r + 1)} nextLabel="Practise again" />
      </section>
      <section className="card">
        <button
          className="btn"
          type="button"
          onClick={async () => {
            try {
              await removeEntry(store, entry.id);
              notifyDataChanged();
              go('/notebook');
            } catch {
              toast('This could not be removed.', 'error');
            }
          }}
        >
          Remove from the Notebook
        </button>
      </section>
    </>
  );
}

/* ------------------------------ review session ------------------------------ */

function Session({ entries }: { entries: NotebookEntry[] }) {
  // The queue is fixed when the session opens, so finishing one position does not reshuffle the rest.
  const [queue] = useState(() => sessionQueue(entries, Date.now()));
  const [i, setI] = useState(0);
  if (queue.length === 0) {
    return (
      <section className="card" data-testid="nb-session-empty">
        <h2 style={{ marginTop: 0 }}>Nothing due</h2>
        <p>You have no positions to review right now.</p>
        <a className="btn" href="#/notebook">Back to the Notebook</a>
      </section>
    );
  }
  if (i >= queue.length) {
    return (
      <section className="card" data-testid="nb-session-done">
        <h2 style={{ marginTop: 0 }}>Session complete</h2>
        <p>You reviewed {queue.length} {queue.length === 1 ? 'position' : 'positions'}. Anything you found hard will come back soon; the rest are scheduled for later.</p>
        <a className="btn primary" href="#/notebook">Back to the Notebook</a>
      </section>
    );
  }
  const entry = queue[i]!;
  return (
    <section className="card" aria-labelledby="h-nb-session">
      <h2 id="h-nb-session" style={{ marginTop: 0 }}>
        Review {i + 1} of {queue.length}
      </h2>
      <Exercise key={entry.id} entry={entry} onNext={() => setI(i + 1)} nextLabel={i + 1 < queue.length ? 'Next position' : 'Finish'} />
      <div className="btn-row">
        <button className="btn small" type="button" onClick={() => setI(i + 1)} data-testid="nb-skip">
          Skip for now
        </button>
        <a className="btn small" href="#/notebook">Stop the session</a>
      </div>
    </section>
  );
}

/* ------------------------------ routes ------------------------------ */

export function NotebookRoutes({ route }: { route: string }) {
  const { entries, error } = useNotebook();
  return (
    <div className="stack" style={{ maxWidth: 980, margin: '0 auto' }} data-testid="notebook-page">
      <h1>Mistake Notebook</h1>
      <p className="muted">Positions from your own games, practised on a spaced schedule until you find the right move without help.</p>
      {error && <p role="alert">The Notebook could not be loaded on this device.</p>}
      {!entries && !error && <p className="muted">Loading your Notebook…</p>}
      {entries && (route === '/notebook/review' ? <Session entries={entries} /> : route.startsWith('/notebook/e/') ? <EntryPage id={decodeURIComponent(route.slice('/notebook/e/'.length))} entries={entries} /> : <NotebookHome entries={entries} />)}
    </div>
  );
}
