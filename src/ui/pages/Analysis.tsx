import { useEffect, useMemo, useRef, useState } from 'react';
import { replaySound, soundForMove } from '../../audio/moveSound';
import { Game } from '../../chess/game';
import { parsePgn, toPgn } from '../../chess/pgn';
import { Position } from '../../chess/position';
import type { Color } from '../../chess/types';
import { describeEnd } from '../../chess/game';
import { useApp } from '../app';
import { Board } from '../Board';
import { useEngineEval } from '../hooks';
import { EvalBar, MoveList, copyText, downloadText, engineLabel, formatScore, viewAt, AlignSideToBoard } from '../shared';

/** Convert a UCI principal variation to SAN from a given position. */
export function pvToSan(fen: string, pv: string[], max = 10): string {
  try {
    const pos = new Position(fen);
    const out: string[] = [];
    let num = Number(fen.split(' ')[5] ?? 1);
    let white = pos.turn === 0;
    for (const u of pv.slice(0, max)) {
      const m = pos.parseUci(u);
      if (m === undefined) break;
      const san = pos.toSan(m);
      out.push(white ? `${num}. ${san}` : out.length === 0 ? `${num}... ${san}` : san);
      pos.makeMove(m);
      if (!white) num++;
      white = !white;
    }
    return out.join(' ');
  } catch {
    return '';
  }
}

/** A position handed over from Game Review (#/analysis?fen=...). An unreadable FEN falls back to the start position. */
function initialGame(): Game {
  const q = location.hash.split('?')[1];
  const fen = q ? new URLSearchParams(q).get('fen') : null;
  if (fen) {
    try {
      return new Game(fen);
    } catch {
      /* fall through */
    }
  }
  return new Game();
}

export function AnalysisPage() {
  const { settings, playSound } = useApp();
  const prefsRef = useRef(settings.sound);
  prefsRef.current = settings.sound;
  const gameRef = useRef<Game>(null as unknown as Game);
  if (gameRef.current === null) gameRef.current = initialGame();
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((n) => n + 1);
  const [flipped, setFlipped] = useState(false);
  const [fenText, setFenText] = useState('');
  const [pgnText, setPgnText] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [analyze, setAnalyze] = useState(true);

  const g = gameRef.current;
  const status = g.status();
  const view = useMemo(() => viewAt(g, g.ply), [g, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const allMoves = useMemo(() => [...g.moves, ...[...g.redoable].reverse()], [version]); // eslint-disable-line react-hooks/exhaustive-deps

  const ev = useEngineEval(analyze, g.startFen, g.moves.map((m) => m.uci), 11, 1800);

  /** Move through the game (undo/redo/jump) and play the matching sound: one step forward sounds, jumps do not. */
  const navigate = (action: (game: Game) => void) => {
    const game = gameRef.current;
    const from = game.ply;
    action(game);
    const all = [...game.moves, ...[...game.redoable].reverse()];
    const sfx = replaySound(all, from, game.ply, prefsRef.current);
    if (sfx) playSound(sfx);
    setVersion((n) => n + 1);
  };
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select,.board')) return;
      if (e.key === 'ArrowLeft') navigateRef.current((game) => void game.undo());
      else if (e.key === 'ArrowRight') navigateRef.current((game) => void game.redo());
      else if (e.key === 'Home') navigateRef.current((game) => game.goTo(0));
      else if (e.key === 'End') navigateRef.current((game) => game.goTo(game.ply + game.redoable.length));
      else if (e.key === 'f') setFlipped((f) => !f);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  const say = (kind: 'ok' | 'error', text: string) => {
    setMessage({ kind, text });
    setTimeout(() => setMessage(null), 3500);
  };

  const loadFen = () => {
    try {
      gameRef.current = new Game(fenText.trim());
      setFlipped(false);
      bump();
      say('ok', 'Position loaded.');
    } catch (e) {
      say('error', e instanceof Error ? e.message : 'That FEN could not be read.');
    }
  };

  const loadPgn = () => {
    try {
      const parsed = parsePgn(pgnText);
      gameRef.current = parsed.game;
      bump();
      say('ok', `Loaded ${parsed.game.ply} moves.`);
    } catch (e) {
      say('error', e instanceof Error ? e.message : 'That PGN could not be read.');
    }
  };

  const onMove = (from: number, to: number, promo: number) => {
    const entry = gameRef.current.playSquares(from, to, promo);
    if (entry) {
      playSound(soundForMove(entry.info));
      bump();
    }
  };

  const turn: Color = view.turn;
  const best = ev.reply?.uci ? pvToSan(view.fen, [ev.reply.uci], 1).replace(/^\d+\.+\s*/, '') : '';
  const line = ev.reply ? pvToSan(view.fen, ev.reply.pv, 10) : '';
  const pgn = () => toPgn(g, { Event: 'MoveWise analysis' });

  return (
    <div className="game-layout">
      <AlignSideToBoard />
      <div className="board-col">
        <h1 style={{ marginBottom: 0 }}>Analysis board</h1>
        <p className="muted small" style={{ margin: 0 }}>
          Move pieces for both sides, load any position or game, and see what the engine thinks. Stockfish is used when it is available; you can change that in Settings.
        </p>
        <div className="board-and-eval">
          {analyze && <EvalBar cp={ev.reply ? ev.reply.scoreCp : null} mate={ev.reply?.mate ?? null} flipped={flipped} />}
          <div className="board-frame">
            <Board
              board={view.board}
              orientation={flipped ? 'black' : 'white'}
              lastMove={view.lastMove}
              checkSquare={view.checkSquare}
              interactive={!status.over}
              isMovable={(sq) => view.board[sq] !== 0 && (view.board[sq]! >> 3) === turn}
              destinations={(sq) => g.destinationsFrom(sq)}
              needsPromotion={(f, t) => g.needsPromotion(f, t)}
              onMove={onMove}
              onSound={playSound}
              showLegalMoves={settings.showLegalMoves}
              promoColor={turn}
              ariaLabel={`Analysis board. ${turn === 0 ? 'White' : 'Black'} to move`}
            />
          </div>
        </div>
        <div className="status-line" role="status">
          {status.over ? describeEnd(status) : `${turn === 0 ? 'White' : 'Black'} to move${status.check ? ' — in check' : ''}`}
        </div>
      </div>

      <aside className="stack" aria-label="Analysis panel">
        {message && (
          <div className={`notice ${message.kind}`} role="status">
            {message.text}
          </div>
        )}
        <div className="card">
          <div className="btn-row">
            <button className="btn small" type="button" onClick={() => navigate((game) => void game.undo())} disabled={g.ply === 0}>Undo</button>
            <button className="btn small" type="button" onClick={() => navigate((game) => void game.redo())} disabled={g.redoable.length === 0}>Redo</button>
            <button className="btn small" type="button" onClick={() => setFlipped((f) => !f)}>Flip</button>
            <button className="btn small" type="button" onClick={() => { gameRef.current = new Game(); bump(); }}>Reset</button>
          </div>
          <h2 style={{ marginTop: 16 }} className="h3-look">Moves</h2>
          <MoveList moves={allMoves} current={g.ply} onSelect={(p) => navigate((game) => game.goTo(p))} />
        </div>

        <div className="card">
          <label className="switch">
            <input type="checkbox" checked={analyze} onChange={(e) => setAnalyze(e.target.checked)} />
            <span>Engine analysis</span>
          </label>
          {analyze && (
            <div aria-live="polite">
              {ev.busy && !ev.reply && <p className="muted small">Thinking…</p>}
              {ev.error && <p className="notice error">{ev.error}</p>}
              {ev.reply && (
                <>
                  <dl className="kv">
                    <dt>Evaluation</dt>
                    <dd>{formatScore(ev.reply.scoreCp, ev.reply.mate)} <span className="muted small">(White’s view)</span></dd>
                    <dt>Best move</dt>
                    <dd>{best || '—'}</dd>
                    <dt>Depth</dt>
                    <dd>{ev.reply.depth}{ev.busy ? ' · updating…' : ''}</dd>
                  </dl>
                  {line && <p className="pv" style={{ marginTop: 8 }}>{line}</p>}
                </>
              )}
              <p className="muted small" style={{ marginTop: 8 }}>
                One line from {engineLabel(ev.reply)}. Treat it as a strong hint, not the truth.
              </p>
            </div>
          )}
        </div>

        <div className="card">
          <h3>Position (FEN)</h3>
          <div className="field">
            <input type="text" aria-label="FEN" value={fenText} placeholder="Paste a FEN here" onChange={(e) => setFenText(e.target.value)} />
          </div>
          <div className="btn-row">
            <button className="btn small" type="button" onClick={loadFen} disabled={!fenText.trim()}>Load FEN</button>
            <button className="btn small" type="button" onClick={async () => { const ok = await copyText(view.fen); say(ok ? 'ok' : 'error', ok ? 'FEN copied.' : 'Could not copy.'); }}>Copy current FEN</button>
          </div>
          <p className="mono small muted" style={{ overflowWrap: 'anywhere' }}>{view.fen}</p>
        </div>

        <div className="card">
          <h3>Game (PGN)</h3>
          <div className="field">
            <textarea aria-label="PGN" value={pgnText} placeholder="Paste a PGN here" onChange={(e) => setPgnText(e.target.value)} />
          </div>
          <div className="btn-row">
            <button className="btn small" type="button" onClick={loadPgn} disabled={!pgnText.trim()}>Load PGN</button>
            <button className="btn small" type="button" onClick={() => downloadText('movewise-analysis.pgn', pgn(), 'application/x-chess-pgn')} disabled={g.ply === 0}>Download PGN</button>
            <button className="btn small" type="button" onClick={async () => { const ok = await copyText(pgn()); say(ok ? 'ok' : 'error', ok ? 'PGN copied.' : 'Could not copy.'); }} disabled={g.ply === 0}>Copy PGN</button>
          </div>
        </div>
      </aside>
    </div>
  );
}
