import { useMemo, useState } from 'react';
import { CURRICULUM_INDEX } from '../../academy/curriculum';
import { exercisesDone, lessonState, STATUS_LABEL } from '../../academy/progress';
import { PASS_SCORE, MASTERY_SCORE, type ExerciseRecord, type Lesson, type LessonRecord } from '../../academy/types';
import { themeLabel } from '../../puzzles/themes';
import { CHECKED_THEMES, checkMotif } from '../../puzzles/motif';
import { useLibrary } from '../puzzleData';
import { useAcademyActions, useAcademyData } from '../academyData';
import { Demo, Exercise } from '../academy/Exercises';
import { Runner } from '../academy/Runner';
import { StaticBoard } from '../academy/view';

export function AcademyLessonPage({ id }: { id: string }) {
  const data = useAcademyData();
  const loc = CURRICULUM_INDEX.lessons.get(id);
  if (!loc) return <div className="card"><h1>Lesson not found</h1><p><a href="#/academy">Back to the Academy</a></p></div>;
  if (!data.loaded) return <p className="muted" role="status">Loading your progress…</p>;
  const rec = data.evidence.lessonRecords.get(id);
  return <Player key={id} lesson={loc.lesson} rec={rec} data={data} />;
}

function Player({ lesson, rec, data }: { lesson: Lesson; rec: LessonRecord | undefined; data: ReturnType<typeof useAcademyData> }) {
  const actions = useAcademyActions(data);
  const loc = CURRICULUM_INDEX.lessons.get(lesson.id)!;
  const n = lesson.steps.length;
  // Resume where the learner stopped, unless the lesson is finished (then start from the beginning to review).
  const [step, setStep] = useState(() => (rec && rec.completedAt === undefined ? Math.min(rec.step, n) : 0));
  const [solved, setSolved] = useState<Record<string, ExerciseRecord>>(() => rec?.exercises ?? {});
  const [done, setDone] = useState<boolean>(rec?.completedAt !== undefined);
  const state = lessonState(loc, data.evidence, CURRICULUM_INDEX);
  const cur = step < n ? lesson.steps[step]! : null;
  const exSolved = (i: number) => {
    const s = lesson.steps[i]!;
    return !('id' in s) || solved[s.id]?.solved === true;
  };
  const goto = (s: number) => {
    setStep(s);
    void actions.saveLessonProgress(lesson, s);
    window.scrollTo?.({ top: 0 });
  };
  const next = CURRICULUM_INDEX.order[CURRICULUM_INDEX.order.indexOf(loc) + 1];
  const nextLesson = next && next.course.id === loc.course.id ? next : null;
  const allEx = useMemo(() => exercisesDone(lesson, { ...(rec ?? ({} as LessonRecord)), exercises: solved }), [lesson, rec, solved]);
  return (
    <div className="stack ac-page">
      <nav className="ac-crumbs" aria-label="Breadcrumb">
        <a href="#/academy">Academy</a> › <a href={`#/academy/course/${loc.course.id}`}>{loc.course.title}</a> › <span>{loc.chapter.title}</span>
      </nav>
      <header>
        <h1 style={{ marginBottom: 4 }}>{lesson.title}</h1>
        <p className="muted">{lesson.minutes} min · {STATUS_LABEL[state.status]}{state.placed ? ' (known from placement)' : ''}</p>
        {step === 0 && (
          <ul className="ac-objectives" aria-label="What you will learn">
            {lesson.objectives.map((o) => <li key={o}>{o}</li>)}
          </ul>
        )}
        <progress className="ac-progress" max={n + 1} value={step} aria-label={`Lesson progress: ${step < n ? `step ${step + 1} of ${n}` : 'knowledge check'}`} />
      </header>

      <section className="card" aria-label={cur ? `Step ${step + 1} of ${n}` : 'Knowledge check'}>
        {cur?.kind === 'read' && (
          <div className="ac-step">
            {cur.board && <div className="ac-boardcol"><StaticBoard spec={cur.board} label={cur.title ?? 'Diagram'} /></div>}
            <div className="ac-side ac-read">
              {cur.title && <h2>{cur.title}</h2>}
              {cur.text.map((t, i) => <p key={i}>{t}</p>)}
            </div>
          </div>
        )}
        {cur?.kind === 'demo' && <Demo key={step} step={cur} />}
        {cur && cur.kind !== 'read' && cur.kind !== 'demo' && (
          <Exercise
            key={cur.id}
            step={cur}
            solvedBefore={solved[cur.id]?.solved === true}
            onSolved={(r) => {
              const prev = solved[cur.id];
              const merged: ExerciseRecord = { ...r, clean: r.clean || prev?.clean === true, hints: Math.min(r.hints, prev?.hints ?? r.hints) };
              setSolved((s) => ({ ...s, [cur.id]: merged }));
              void actions.saveLessonProgress(lesson, step, { id: cur.id, rec: merged });
            }}
          />
        )}
        {!cur && (
          allEx ? (
            <Runner
              title={`${lesson.title}: knowledge check`}
              questions={lesson.check}
              pass={PASS_SCORE}
              mastery={MASTERY_SCORE}
              passText="Lesson complete."
              onFinish={async (a) => { const r = await actions.finishLessonCheck(lesson, lesson.topic, a); setDone(r.completedAt !== undefined); }}
              after={({ passed }) => (
                <div className="ac-after">
                  {passed && done && <p>Mastery comes from using the idea again: pass this check on another day, ace the chapter check, or solve puzzles on it cleanly.</p>}
                  {lesson.puzzleThemes && lesson.puzzleThemes.length > 0 && passed && <PuzzlePractice themes={lesson.puzzleThemes} />}
                  <div className="ac-row">
                    {passed && nextLesson && <a className="btn primary" href={`#/academy/lesson/${nextLesson.lesson.id}`}>Next lesson: {nextLesson.lesson.title}</a>}
                    <a className="btn" href={`#/academy/course/${loc.course.id}`}>Back to the course</a>
                  </div>
                </div>
              )}
            />
          ) : (
            <div>
              <h2>A few exercises are still open</h2>
              <p>Finish every exercise in the lesson to unlock the knowledge check.</p>
              <button className="btn" type="button" onClick={() => goto(Math.max(0, lesson.steps.findIndex((_, i) => !exSolved(i))))}>Go to the first open exercise</button>
            </div>
          )
        )}
      </section>

      {cur && (
        <div className="ac-nav">
          <button className="btn" type="button" disabled={step === 0} onClick={() => goto(step - 1)}>Back</button>
          <span className="muted" aria-hidden="true">Step {step + 1} of {n}</span>
          <button className="btn primary" type="button" disabled={!exSolved(step)} onClick={() => goto(step + 1)}>
            {step + 1 >= n ? 'Go to the check' : 'Next'}
          </button>
          {!exSolved(step) && <span className="muted">Solve this exercise to continue.</span>}
        </div>
      )}
      {!cur && step > 0 && (
        <div className="ac-nav"><button className="btn" type="button" onClick={() => goto(n - 1)}>Back to the lesson</button></div>
      )}
    </div>
  );
}


/** Minimum number of puzzles for which MoveWise itself found the pattern, before a practice link is offered. */
const MIN_CONFIRMED = 8;

/**
 * Puzzle practice for a lesson. Lichess's theme tags are not guaranteed, so for themes MoveWise can check it counts the puzzles
 * in which it found the pattern itself and sends the learner only to those; if there are too few it says so. For themes it cannot check, it
 * links the tagged puzzles and says that they are tagged, not verified.
 */
function PuzzlePractice({ themes }: { themes: string[] }) {
  const { library, error } = useLibrary();
  const rows = useMemo(() => themes.map((t) => {
    const tagged = library ? library.puzzles.filter((p) => p.themes.includes(t)) : [];
    const checkable = CHECKED_THEMES.has(t);
    const confirmed = checkable ? tagged.filter((p) => checkMotif(p, t) === 'confirmed').length : 0;
    return { t, tagged: tagged.length, checkable, confirmed };
  }), [library, themes]);
  return (
    <>
      <h3>Practise it on real puzzles</h3>
      {!library && !error && <p>Checking the puzzle collection…</p>}
      {error && <p>The puzzle collection could not be loaded, so there are no puzzle suggestions right now.</p>}
      {library && rows.map((r) => (
        <div key={r.t} className="ac-row" data-testid={`practice-${r.t}`}>
          {r.checkable && r.confirmed >= MIN_CONFIRMED && (
            <><a className="btn" href={`#/puzzles/play/confirmed/${r.t}`}>{themeLabel(r.t)} puzzles</a><span className="muted">{r.confirmed} puzzles in which MoveWise found the pattern itself (of {r.tagged} tagged by Lichess).</span></>
          )}
          {r.checkable && r.confirmed < MIN_CONFIRMED && (
            <span className="muted">Not enough matching puzzles for {themeLabel(r.t).toLowerCase()}: MoveWise found the pattern in only {r.confirmed} of the {r.tagged} tagged ones, so it is not recommending any. The exercises in this lesson are the practice for now.</span>
          )}
          {!r.checkable && r.tagged >= MIN_CONFIRMED && (
            <><a className="btn" href={`#/puzzles/play/theme/${r.t}`}>{themeLabel(r.t)} puzzles</a><span className="muted">{r.tagged} puzzles tagged this way by Lichess. MoveWise cannot yet check this pattern automatically, so the tag is taken as given.</span></>
          )}
          {!r.checkable && r.tagged < MIN_CONFIRMED && (
            <span className="muted">Not enough puzzles for {themeLabel(r.t).toLowerCase()} in the installed collection, so none are recommended.</span>
          )}
        </div>
      ))}
    </>
  );
}
