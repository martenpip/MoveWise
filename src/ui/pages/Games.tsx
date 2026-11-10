import { useEffect, useMemo, useRef, useState } from 'react';
import { analyseReview } from '../../review/analyse';
import { replaySound } from '../../audio/moveSound';
import { Game, describeEnd } from '../../chess/game';
import { parsePgn, toPgn } from '../../chess/pgn';
import { WHITE, type Color } from '../../chess/types';
import { getLevel } from '../../engine/levels';
import { INELIGIBLE_TEXT, buildRating, ineligibleReason, outcomeOf } from '../../profile/rating';
import type { SavedGame } from '../../storage/types';
import { go, useApp } from '../app';
import { Board } from '../Board';
import { useEngineEval } from '../hooks';
import { CapturedRow, EvalBar, MoveList, copyText, downloadText, engineLabel, formatDate, formatScore, newId, viewAt, AlignSideToBoard } from '../shared';
import { pvToSan } from './Analysis';

export type Outcome = 'win' | 'loss' | 'draw' | 'unknown';

export function outcomeFor(g: SavedGame): Outcome {
  if (g.result === '1/2-1/2') return 'draw'; // an imported draw is still a draw, even with no human side
  return outcomeOf(g) ?? 'unknown';
}

const OUTCOME_LABEL: Record<Outcome, string> = { win: 'Won', loss: 'Lost', draw: 'Draw', unknown: '' };

export function GamesPage({ id }: { id: string | null }) {
  return id ? <Replay id={id} /> : <GameList />;
}

function GameList() {
  const { store, notifyDataChanged } = useApp();
  const [games, setGames] = useState<SavedGame[] | null>(null);
  const [pgnText, setPgnText] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const [reviewed, setReviewed] = useState<Map<string, { complete: boolean; accuracy: number | null }>>(new Map());
  const deltas = useMemo(() => new Map(buildRating(games ?? []).history.map((h) => [h.gameId, h.delta])), [games]);
  const refresh = () =>
    store
      .listGames()
      .then(setGames)
      .catch(() => setGames([]));
  useEffect(() => {
    void refresh();
    store
      .listReviews()
      .then((list) => {
        const m = new Map<string, { complete: boolean; accuracy: number | null }>();
        for (const r of list) {
          let accuracy: number | null = null;
          if (r.complete) {
            try {
              const a = analyseReview(r);
              accuracy = r.perspective ? a.sides[r.perspective].accuracy : null;
            } catch {
              /* an unreadable review is shown as reviewed without a number */
            }
          }
          m.set(r.gameId, { complete: r.complete, accuracy });
        }
        setReviewed(m);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  const importPgn = async (text: string) => {
    try {
      const parsed = parsePgn(text);
      const rec: SavedGame = {
        id: newId(),
        createdAt: Date.now(),
        white: parsed.headers.White ?? 'White',
        black: parsed.headers.Black ?? 'Black',
        human: null,
        botLevel: null,
        botPersonality: null,
        startFen: parsed.game.startFen,
        uciMoves: parsed.game.moves.map((m) => m.uci),
        result: parsed.result,
        reason: null,
        source: 'imported',
      };
      await store.putGame(rec);
      setPgnText('');
      setMsg({ kind: 'ok', text: `Imported ${rec.white} vs ${rec.black} (${rec.uciMoves.length} moves).` });
      await refresh();
      notifyDataChanged();
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'That PGN could not be read.' });
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    await importPgn(await file.text());
  };

  return (
    <div className="stack" style={{ maxWidth: 820, margin: '0 auto' }}>
      <h1>Your games</h1>
      {msg && <div className={`notice ${msg.kind}`} role="status">{msg.text}</div>}
      <div className="card">
        {games === null ? (
          <p className="muted">Loading…</p>
        ) : games.length === 0 ? (
          <div>
            <p><b>No games yet.</b></p>
            <p className="muted">Finished games against bots are saved here automatically, and you can import PGN files below.</p>
            <a className="btn primary" href="#/play">Play a bot</a>
          </div>
        ) : (
          <ul className="list">
            {games.map((g) => {
              const o = outcomeFor(g);
              const d = deltas.get(g.id);
              const why = g.source === 'played' && d === undefined ? ineligibleReason(g) : null;
              return (
                <li key={g.id}>
                  <div className="grow">
                    <a href={`#/games/${g.id}`}><b>{g.white} vs {g.black}</b></a>
                    <div className="muted small">
                      {formatDate(g.createdAt)} · {Math.ceil(g.uciMoves.length / 2)} moves
                      {g.botLevel ? ` · ${getLevel(g.botLevel).name}${g.mode === 'trainer' ? ' (Trainer)' : ''}` : ''}
                      {g.source === 'imported' ? ' · imported' : ''}
                    </div>
                  </div>
                  {d !== undefined && <span className={`delta small ${d >= 0 ? 'up' : 'down'}`} title="Rating change from this game" aria-label={`Rating change ${Math.round(d)}`}>{d >= 0 ? '+' : '−'}{Math.abs(Math.round(d))}</span>}
                  {why && why !== 'imported' && <span className="muted small" title="Why this game did not change your rating">Unrated: {INELIGIBLE_TEXT[why].toLowerCase()}</span>}
                  <span className={`badge ${o === 'win' ? 'win' : o === 'loss' ? 'loss' : ''}`}>{OUTCOME_LABEL[o] || g.result}</span>
                  {reviewed.get(g.id)?.complete && (
                    <span className="badge" title="This game has a saved review">
                      Reviewed{reviewed.get(g.id)!.accuracy !== null ? ` · ${Math.round(reviewed.get(g.id)!.accuracy!)}%` : ''}
                    </span>
                  )}
                  <a className="btn small" href={`#/games/${g.id}/review`}>{reviewed.get(g.id)?.complete ? 'Reopen review' : reviewed.get(g.id) ? 'Resume review' : 'Review'}</a>
                  <a className="btn small" href={`#/games/${g.id}`}>Open</a>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="card">
        <h2>Import a game</h2>
        <div className="field">
          <textarea aria-label="PGN text" value={pgnText} placeholder="Paste PGN here…" onChange={(e) => setPgnText(e.target.value)} />
        </div>
        <div className="btn-row">
          <button className="btn primary" type="button" disabled={!pgnText.trim()} onClick={() => void importPgn(pgnText)}>Import PGN</button>
          <label className="btn">
            Choose .pgn file
            <input type="file" accept=".pgn,text/plain" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
          </label>
        </div>
      </div>
    </div>
  );
}

function Replay({ id }: { id: string }) {
  const { store, settings, notifyDataChanged, playSound } = useApp();
  const plyRef = useRef(0);
  const [record, setRecord] = useState<SavedGame | null | undefined>(undefined);
  const [game, setGame] = useState<Game | null>(null);
  const [ply, setPly] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [analyze, setAnalyze] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    let live = true;
    store
      .getGame(id)
      .then((r) => {
        if (!live) return;
        setRecord(r ?? null);
        if (!r) return;
        try {
          const gm = new Game(r.startFen);
          for (const u of r.uciMoves) gm.playUci(u);
          setGame(gm);
          setPly(gm.ply);
          plyRef.current = gm.ply; // opening a game is silent
          setFlipped(r.human === 'black');
        } catch {
          setRecord(null);
        }
      })
      .catch(() => live && setRecord(null));
    return () => {
      live = false;
    };
  }, [store, id]);

  const view = useMemo(() => (game ? viewAt(game, ply) : null), [game, ply]);
  const ev = useEngineEval(analyze && !!game, game?.startFen ?? '', game ? game.moves.slice(0, ply).map((m) => m.uci) : [], 11, 1800);

  /** Move to a ply; one step forward plays that move's sound, jumps and steps back are silent unless enabled. */
  const goPly = (to: number) => {
    if (!game) return;
    const target = Math.max(0, Math.min(game.ply, to));
    const sfx = replaySound(game.moves, plyRef.current, target, settings.sound);
    if (sfx) playSound(sfx);
    plyRef.current = target;
    setPly(target);
  };
  const goPlyRef = useRef(goPly);
  goPlyRef.current = goPly;

  useEffect(() => {
    if (!game) return;
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select,.board')) return;
      if (e.key === 'ArrowLeft') goPlyRef.current(plyRef.current - 1);
      else if (e.key === 'ArrowRight') goPlyRef.current(plyRef.current + 1);
      else if (e.key === 'Home') goPlyRef.current(0);
      else if (e.key === 'End') goPlyRef.current(game.ply);
      else if (e.key === 'f') setFlipped((f) => !f);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [game]);

  if (record === undefined) return <p className="muted">Loading…</p>;
  if (record === null || !game || !view)
    return (
      <div className="card" style={{ maxWidth: 600, margin: '0 auto' }}>
        <h1>Game not found</h1>
        <p className="muted">It may have been deleted, or it could not be read.</p>
        <a className="btn" href="#/games">Back to games</a>
      </div>
    );

  const pgn = () => toPgn(game, { White: record.white, Black: record.black, Event: 'MoveWise game' }, record.result);
  const o = outcomeFor(record);
  const turn: Color = view.turn;
  const best = ev.reply?.uci ? pvToSan(view.fen, [ev.reply.uci], 1).replace(/^\d+\.+\s*/, '') : '';
  const topColor: Color = flipped ? WHITE : 1;
  const bottomColor: Color = topColor === WHITE ? 1 : WHITE;
  const nameOf = (c: Color) => (c === WHITE ? record.white : record.black);
  const endText = record.result === '*' ? '' : describeEnd(game.status().over ? game.status() : { over: true, check: false, result: record.result, reason: (record.reason as never) ?? undefined });

  const strip = (c: Color) => (
    <div className="player-strip">
      <span>{nameOf(c)} <span className="muted small">({c === WHITE ? 'White' : 'Black'})</span></span>
      <CapturedRow board={view.board} ofColor={(c ^ 1) as Color} showLeadFor={c} />
    </div>
  );

  return (
    <div className="game-layout">
      <AlignSideToBoard />
      <h1 className="sr-only">{`${record.white} against ${record.black}`}</h1>
      <div className="board-col">
        <a href="#/games" className="small">← All games</a>
        {strip(topColor)}
        <div className="board-and-eval">
          {analyze && <EvalBar cp={ev.reply ? ev.reply.scoreCp : null} mate={ev.reply?.mate ?? null} flipped={flipped} />}
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
              promoColor={turn}
              ariaLabel={`Replay of ${record.white} versus ${record.black}, move ${ply} of ${game.ply}`}
            />
          </div>
        </div>
        {strip(bottomColor)}
      </div>

      <aside className="stack" aria-label="Replay panel">
        <div className="card">
          <h2 style={{ marginBottom: 4 }}>{record.white} vs {record.black}</h2>
          <p className="muted small">
            {formatDate(record.createdAt)}
            {record.botLevel ? ` · ${getLevel(record.botLevel).name}${record.mode === 'trainer' ? ' (Trainer)' : ''}` : ''} · Result {record.result}
            {o !== 'unknown' ? ` (${OUTCOME_LABEL[o].toLowerCase()})` : ''}
          </p>
          {endText && <p className="status-line">{endText}</p>}
        </div>
        <div className="card">
          <h3>Moves</h3>
          <MoveList moves={game.moves} current={ply} onSelect={goPly} />
          <div className="btn-row" style={{ marginTop: 10 }}>
            <button className="btn small" type="button" onClick={() => goPly(0)} disabled={ply === 0} aria-label="First move">{'|<'}</button>
            <button className="btn small" type="button" onClick={() => goPly(ply - 1)} disabled={ply === 0} aria-label="Previous move">◀</button>
            <button className="btn small" type="button" onClick={() => goPly(ply + 1)} disabled={ply === game.ply} aria-label="Next move">▶</button>
            <button className="btn small" type="button" onClick={() => goPly(game.ply)} disabled={ply === game.ply} aria-label="Last move">{'>|'}</button>
            <button className="btn small" type="button" onClick={() => setFlipped((f) => !f)}>Flip</button>
          </div>
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Game review</h2>
          <p className="muted small">Analyse every move with the engine and learn from the game: verdicts, key moments, explanations and a summary. Saved on this device.</p>
          <a className="btn primary" href={`#/games/${id}/review`}>Review this game</a>
        </div>
        <div className="card">
          <label className="switch">
            <input type="checkbox" checked={analyze} onChange={(e) => setAnalyze(e.target.checked)} />
            <span>Analyze this position</span>
          </label>
          {analyze && (
            <div aria-live="polite">
              {ev.busy && !ev.reply && <p className="muted small">Thinking…</p>}
              {ev.error && <p className="notice error">{ev.error}</p>}
              {ev.reply && (
                <dl className="kv">
                  <dt>Evaluation</dt>
                  <dd>{formatScore(ev.reply.scoreCp, ev.reply.mate)} <span className="muted small">(White’s view)</span></dd>
                  <dt>Best move</dt>
                  <dd>{best || '—'}</dd>
                  <dt>Depth</dt>
                  <dd>{ev.reply.depth}</dd>
                </dl>
              )}
              <p className="muted small" style={{ marginTop: 8 }}>
                {engineLabel(ev.reply)}. For every move of the game, with explanations, use the full review.
              </p>
            </div>
          )}
        </div>
        <div className="card">
          <div className="btn-row">
            <button className="btn small" type="button" onClick={() => downloadText('movewise-game.pgn', pgn(), 'application/x-chess-pgn')}>Download PGN</button>
            <button className="btn small" type="button" onClick={async () => { setNote((await copyText(pgn())) ? 'PGN copied' : 'Could not copy'); setTimeout(() => setNote(''), 1800); }}>Copy PGN</button>
            <button className="btn small" type="button" onClick={async () => { setNote((await copyText(view.fen)) ? 'FEN copied' : 'Could not copy'); setTimeout(() => setNote(''), 1800); }}>Copy FEN</button>
            <button
              className="btn small danger"
              type="button"
              onClick={async () => {
                if (!window.confirm('Delete this game from this device? Its review is deleted too. Positions already saved in your Mistake Notebook are kept. This cannot be undone.')) return;
                await store.deleteGame(record.id);
                notifyDataChanged();
                go('/games');
              }}
            >
              Delete
            </button>
          </div>
          <p className="muted small" role="status">{note}</p>
        </div>
      </aside>
    </div>
  );
}
