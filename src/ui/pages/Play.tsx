import { useEffect, useMemo, useRef, useState } from 'react';
import { replaySound, soundForMove } from '../../audio/moveSound';
import { tapHaptic } from '../haptics';
import { Game, describeEnd } from '../../chess/game';
import { toPgn } from '../../chess/pgn';
import { BLACK, KING, WHITE, makePiece, moveFrom, moveTo, movePromo, moveToUci, type Color } from '../../chess/types';
import { EngineCancelled } from '../../engine/client';
import { COMPETITIVE_FROM, LEVELS, PERSONALITIES, STOCKFISH_FROM, findLevel, getLevel, getPersonality } from '../../engine/levels';
import { WELCOME, botMoveText, resultText, threatText, warningText, yourMoveText } from '../../trainer/coach';
import { shouldWarn } from '../../trainer/check';
import type { CurrentGame, SavedGame } from '../../storage/types';
import { summariseGame } from '../progress';
import { useApp } from '../app';
import { Board } from '../Board';
import { PieceIcon } from '../pieces';
import { useEngineEval, useMediaQuery } from '../hooks';
import { useTrainer } from '../useTrainer';
import { TrainerPanel, TrainerWarning, type PendingWarning } from './TrainerPanel';
import { CapturedRow, EvalBar, MoveList, MoveStrip, copyText, downloadText, engineLabel, formatScore, newId, viewAt, AlignSideToBoard } from '../shared';

type ColorChoice = 'white' | 'black' | 'random';

const phase0Trainer = (m: 'normal' | 'trainer'): boolean => m === 'trainer';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function rebuild(cur: CurrentGame): Game | null {
  try {
    const g = new Game(cur.startFen);
    for (const u of cur.uciMoves) g.playUci(u);
    if (cur.resigned) g.resign(cur.resigned === 'white' ? WHITE : BLACK);
    return g;
  } catch {
    return null;
  }
}

export function PlayPage() {
  const { store, settings, updateSettings, botEngine, speech, evalEngine, playSound, toast, notifyDataChanged, checkAchievements } = useApp();
  const [phase, setPhase] = useState<'loading' | 'setup' | 'game'>('loading');
  const [resume, setResume] = useState<CurrentGame | null>(null);
  const [colorChoice, setColorChoice] = useState<ColorChoice>(settings.bot.color);
  // Old saved settings can hold a legacy name such as "casual"; the list and the chips only know the numbered bots.
  const [levelId, setLevelId] = useState(() => findLevel(settings.bot.level)?.id ?? 'r400');
  const [personalityId, setPersonalityId] = useState(settings.bot.personality);
  /** Chosen on the setup screen. */
  const [modeChoice, setModeChoice] = useState<'normal' | 'trainer'>('normal');
  /** The mode of the game being played. */
  const [gameMode, setGameMode] = useState<'normal' | 'trainer'>('normal');
  const modeRef = useRef<'normal' | 'trainer'>('normal');
  const [warning, setWarning] = useState<PendingWarning | null>(null);
  const phone = useMediaQuery('(max-width: 900px)');
  const trainer = useTrainer(phase0Trainer(gameMode), evalEngine, speech, settings.trainer);
  const noticedUnchecked = useRef(false);

  const gameRef = useRef(new Game());
  const humanRef = useRef<'white' | 'black'>('white');
  const cfgRef = useRef({ level: levelId, personality: personalityId });
  const botToken = useRef(0);
  const pendingPly = useRef(-1);
  const savedId = useRef<string | null>(null);
  const takebacks = useRef(0);
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((n) => n + 1);
  const [viewPly, setViewPly] = useState<number | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [ratingNote, setRatingNote] = useState<string | null>(null);
  const [copied, setCopied] = useState('');

  // Restore an in-progress game after a reload.
  useEffect(() => {
    let live = true;
    store
      .getCurrentGame()
      .then((cur) => {
        if (!live) return;
        const rebuilt = cur ? rebuild(cur) : null;
        if (cur && rebuilt && !rebuilt.status().over) setResume(cur);
        setPhase('setup');
      })
      .catch(() => live && setPhase('setup'));
    return () => {
      live = false;
    };
  }, [store]);

  // "Quick play" from the home page starts straight away with the last-used setup.
  const quickDone = useRef(false);
  // Links such as #/play?level=advanced preselect an opponent (used by the home page's suggestion).
  useEffect(() => {
    if (phase !== 'setup') return;
    const m = /[?&]level=([a-z0-9]+)/.exec(location.hash);
    const wanted = m ? findLevel(m[1]!) : undefined;
    if (wanted) setLevelId(wanted.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    if (phase !== 'setup' || quickDone.current) return;
    if (!location.hash.includes('quick=1')) return;
    quickDone.current = true;
    if (!resume) startNew();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, resume]);

  // Never leave an engine search running after leaving the page.
  useEffect(
    () => () => {
      botToken.current++;
      botEngine.cancel();
    },
    [botEngine],
  );

  const g = gameRef.current;
  const humanColor: Color = humanRef.current === 'white' ? WHITE : BLACK;
  const botColor: Color = humanColor === WHITE ? BLACK : WHITE;
  const status = g.status();
  const level = getLevel(cfgRef.current.level);
  const personality = getPersonality(cfgRef.current.personality);
  const botName = level.name;

  const persist = () => {
    const st = gameRef.current.status();
    if (st.over) return;
    void store
      .putCurrentGame({
        startFen: gameRef.current.startFen,
        uciMoves: gameRef.current.moves.map((m) => m.uci),
        human: humanRef.current,
        botLevel: cfgRef.current.level,
        botPersonality: cfgRef.current.personality,
        resigned: null,
        takebacks: takebacks.current,
        ...(modeRef.current === 'trainer' ? { mode: 'trainer' as const } : {}),
        updatedAt: Date.now(),
      })
      .catch(() => undefined);
  };

  const begin = (game: Game, human: 'white' | 'black', lvl: string, pers: string, used = 0, mode: 'normal' | 'trainer' = 'normal') => {
    botToken.current++;
    botEngine.cancel();
    pendingPly.current = -1;
    gameRef.current = game;
    humanRef.current = human;
    cfgRef.current = { level: lvl, personality: pers };
    savedId.current = null;
    takebacks.current = used;
    modeRef.current = mode;
    setGameMode(mode);
    setWarning(null);
    noticedUnchecked.current = false;
    trainer.reset();
    setSavedNote(null);
    setRatingNote(null);
    setViewPly(null);
    setThinking(false);
    setError(null);
    setFlipped(human === 'black');
    setPhase('game');
    bump();
  };

  const startNew = () => {
    const human: 'white' | 'black' = colorChoice === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : colorChoice;
    updateSettings({ bot: { level: levelId, personality: personalityId, color: colorChoice } });
    if (findLevel(levelId)?.backend === 'stockfish' && botEngine.stockfishProblem && !botEngine.hasStockfish) {
      toast('This level needs the Stockfish engine, which is not available on this device. Choose a level up to 1300.', 'error');
      return;
    }
    begin(new Game(), human, levelId, personalityId, 0, modeChoice);
    persist();
    if (modeChoice === 'trainer') trainer.post('welcome', WELCOME[settings.trainer.detail], true); // refs are updated synchronously inside begin(), so this saves the new game
  };

  const resumeGame = () => {
    if (!resume) return;
    const game = rebuild(resume);
    if (!game) return;
    begin(game, resume.human, resume.botLevel, resume.botPersonality, resume.takebacks, resume.mode ?? 'normal');
    setResume(null);
  };

  /* ----------------------------- Bot turn ---------------------------- */
  useEffect(() => {
    if (phase !== 'game') return;
    const game = gameRef.current;
    if (game.status().over) return;
    if (game.turn === humanColor) return;
    if (pendingPly.current === game.ply) return;
    pendingPly.current = game.ply;
    const token = ++botToken.current;
    setThinking(true);
    setError(null);
    const t0 = performance.now();
    botEngine
      .chooseMove({
        startFen: game.startFen,
        moves: game.moves.map((m) => m.uci),
        level: cfgRef.current.level,
        personality: cfgRef.current.personality,
        seed: (Date.now() ^ (game.ply * 7919)) >>> 0,
      })
      .then(async (reply) => {
        const wait = 350 - (performance.now() - t0);
        if (wait > 0) await sleep(wait);
        if (token !== botToken.current) return;
        const fenBefore = gameRef.current.fen;
        const plyBefore = gameRef.current.ply;
        const entry = gameRef.current.playUci(reply.uci);
        pendingPly.current = -1;
        setThinking(false);
        playSound(soundForMove(entry.info));
        tapHaptic(!!entry.info.capture);
        persist();
        bump();
        if (modeRef.current === 'trainer') trainerAfterBot(fenBefore, reply.uci, plyBefore + 1, entry.info);
      })
      .catch((e: unknown) => {
        if (e instanceof EngineCancelled) return;
        if (token !== botToken.current) return;
        pendingPly.current = -1;
        setThinking(false);
        setError(e instanceof Error ? e.message : 'The engine failed to move.');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, phase]);

  /* -------------------------- Save when finished ---------------------- */
  useEffect(() => {
    if (phase !== 'game' || savedId.current) return;
    const game = gameRef.current;
    const st = game.status();
    if (!st.over) return;
    const id = newId();
    savedId.current = id;
    // A checkmate already had its own sound on the final move; other endings get a quiet result sound.
    if (st.reason !== 'checkmate') {
      const mine = humanRef.current;
      playSound(st.result === '1/2-1/2' ? 'resultDraw' : (st.result === '1-0') === (mine === 'white') ? 'resultWin' : 'resultLoss');
    }
    const human = humanRef.current;
    const cfg = cfgRef.current;
    const record: SavedGame = {
      id,
      createdAt: Date.now(),
      white: human === 'white' ? 'You' : getLevel(cfg.level).name,
      black: human === 'black' ? 'You' : getLevel(cfg.level).name,
      human,
      botLevel: cfg.level,
      botPersonality: cfg.personality,
      startFen: game.startFen,
      uciMoves: game.moves.map((m) => m.uci),
      result: st.result,
      reason: st.reason ?? null,
      source: 'played',
      takebacks: takebacks.current,
      ...(modeRef.current === 'trainer' ? { mode: 'trainer' as const } : {}),
    };
    (async () => {
      // Read what existed before this game so the rating/achievement change can be reported honestly.
      const [before, profile] = await Promise.all([store.listGames(), store.getProfile()]).catch(() => [[] as SavedGame[], null] as const);
      await store.putGame(record);
      await store.putCurrentGame(null);
      setSavedNote(id);
      notifyDataChanged();
      const progress = summariseGame(before, record, profile?.ratingEpoch ?? 0);
      if (modeRef.current === 'trainer') trainer.post('result', resultText(st.result as '1-0' | '0-1' | '1/2-1/2', human), true);
      setRatingNote(progress.ratingText);
      if (progress.personalBest !== null) toast(`New personal best: your MoveWise Rating is now ${progress.personalBest}.`, 'notice');
      // Record and announce any achievement this game earned. The record is saved first, so closing the app
      // right now still leaves the unlock stored; it is also re-checked on the next start.
      void checkAchievements();
    })().catch(() => {
      setSavedNote(null);
      toast('This game could not be saved on this device. Use “Copy PGN” to keep it.', 'error');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, phase]);

  /* ----------------------------- Actions ----------------------------- */
  const commitMove = (from: number, to: number, promo: number) => {
    const game = gameRef.current;
    const entry = game.playSquares(from, to, promo);
    if (!entry) return null;
    playSound(soundForMove(entry.info));
    tapHaptic(!!entry.info.capture);
    persist();
    bump();
    return entry;
  };

  const onMove = (from: number, to: number, promo: number) => {
    const game = gameRef.current;
    if (viewPly !== null || game.turn !== humanColor || thinking || trainer.checking || warning) return;
    if (modeRef.current !== 'trainer') {
      commitMove(from, to, promo);
      return;
    }
    void trainerMove(from, to, promo);
  };

  /** Play with Trainer: check the move first, warn only about a serious blunder, otherwise play and comment. */
  const trainerMove = async (from: number, to: number, promo: number) => {
    const game = gameRef.current;
    const fen = game.fen;
    const plyAt = game.ply;
    const legal = game.legalMoves().find((m) => moveFrom(m) === from && moveTo(m) === to && movePromo(m) === promo);
    if (legal === undefined) return;
    const uci = moveToUci(legal);
    const epoch = trainer.epoch;
    let check = null as Awaited<ReturnType<typeof trainer.check>> | null;
    if (settings.trainer.warnings) {
      check = await trainer.check(fen, uci);
      // The game moved on (take-back, new game, leaving) while the engine was thinking: drop the result.
      if (gameRef.current !== game || game.ply !== plyAt || epoch !== trainer.epoch) return;
      if (shouldWarn(check)) {
        const text = warningText(check, settings.trainer.detail);
        if (text) {
          setWarning({ text, from, to, promo });
          trainer.post('warning', text, true);
          return;
        }
      }
      if (check.status !== 'checked' && !noticedUnchecked.current) {
        noticedUnchecked.current = true;
        trainer.post('your-move', check.status === 'unavailable' ? 'The engine is not available right now, so I cannot check your moves. I will keep watching the board.' : 'The engine did not search long enough to judge that move, so I will not comment on it.', false);
      }
    }
    speech.stop();
    commitMove(from, to, promo);
    if (check && check.status === 'checked') {
      trainer.recordVerdict(check.verdict);
      const text = yourMoveText(check, settings.trainer.detail);
      if (text) trainer.post('your-move', text, check.verdict === 'mistake' || check.verdict === 'blunder');
    }
  };

  const trainerAfterBot = (fenBefore: string, uci: string, ply: number, info: { check: boolean; checkmate: boolean; capture: boolean }) => {
    speech.stop();
    const detail = settings.trainer.detail;
    const text = botMoveText(fenBefore, uci, ply, detail);
    trainer.post('bot-move', text, info.checkmate || info.check || info.capture);
    const g2 = gameRef.current;
    if (!g2.status().over) {
      const threat = threatText(g2.fen, humanColor);
      if (threat) trainer.post('threat', threat, true);
      trainer.prefetch(g2.fen);
    }
  };

  const playAnyway = () => {
    const w = warning;
    if (!w) return;
    setWarning(null);
    speech.stop();
    commitMove(w.from, w.to, w.promo);
    trainer.recordVerdict('blunder');
  };

  const reconsider = () => {
    setWarning(null);
    speech.stop();
  };

  const takeBack = () => {
    const game = gameRef.current;
    if (game.ply === 0 || game.status().over) return;
    botToken.current++;
    botEngine.cancel();
    pendingPly.current = -1;
    setThinking(false);
    trainer.quiet();
    setWarning(null);
    const toUndo = game.turn === humanColor ? 2 : 1;
    for (let i = 0; i < toUndo && game.ply > 0; i++) game.undo();
    takebacks.current++;
    setViewPly(null);
    persist();
    bump();
  };

  const resign = () => {
    if (!window.confirm('Resign this game?')) return;
    botToken.current++;
    botEngine.cancel();
    pendingPly.current = -1;
    setThinking(false);
    trainer.quiet();
    setWarning(null);
    gameRef.current.resign(humanColor);
    bump();
  };

  const newGame = () => {
    const game = gameRef.current;
    if (!status.over && game.ply > 0 && !window.confirm('Leave this game? It will not be saved.')) return;
    botToken.current++;
    botEngine.cancel();
    pendingPly.current = -1;
    setThinking(false);
    void store.putCurrentGame(null).catch(() => undefined);
    trainer.quiet();
    setWarning(null);
    setPhase('setup');
  };

  const pgn = () =>
    toPgn(gameRef.current, {
      White: humanRef.current === 'white' ? 'You' : botName,
      Black: humanRef.current === 'black' ? 'You' : botName,
    });

  const ply = viewPly ?? g.ply;
  const live = viewPly === null || viewPly === g.ply;
  const view = useMemo(() => viewAt(g, ply), [g, ply, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const goPly = (p: number) => {
    const clamped = Math.max(0, Math.min(g.ply, p));
    const sfx = replaySound(g.moves, viewPly ?? g.ply, clamped, settings.sound);
    if (sfx) playSound(sfx);
    setViewPly(clamped === g.ply ? null : clamped);
  };

  // Keyboard review shortcuts (left/right/home/end/f) when not typing and not on the board itself.
  useEffect(() => {
    if (phase !== 'game') return;
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input,textarea,select,.board')) return;
      const cur = viewPly ?? gameRef.current.ply;
      if (e.key === 'ArrowLeft') goPly(cur - 1);
      else if (e.key === 'ArrowRight') goPly(cur + 1);
      else if (e.key === 'Home') goPly(0);
      else if (e.key === 'End') goPly(gameRef.current.ply);
      else if (e.key === 'f') setFlipped((f) => !f);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });

  const evalState = useEngineEval(
    settings.showEvalBar && phase === 'game',
    g.startFen,
    g.moves.slice(0, ply).map((m) => m.uci),
    9,
    900,
  );

  /* ------------------------------ Render ------------------------------ */
  if (phase === 'loading') return <p className="muted">Loading…</p>;

  if (phase === 'setup') {
    const sel = getLevel(levelId);
    const pers = getPersonality(personalityId);
    const rated = modeChoice === 'normal' && sel.category === 'competitive';
    const strengths: Array<{ label: string; id: string }> = [
      { label: 'Beginner', id: 'r400' },
      { label: 'Easy', id: 'r700' },
      { label: 'Medium', id: 'r1000' },
      { label: 'Hard', id: 'r1500' },
      { label: 'Expert', id: 'r2000' },
    ];
    return (
      <div className="stack play-setup" style={{ maxWidth: 620, margin: '0 auto' }}>
        <h1>Play</h1>
        {resume && (
          <div className="notice ok resume-notice">
            <div>
              <b>Game in progress</b>
              <div className="muted small">{resume.uciMoves.length} moves against {getLevel(resume.botLevel).name}{resume.mode === 'trainer' ? ' · Trainer' : ''}</div>
            </div>
            <button className="btn primary" type="button" onClick={resumeGame}>
              Resume game
            </button>
          </div>
        )}
        <section className="setup-block" aria-labelledby="mode-label">
          <h2 className="setup-label" id="mode-label">Game mode</h2>
          <div className="mode-pick" role="group" aria-labelledby="mode-label">
            <button type="button" className="mode-card" aria-pressed={modeChoice === 'normal'} onClick={() => setModeChoice('normal')} data-testid="mode-normal">
              <b>Normal</b>
              <span>Just play. Counts toward your rating against bots 1000 and up.</span>
            </button>
            <button type="button" className="mode-card" aria-pressed={modeChoice === 'trainer'} onClick={() => setModeChoice('trainer')} data-testid="mode-trainer">
              <b>With Trainer</b>
              <span>A coach warns you before big mistakes. Always unranked.</span>
            </button>
          </div>
        </section>
        <section className="setup-block" aria-labelledby="color-label">
          <h2 className="setup-label" id="color-label">Play as</h2>
          <div className="side-pick" role="group" aria-labelledby="color-label">
            {(['white', 'random', 'black'] as ColorChoice[]).map((c) => (
              <button key={c} type="button" className="side-card" aria-pressed={colorChoice === c} onClick={() => setColorChoice(c)} data-testid={`side-${c}`}>
                {c === 'random' ? (
                  <span className="side-random" aria-hidden="true">
                    <PieceIcon piece={makePiece(KING, WHITE)} size={30} />
                    <PieceIcon piece={makePiece(KING, BLACK)} size={30} />
                  </span>
                ) : (
                  <PieceIcon piece={makePiece(KING, c === 'white' ? WHITE : BLACK)} size={46} />
                )}
                <span>{c === 'random' ? 'Random' : c === 'white' ? 'White' : 'Black'}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="setup-block" aria-labelledby="opp-label">
          <h2 className="setup-label" id="opp-label">Opponent</h2>
          <div className="strength-pick" role="group" aria-label="Quick choice of difficulty">
            {strengths.map((x) => (
              <button key={x.id} type="button" className="chip" aria-pressed={levelId === x.id} onClick={() => setLevelId(x.id)}>
                {x.label}
              </button>
            ))}
          </div>
          <div className="opp-card">
            <div className="opp-name">
              <b>{sel.name}</b>
              <span className={`badge ${rated ? 'win' : ''}`}>{rated ? 'Rated' : 'Practice'}</span>
            </div>
            <div className="muted small" data-testid="level-info">About {sel.rating}. {sel.how}</div>
            <label className="opp-select" htmlFor="level">
              <span className="muted small">Pick an exact opponent</span>
              <select id="level" value={levelId} onChange={(e) => setLevelId(e.target.value)} data-testid="level-select">
                <optgroup label="Practice bots (100 to 900): never change your rating">
                  {LEVELS.filter((l) => l.category === 'practice').map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </optgroup>
                <optgroup label="Competitive bots (1000 to 2500): count toward your rating">
                  {LEVELS.filter((l) => l.category === 'competitive').map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </optgroup>
              </select>
            </label>
          </div>
          <p className="muted small" data-testid="level-category">
            {modeChoice === 'trainer'
              ? 'With the Trainer this game is practice and will not change your rating.'
              : sel.category === 'practice'
                ? 'Practice bot: this game will not change your rating.'
                : 'Competitive bot: this game counts toward your MoveWise Rating if you play it through without take-backs.'}
          </p>
        </section>
        <button className="btn primary big start-btn" type="button" onClick={startNew}>
          Start game
        </button>
        <details className="more-options">
          <summary>More options</summary>
          <div className="field">
            <label htmlFor="pers">Playing style</label>
            <select id="pers" value={personalityId} onChange={(e) => setPersonalityId(e.target.value)}>
              {PERSONALITIES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <span className="muted small">
              {pers.blurb} Styles are small shifts in what the engine values — they nudge its choices, they don’t make it human.
            </span>
          </div>
          <p className="muted small">
            Everything runs on this device. Bots below {STOCKFISH_FROM} use MoveWise’s built-in engine; from {STOCKFISH_FROM} the opponent is Stockfish with its strength limiter, which makes it weaker but not human-like. Bots below {COMPETITIVE_FROM} are practice only. The ratings are approximate and are explained in your Profile.
          </p>
        </details>
      </div>
    );
  }

  const myTurn = status.over ? false : g.turn === humanColor;
  const interactive = live && myTurn && !thinking && !status.over && !trainer.checking && !warning;
  const statusText = status.over
    ? describeEnd(status)
    : thinking
      ? `${botName} is thinking…`
      : myTurn
        ? status.check
          ? 'Your move — you are in check'
          : 'Your move'
        : `${botName} to move`;
  const topColor: Color = flipped ? WHITE : BLACK;
  const bottomColor: Color = topColor === WHITE ? BLACK : WHITE;
  const nameOf = (c: Color) => (c === humanColor ? 'You' : botName);
  const humanWon = status.over && ((status.result === '1-0' && humanColor === WHITE) || (status.result === '0-1' && humanColor === BLACK));

  const strip = (c: Color) => (
    <div className="player-strip">
      <span>
        {nameOf(c)} <span className="muted small">({c === WHITE ? 'White' : 'Black'})</span>
      </span>
      <CapturedRow board={view.board} ofColor={(c ^ 1) as Color} showLeadFor={c} />
    </div>
  );

  return (
    <div className="game-layout">
      <AlignSideToBoard />
      <h1 className="sr-only">{gameMode === 'trainer' ? 'Game with the Trainer' : 'Game'} against {botName}</h1>
      <div className="board-col">
        {strip(topColor)}
        <div className="board-and-eval">
          {settings.showEvalBar && (
            <EvalBar cp={evalState.reply ? evalState.reply.scoreCp : null} mate={evalState.reply?.mate ?? null} flipped={flipped} />
          )}
          <div className="board-frame">
            <Board
              board={view.board}
              orientation={flipped ? 'black' : 'white'}
              lastMove={view.lastMove}
              checkSquare={view.checkSquare}
              interactive={interactive}
              isMovable={(sq) => view.board[sq] !== 0 && (view.board[sq]! >> 3) === humanColor}
              destinations={(sq) => g.destinationsFrom(sq)}
              needsPromotion={(f, t) => g.needsPromotion(f, t)}
              onMove={onMove}
              onSound={playSound}
              showLegalMoves={settings.showLegalMoves}
              promoColor={humanColor}
              ariaLabel={`Chess board, ${nameOf(WHITE)} play White. ${statusText}`}
            />
          </div>
        </div>
        {strip(bottomColor)}
        {phone && gameMode === 'trainer' && warning && <TrainerWarning warning={warning} onReconsider={reconsider} onPlayAnyway={playAnyway} />}
        <MoveStrip moves={g.moves} current={ply} onSelect={goPly} onFlip={() => setFlipped((f) => !f)} />
      </div>

      <aside className="stack" aria-label="Game panel">
        <div className="card">
          <div className="status-line" role="status" aria-live="polite">
            {thinking && <span className="thinking" aria-hidden="true"><i /></span>} {statusText}
          </div>
          {takebacks.current > 0 && !status.over && (
            <p className="muted small">You have taken back {takebacks.current} {takebacks.current === 1 ? 'move' : 'moves'}, so this game will not count toward your rating.</p>
          )}
          {!live && <p className="muted small">Viewing move {ply} of {g.ply}. Go to the last move to keep playing.</p>}
          {error && (
            <div className="notice error" role="alert" style={{ marginTop: 10 }}>
              {error}{' '}
              <button className="btn small" type="button" onClick={() => { pendingPly.current = -1; bump(); }}>
                Try again
              </button>
            </div>
          )}
          {status.over && (
            <div style={{ marginTop: 10 }} data-testid="game-results">
              <p style={{ fontWeight: 700, marginBottom: 6 }}>
                {humanWon ? 'You won.' : status.result === '1/2-1/2' ? 'The game was drawn.' : 'You lost this one.'}{' '}
                <span className="muted" style={{ fontWeight: 400 }}>{describeEnd(status)}</span>
              </p>
              <dl className="kv">
                <dt>Opponent</dt>
                <dd>{level.name} (about {level.rating})</dd>
                <dt>Game type</dt>
                <dd>{gameMode === 'trainer' ? 'Played with the Trainer, unranked' : level.category === 'practice' ? 'Practice, unranked' : 'Competitive'}</dd>
                <dt>Moves</dt>
                <dd>{Math.ceil(g.ply / 2)}</dd>
              </dl>
              {gameMode === 'trainer' && trainer.tally.best + trainer.tally.good + trainer.tally.inaccuracy + trainer.tally.mistake + trainer.tally.blunder > 0 && (
                <p className="small" data-testid="trainer-tally">
                  The Trainer checked {trainer.tally.best + trainer.tally.good + trainer.tally.inaccuracy + trainer.tally.mistake + trainer.tally.blunder} of your moves: {trainer.tally.best + trainer.tally.good} solid, {trainer.tally.inaccuracy} small {trainer.tally.inaccuracy === 1 ? 'inaccuracy' : 'inaccuracies'}, {trainer.tally.mistake} {trainer.tally.mistake === 1 ? 'mistake' : 'mistakes'}, {trainer.tally.blunder} serious {trainer.tally.blunder === 1 ? 'blunder' : 'blunders'}. Moves it could not check are not counted.
                </p>
              )}
              {ratingNote && <p className="rating-note-line" role="status">{ratingNote}</p>}
              <div className="review-invite" data-testid="review-invite">
                <strong>Review this game</strong>
                <p style={{ margin: '4px 0 8px' }}>See what went well, find the mistakes that mattered, and learn how to improve.</p>
                {savedNote ? (
                  <a className="btn primary" href={`#/games/${savedNote}/review`} data-testid="review-game">Review this game</a>
                ) : (
                  <button className="btn primary" type="button" disabled>Saving the game…</button>
                )}
              </div>
              <div className="btn-row" style={{ marginTop: 10 }}>
                <button className="btn" type="button" onClick={() => { trainer.quiet(); setPhase('setup'); }}>
                  Play again
                </button>
                {savedNote && (
                  <a className="btn" href={`#/games/${savedNote}`}>
                    Open in Games
                  </a>
                )}
              </div>
              {savedNote && <p className="muted small" style={{ marginTop: 8 }}>Saved to your game history on this device.</p>}
            </div>
          )}
        </div>

        {gameMode === 'trainer' && (
          <TrainerPanel messages={trainer.messages} checking={trainer.checking} warning={warning} onReconsider={reconsider} onPlayAnyway={playAnyway} warningElsewhere={phone} />
        )}

        <div className="card moves-card">
          <h3>Moves</h3>
          <MoveList moves={g.moves} current={ply} onSelect={goPly} />
          <div className="btn-row" style={{ marginTop: 10 }}>
            <button className="btn small" type="button" onClick={() => goPly(0)} disabled={ply === 0} aria-label="First move">{'|<'}</button>
            <button className="btn small" type="button" onClick={() => goPly(ply - 1)} disabled={ply === 0} aria-label="Previous move">◀</button>
            <button className="btn small" type="button" onClick={() => goPly(ply + 1)} disabled={ply === g.ply} aria-label="Next move">▶</button>
            <button className="btn small" type="button" onClick={() => goPly(g.ply)} disabled={ply === g.ply} aria-label="Last move">{'>|'}</button>
            <button className="btn small" type="button" onClick={() => setFlipped((f) => !f)}>Flip</button>
          </div>
        </div>

        <div className="card">
          <div className="btn-row">
            <button className="btn" type="button" onClick={takeBack} disabled={g.ply === 0 || status.over}>Take back</button>
            <button className="btn danger" type="button" onClick={resign} disabled={status.over || g.ply === 0}>Resign</button>
            <button className="btn" type="button" onClick={newGame}>New game</button>
          </div>
          <div className="btn-row" style={{ marginTop: 8 }}>
            <button className="btn small" type="button" onClick={() => downloadText('movewise-game.pgn', pgn(), 'application/x-chess-pgn')}>Download PGN</button>
            <button className="btn small" type="button" onClick={async () => { setCopied((await copyText(pgn())) ? 'PGN copied' : 'Copy failed'); setTimeout(() => setCopied(''), 1800); }}>Copy PGN</button>
            <button className="btn small" type="button" onClick={async () => { setCopied((await copyText(view.fen)) ? 'FEN copied' : 'Copy failed'); setTimeout(() => setCopied(''), 1800); }}>Copy FEN</button>
            <span className="muted small" role="status">{copied}</span>
          </div>
          <label className="switch" style={{ marginTop: 8 }}>
            <input type="checkbox" checked={settings.showEvalBar} onChange={(e) => updateSettings({ showEvalBar: e.target.checked })} />
            <span>Show engine evaluation bar</span>
          </label>
          {settings.showEvalBar && evalState.reply && (
            <p className="muted small">
              {engineLabel(evalState.reply)}, depth {evalState.reply.depth}: <b>{formatScore(evalState.reply.scoreCp, evalState.reply.mate)}</b> for White. An estimate, not a verdict.
            </p>
          )}
        </div>

        <div className="card flat">
          <h3>Your opponent</h3>
          <dl className="kv">
            <dt>Level</dt>
            <dd>{level.name} (about {level.rating})</dd>
            <dt>Type</dt>
            <dd>{level.category === 'practice' ? 'Practice' : 'Competitive'}</dd>
            <dt>Style</dt>
            <dd>{personality.name}</dd>
            <dt>Plays</dt>
            <dd>{botColor === WHITE ? 'White' : 'Black'}</dd>
          </dl>
          <p className="muted small" style={{ marginTop: 8 }}>{level.how}</p>
        </div>
      </aside>
    </div>
  );
}

