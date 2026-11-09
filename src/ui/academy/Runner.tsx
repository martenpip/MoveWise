/**
 * Runs a set of knowledge-check questions (a lesson check, a chapter check, a course assessment or a placement check).
 * Every answer gets feedback and an explanation. When the run ends the score is reported once; the learner can retake
 * the whole set, or practise only the questions they missed (practice is not scored).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Position } from '../../chess/position';
import { parseSquare, squareName } from '../../chess/types';
import { gradeQuestion, legalAnswer, scoreOf, sideOf } from '../../academy/session';
import type { CheckAttempt, Question } from '../../academy/types';
import { MoveBoard, SquareBoard, StaticBoard, boardOf, specExtras } from './view';

interface Props {
  title: string;
  questions: Question[];
  /** Pass mark, for the wording of the result. */
  pass: number;
  mastery?: number;
  /** Called once per scored run, when it ends. */
  onFinish: (attempt: CheckAttempt) => Promise<void> | void;
  /** Extra content under the result (links to the next step). */
  after?: (r: { score: number; passed: boolean; missed: Question[] }) => ReactNode;
  /** Result wording for a pass. */
  passText?: string;
}

type Answer = number | string;

export function Runner({ title, questions, pass, mastery, onFinish, after, passText }: Props) {
  const [run, setRun] = useState(0);
  const [practice, setPractice] = useState<Question[] | null>(null);
  const [result, setResult] = useState<CheckAttempt | null>(null);
  const list = practice ?? questions;
  const finish = async (answers: Map<string, boolean>) => {
    if (practice) {
      setResult({ at: Date.now(), total: list.length, correct: list.filter((q) => answers.get(q.id)).map((q) => q.id), score: scoreOf([...answers.values()].filter(Boolean).length, list.length) });
      return;
    }
    const correct = questions.filter((q) => answers.get(q.id)).map((q) => q.id);
    const attempt: CheckAttempt = { at: Date.now(), total: questions.length, correct, score: scoreOf(correct.length, questions.length) };
    setResult(attempt);
    await onFinish(attempt);
  };
  if (result) {
    const missed = (practice ?? questions).filter((q) => !result.correct.includes(q.id));
    const passed = result.score >= pass;
    return (
      <div className="ac-result" role="region" aria-label={`${title} result`}>
        <h2>{practice ? 'Practice finished' : 'Check finished'}</h2>
        <p className="ac-score" aria-live="polite">{result.correct.length} of {result.total} correct ({Math.round(result.score * 100)}%)</p>
        {practice ? (
          <p>{missed.length ? 'Some are still tricky. Practice them again, or retake the full check when you are ready.' : 'You got every one right this time. Retake the full check to put it on the record.'}</p>
        ) : passed ? (
          <p className="ac-pass">{passText ?? 'Passed.'}{mastery && result.score >= mastery ? ' A strong result.' : ''}</p>
        ) : (
          <p>Not passed yet. You need {Math.round(pass * 100)}%. Review what you missed, then try again. Retries are unlimited.</p>
        )}
        {missed.length > 0 && (
          <section aria-label="Questions to revisit">
            <h3>Worth another look</h3>
            <ul className="ac-missed">
              {missed.map((q) => (
                <li key={q.id}>
                  <strong>{q.prompt}</strong>
                  <div className="muted">{q.explain}</div>
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className="ac-row">
          {missed.length > 0 && <button className="btn" type="button" onClick={() => { setPractice(missed); setResult(null); setRun((n) => n + 1); }}>Practise the {missed.length} I missed</button>}
          <button className="btn primary" type="button" onClick={() => { setPractice(null); setResult(null); setRun((n) => n + 1); }}>Retake the full check</button>
        </div>
        {!practice && after?.({ score: result.score, passed, missed })}
      </div>
    );
  }
  return <Questions key={run} title={practice ? `${title}: practice` : title} questions={list} onDone={finish} practice={!!practice} />;
}

function Questions({ title, questions, onDone, practice }: { title: string; questions: Question[]; onDone: (a: Map<string, boolean>) => void; practice: boolean }) {
  const [i, setI] = useState(0);
  const answers = useRef(new Map<string, boolean>());
  const [shown, setShown] = useState<{ ok: boolean; picked: Answer } | null>(null);
  const q = questions[i]!;
  const next = () => {
    if (i + 1 >= questions.length) onDone(answers.current);
    else { setI(i + 1); setShown(null); }
  };
  const answer = (a: Answer) => {
    if (shown) return;
    const ok = gradeQuestion(q, a);
    answers.current.set(q.id, ok);
    setShown({ ok, picked: a });
  };
  const headRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headRef.current?.focus(); }, [i]);
  const correctArrow = useMemo(() => {
    if (q.kind !== 'move') return undefined;
    const u = q.answers[0]!;
    return [{ from: parseSquare(u.slice(0, 2)), to: parseSquare(u.slice(2, 4)), tone: 'best' as const }];
  }, [q]);
  return (
    <div className="ac-questions">
      <p className="muted">{title} · question {i + 1} of {questions.length}{practice ? ' · not scored' : ''}</p>
      <progress className="ac-progress" max={questions.length} value={i + (shown ? 1 : 0)} aria-label="Progress through the check" />
      <h2 ref={headRef} tabIndex={-1} className="ac-qprompt">{q.prompt}</h2>
      <div className="ac-step">
        <div className="ac-boardcol">
          {q.kind === 'choice' && q.board && <StaticBoard spec={q.board} label={q.prompt} />}
          {q.kind === 'move' && <MoveQ key={q.id} q={q} disabled={!!shown} onAnswer={answer} arrows={shown && !shown.ok ? correctArrow : undefined} />}
          {q.kind === 'square' && <SquareQ key={q.id} q={q} disabled={!!shown} onAnswer={answer} reveal={shown && !shown.ok ? q.answers : undefined} picked={shown && typeof shown.picked === 'string' ? shown.picked : undefined} />}
        </div>
        <div className="ac-side">
          {q.kind === 'choice' && (
            <div className="ac-options" role="group" aria-label="Answers">
              {q.options.map((o, k) => (
                <button key={k} type="button" disabled={!!shown && !(k === q.answer || k === shown.picked)} className={`ac-option${shown ? (k === q.answer ? ' right' : k === shown.picked ? ' wrong' : '') : ''}`} onClick={() => answer(k)}>{o}</button>
              ))}
            </div>
          )}
          {q.kind === 'move' && !shown && <p className="muted">Play your answer on the board.</p>}
          {q.kind === 'square' && !shown && <p className="muted">Click your answer on the board.</p>}
          {shown && (
            <div className={`ac-feedback ${shown.ok ? 'good' : 'bad'}`} role="status" aria-live="polite">
              <strong>{shown.ok ? 'Correct.' : 'Not quite.'}</strong> {q.explain}
              {!shown.ok && q.kind === 'move' && <div className="muted">A good answer here: {sanOf(q)}.</div>}
              {!shown.ok && q.kind === 'square' && <div className="muted">The answer: {q.answers.join(' or ')}.</div>}
            </div>
          )}
          {shown && <button className="btn primary" type="button" onClick={next}>{i + 1 >= questions.length ? 'See result' : 'Next question'}</button>}
        </div>
      </div>
    </div>
  );
}

function sanOf(q: Extract<Question, { kind: 'move' }>): string {
  const pos = new Position(q.board.fen);
  const m = pos.parseUci(q.answers[0]!);
  return m === undefined ? q.answers[0]! : pos.toSan(m);
}

function MoveQ({ q, disabled, onAnswer, arrows }: { q: Extract<Question, { kind: 'move' }>; disabled: boolean; onAnswer: (a: string) => void; arrows?: Array<{ from: number; to: number; tone: 'best' }> }) {
  const pos = useMemo(() => new Position(q.board.fen), [q]);
  const [after, setAfter] = useState<Position | null>(null);
  return (
    <MoveBoard
      pos={after ?? pos}
      orientation={q.board.orientation ?? sideOf(q.board.fen)}
      label={`${q.prompt} ${sideOf(q.board.fen)} to move.`}
      disabled={disabled}
      extras={{ ...specExtras({ ...q.board, arrows: undefined }), arrows }}
      onMove={(uci) => {
        if (!legalAnswer(q, uci)) return;
        const p = pos.clone();
        p.makeMove(p.parseUci(uci)!);
        setAfter(p);
        onAnswer(uci);
      }}
    />
  );
}

function SquareQ({ q, disabled, onAnswer, reveal, picked }: { q: Extract<Question, { kind: 'square' }>; disabled: boolean; onAnswer: (a: string) => void; reveal?: string[]; picked?: string }) {
  const board = useMemo(() => boardOf(q.board.fen), [q]);
  const marks = [
    ...(reveal ?? []).map((s) => ({ sq: parseSquare(s), tone: 'good' as const })),
    ...(picked && reveal ? [{ sq: parseSquare(picked), tone: 'bad' as const }] : picked ? [{ sq: parseSquare(picked), tone: 'good' as const }] : []),
  ];
  return <SquareBoard board={board} orientation={q.board.orientation ?? 'white'} label={q.prompt} disabled={disabled} onSquare={(sq) => onAnswer(squareName(sq))} extras={{ ...specExtras({ ...q.board, marks: undefined }), highlights: marks }} />;
}
