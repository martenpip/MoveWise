/** Interactive lesson steps: demos and the five kinds of exercise. Each exercise reports a record when it is solved. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Position } from '../../chess/position';
import { makePiece, parseSquare, squareName, type Color } from '../../chess/types';
import { LineSession, reachClick, reachTargets } from '../../academy/session';
import type {
  AskExercise, DemoStep, ExerciseRecord, ExerciseStep, MoveExercise, PlaceExercise, ReachExercise, SquareExercise,
} from '../../academy/types';
import { MoveBoard, SquareBoard, StaticBoard, boardOf, specExtras } from './view';

export interface ExerciseProps<T> {
  ex: T;
  /** Called once when the exercise is solved. */
  onSolved: (rec: ExerciseRecord) => void;
  /** The exercise was solved before (this session or earlier). */
  solvedBefore: boolean;
}

/* ----------------------------- shared bits ---------------------------- */

function useAttemptLog(total: number) {
  const [wrong, setWrong] = useState(0);
  const [hints, setHints] = useState(0);
  const [answered, setAnswered] = useState(0);
  const record = (): ExerciseRecord => ({ attempts: answered + 1, solved: true, clean: wrong === 0 && hints === 0, hints });
  return { wrong, hints, answered, total, record, miss: () => { setWrong((n) => n + 1); setAnswered((n) => n + 1); }, hit: () => setAnswered((n) => n + 1), useHint: () => setHints((n) => Math.min(total, n + 1)), setHints };
}

function HintBox({ hints, shown, onHint, done }: { hints: string[]; shown: number; onHint: () => void; done: boolean }) {
  return (
    <div className="ac-hints">
      {hints.slice(0, shown).map((h, i) => (
        <p key={i} className="ac-hint"><strong>Hint {i + 1}.</strong> {h}</p>
      ))}
      {!done && shown < hints.length && (
        <button className="btn" type="button" onClick={onHint}>{shown === 0 ? 'Give me a hint' : 'Another hint'}</button>
      )}
    </div>
  );
}

function Feedback({ tone, children }: { tone: 'good' | 'bad' | 'info'; children: ReactNode }) {
  if (!children) return null;
  return (
    <div className={`ac-feedback ${tone}`} role="status" aria-live="polite">
      {children}
    </div>
  );
}

function Layout({ prompt, board, side }: { prompt: string; board: ReactNode; side: ReactNode }) {
  return (
    <div className="ac-step">
      <div className="ac-boardcol">{board}</div>
      <div className="ac-side">
        <p className="ac-prompt">{prompt}</p>
        {side}
      </div>
    </div>
  );
}

/* -------------------------------- demo -------------------------------- */

export function Demo({ step }: { step: DemoStep }) {
  const [i, setI] = useState(0);
  const view = useMemo(() => {
    const pos = new Position(step.board.fen);
    let last: { from: number; to: number } | null = null;
    for (let k = 0; k < i; k++) {
      const m = pos.parseUci(step.moves[k]!.uci)!;
      last = { from: m & 63, to: (m >> 6) & 63 };
      pos.makeMove(m);
    }
    return { pos, last };
  }, [step, i]);
  const cur = i > 0 ? step.moves[i - 1]! : null;
  const arrows = cur?.arrows ?? (i === 0 ? step.board.arrows : undefined);
  const marks = cur?.marks ?? (i === 0 ? step.board.marks : undefined);
  const spec = { ...step.board, arrows, marks, last: undefined };
  const extras = { ...specExtras(spec), lastMove: view.last };
  return (
    <div className="ac-step">
      <div className="ac-boardcol">
        <StaticBoard spec={step.board} board={view.pos.board} label={`Demonstration board, move ${i} of ${step.moves.length}`} extras={extras} />
      </div>
      <div className="ac-side">
        {step.title && <h3>{step.title}</h3>}
        <p className="ac-prompt">{cur ? cur.say : step.intro ?? 'Step through the moves with the buttons below.'}</p>
        <p className="muted" aria-live="polite">Move {i} of {step.moves.length}</p>
        <div className="ac-row">
          <button className="btn" type="button" disabled={i === 0} onClick={() => setI(0)}>Restart</button>
          <button className="btn" type="button" disabled={i === 0} onClick={() => setI(i - 1)}>Back</button>
          <button className="btn primary" type="button" disabled={i >= step.moves.length} onClick={() => setI(i + 1)}>{i === 0 ? 'Start' : 'Next move'}</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- move --------------------------------- */

function MoveEx({ ex, onSolved, solvedBefore }: ExerciseProps<MoveExercise>) {
  const [session, setSession] = useState(() => new LineSession(ex));
  const [pos, setPos] = useState<Position>(() => new Position(ex.board.fen));
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad' | 'info'; text: string } | null>(null);
  const [showMe, setShowMe] = useState(false);
  const [finished, setFinished] = useState(false);
  const [busy, setBusy] = useState(false);
  const log = useAttemptLog(ex.hints.length);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const side = session.playerColor;

  const play = (uci: string) => {
    if (busy || finished) return;
    const r = session.attempt(uci);
    if (r.kind === 'illegal') { setMsg({ tone: 'bad', text: 'That move is not legal here.' }); return; }
    if (r.kind === 'wrong') {
      log.miss();
      setShowMe(false);
      setMsg({ tone: 'bad', text: r.note ?? `${r.san} is not the move this exercise is looking for. Try again; a hint is available.` });
      return;
    }
    log.hit();
    setShowMe(false);
    const after = pos.clone();
    after.makeMove(after.parseUci(uci)!);
    setPos(after);
    const finish = () => {
      setFinished(true);
      setMsg({ tone: 'good', text: ex.explain });
      onSolved(log.record());
    };
    if (r.reply) {
      setBusy(true);
      setMsg({ tone: 'good', text: 'Correct. Watch the reply…' });
      timer.current = setTimeout(() => {
        setPos(new Position(session.fen));
        setBusy(false);
        if (r.done) finish();
        else setMsg({ tone: 'good', text: 'Good. Now find your next move.' });
      }, 450);
    } else if (r.done) finish();
  };

  const reset = () => {
    const s = new LineSession(ex);
    setSession(s);
    setPos(new Position(ex.board.fen));
    setMsg(null);
    setFinished(false);
    setShowMe(false);
  };
  const exp = session.expected;
  const arrows = showMe && exp ? [{ from: parseSquare(exp.slice(0, 2)), to: parseSquare(exp.slice(2, 4)), tone: 'best' as const }] : undefined;
  return (
    <Layout
      prompt={ex.prompt}
      board={<MoveBoard pos={pos} orientation={ex.board.orientation ?? (side === 0 ? 'white' : 'black')} label={`${ex.prompt} ${side === 0 ? 'White' : 'Black'} to move.`} onMove={play} disabled={busy || finished} extras={{ ...specExtras({ ...ex.board, arrows: undefined, marks: undefined }), arrows }} />}
      side={
        <>
          {session.totalSteps > 1 && <p className="muted">Move {Math.min(session.step + 1, session.totalSteps)} of {session.totalSteps}</p>}
          <HintBox hints={ex.hints} shown={log.hints} onHint={log.useHint} done={finished} />
          <Feedback tone={msg?.tone ?? 'info'}>{msg?.text}</Feedback>
          {!finished && (
            <div className="ac-row">
              <button className="btn" type="button" onClick={() => { setShowMe(true); log.setHints(ex.hints.length); }}>Show me the move</button>
            </div>
          )}
          {finished && (
            <div className="ac-row">
              <button className="btn" type="button" onClick={reset}>{solvedBefore ? 'Practise again' : 'Try again'}</button>
            </div>
          )}
        </>
      }
    />
  );
}

/* ------------------------------- reach -------------------------------- */

function ReachEx({ ex, onSolved }: ExerciseProps<ReachExercise>) {
  const targets = useMemo(() => reachTargets(ex), [ex]);
  const [found, setFound] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad' | 'info'; text: string } | null>(null);
  const log = useAttemptLog(ex.hints.length);
  const done = found.size === targets.length;
  const board = useMemo(() => boardOf(ex.board.fen), [ex]);
  const click = (sq: number) => {
    if (done) return;
    const name = squareName(sq);
    const r = reachClick(targets, found, name);
    if (r === 'again') return setMsg({ tone: 'info', text: `You already found ${name}.` });
    if (r === 'wrong') {
      log.miss();
      return setMsg({ tone: 'bad', text: `${name} is not one of them. ${ex.which === 'captures' ? 'Look for enemy pieces it can take.' : 'Think about how this piece moves.'}` });
    }
    log.hit();
    const next = new Set(found).add(name);
    setFound(next);
    if (next.size === targets.length) {
      setMsg({ tone: 'good', text: ex.explain });
      onSolved(log.record());
    } else setMsg({ tone: 'good', text: `${name} is right. ${targets.length - next.size} to go.` });
  };
  const marks = [{ sq: parseSquare(ex.from), tone: 'mark' as const }, ...[...found].map((s) => ({ sq: parseSquare(s), tone: 'good' as const }))];
  return (
    <Layout
      prompt={ex.prompt}
      board={<SquareBoard board={board} orientation={ex.board.orientation ?? 'white'} label={ex.prompt} onSquare={click} disabled={done} extras={{ highlights: marks }} />}
      side={
        <>
          <p className="muted" aria-live="polite">Found {found.size} of {targets.length}</p>
          <HintBox hints={ex.hints} shown={log.hints} onHint={log.useHint} done={done} />
          <Feedback tone={msg?.tone ?? 'info'}>{msg?.text}</Feedback>
        </>
      }
    />
  );
}

/* ------------------------------- place -------------------------------- */

const PIECE_CODE: Record<string, number> = { P: 1, N: 2, B: 3, R: 4, Q: 5, K: 6 };
const PIECE_WORD: Record<string, string> = { P: 'pawn', N: 'knight', B: 'bishop', R: 'rook', Q: 'queen', K: 'king' };

function PlaceEx({ ex, onSolved }: ExerciseProps<PlaceExercise>) {
  const start = useMemo(() => Array.from(boardOf(ex.board.fen)), [ex]);
  const [board, setBoard] = useState<number[]>(start);
  const [t, setT] = useState(0);
  const [placed, setPlaced] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad' | 'info'; text: string } | null>(null);
  const log = useAttemptLog(ex.hints.length);
  const done = t >= ex.tasks.length;
  const task = ex.tasks[t];
  const need = task?.count ?? 1;
  const click = (sq: number) => {
    if (done || !task) return;
    const name = squareName(sq);
    if (placed.includes(name)) return;
    if (!task.squares.includes(name)) {
      log.miss();
      return setMsg({ tone: 'bad', text: `${name} is not right for the ${PIECE_WORD[task.piece]}. ${task.say ?? ''}`.trim() });
    }
    log.hit();
    const color: Color = task.color === 'w' ? 0 : 1;
    const nb = board.slice();
    nb[sq] = makePiece(PIECE_CODE[task.piece]!, color);
    setBoard(nb);
    const np = [...placed, name];
    setPlaced(np);
    if (np.length >= need) {
      if (t + 1 >= ex.tasks.length) {
        setT(t + 1);
        setMsg({ tone: 'good', text: ex.explain });
        onSolved(log.record());
      } else {
        setT(t + 1);
        setPlaced([]);
        setMsg({ tone: 'good', text: 'Correct. On to the next piece.' });
      }
    } else setMsg({ tone: 'good', text: `Right. ${need - np.length} more.` });
  };
  const word = task ? `${task.color === 'w' ? 'white' : 'black'} ${PIECE_WORD[task.piece]}${need > 1 ? 's' : ''}` : '';
  return (
    <Layout
      prompt={ex.prompt}
      board={<SquareBoard board={board} orientation={ex.board.orientation ?? 'white'} label={`${ex.prompt} Click a square to place the piece.`} onSquare={click} disabled={done} extras={{ highlights: placed.map((s) => ({ sq: parseSquare(s), tone: 'good' as const })) }} />}
      side={
        <>
          {task && <p className="ac-task"><strong>Place the {word}.</strong> {need > 1 ? `${placed.length} of ${need} placed.` : 'Click the square.'} {task.say}</p>}
          <HintBox hints={ex.hints} shown={log.hints} onHint={log.useHint} done={done} />
          <Feedback tone={msg?.tone ?? 'info'}>{msg?.text}</Feedback>
        </>
      }
    />
  );
}

/* ------------------------------- square ------------------------------- */

function SquareEx({ ex, onSolved }: ExerciseProps<SquareExercise>) {
  const [t, setT] = useState(0);
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad' | 'info'; text: string } | null>(null);
  const log = useAttemptLog(ex.hints.length);
  const board = useMemo(() => boardOf(ex.board.fen), [ex]);
  const done = t >= ex.targets.length;
  const ask = done ? '' : ex.asks?.[t] ?? `Click ${ex.targets[t]}.`;
  const click = (sq: number) => {
    if (done) return;
    const name = squareName(sq);
    if (name !== ex.targets[t]) {
      log.miss();
      return setMsg({ tone: 'bad', text: `That was ${name}. ${ask}` });
    }
    log.hit();
    if (t + 1 >= ex.targets.length) {
      setT(t + 1);
      setMsg({ tone: 'good', text: ex.explain });
      onSolved(log.record());
    } else {
      setT(t + 1);
      setMsg({ tone: 'good', text: `Yes, that is ${name}.` });
    }
  };
  return (
    <Layout
      prompt={ex.prompt}
      board={<SquareBoard board={board} orientation={ex.board.orientation ?? 'white'} label={ex.prompt} onSquare={click} disabled={done} extras={specExtras({ ...ex.board })} />}
      side={
        <>
          {!done && <p className="ac-task" aria-live="polite"><strong>{ask}</strong> <span className="muted">({t + 1} of {ex.targets.length})</span></p>}
          <HintBox hints={ex.hints} shown={log.hints} onHint={log.useHint} done={done} />
          <Feedback tone={msg?.tone ?? 'info'}>{msg?.text}</Feedback>
        </>
      }
    />
  );
}

/* --------------------------------- ask -------------------------------- */

function AskEx({ ex, onSolved }: ExerciseProps<AskExercise>) {
  const [picked, setPicked] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad' | 'info'; text: string } | null>(null);
  const log = useAttemptLog(ex.hints.length);
  const [done, setDone] = useState(false);
  const choose = (i: number) => {
    if (done) return;
    setPicked(i);
    if (i === ex.answer) {
      log.hit();
      setDone(true);
      setMsg({ tone: 'good', text: ex.explain });
      onSolved(log.record());
    } else {
      log.miss();
      setMsg({ tone: 'bad', text: ex.wrong?.[i] ?? 'Not quite. Read the options again or ask for a hint.' });
    }
  };
  return (
    <Layout
      prompt={ex.prompt}
      board={ex.board ? <StaticBoard spec={ex.board} label={ex.prompt} /> : null}
      side={
        <>
          <div className="ac-options" role="group" aria-label="Answers">
            {ex.options.map((o, i) => (
              <button key={i} type="button" className={`ac-option${picked === i ? (i === ex.answer ? ' right' : ' wrong') : ''}`} onClick={() => choose(i)} aria-pressed={picked === i} disabled={done && i !== ex.answer}>
                {o}
              </button>
            ))}
          </div>
          <HintBox hints={ex.hints} shown={log.hints} onHint={log.useHint} done={done} />
          <Feedback tone={msg?.tone ?? 'info'}>{msg?.text}</Feedback>
        </>
      }
    />
  );
}

export function Exercise({ step, onSolved, solvedBefore }: { step: ExerciseStep; onSolved: (rec: ExerciseRecord) => void; solvedBefore: boolean }) {
  const common = { onSolved, solvedBefore };
  switch (step.kind) {
    case 'move': return <MoveEx key={step.id} ex={step} {...common} />;
    case 'reach': return <ReachEx key={step.id} ex={step} {...common} />;
    case 'place': return <PlaceEx key={step.id} ex={step} {...common} />;
    case 'square': return <SquareEx key={step.id} ex={step} {...common} />;
    case 'ask': return <AskEx key={step.id} ex={step} {...common} />;
  }
}
