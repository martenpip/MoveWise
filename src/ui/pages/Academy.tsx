import { useState } from 'react';
import { COURSES, CURRICULUM_INDEX, PATHS, TOTAL_LESSONS } from '../../academy/curriculum';
import {
  COURSE_MASTERY, COURSE_PASS, STATUS_LABEL, assessState, courseAccess, courseState, isPlaced, type Status,
} from '../../academy/progress';
import { currentPath, startAdvice, MIN_REVIEW_GAMES, type Recommendation } from '../../academy/recommend';
import { MIN_ATTEMPTS } from '../../puzzles/skills';
import { PASS_SCORE, PLACEMENT_SCORE, MASTERY_SCORE, type Course, type MetaRecord, type Question } from '../../academy/types';
import { useAcademyActions, useAcademyData, type AcademyData } from '../academyData';
import { Runner } from '../academy/Runner';
import { usePuzzleData } from '../puzzleData';
import { AcademyLessonPage } from './AcademyLesson';

export function AcademyRoutes({ route }: { route: string }) {
  const [, , kind, rawId] = route.split('/');
  const id = rawId ? decodeURIComponent(rawId) : '';
  if (kind === 'lesson' && id) return <AcademyLessonPage key={id} id={id} />;
  if (kind === 'course' && id) return <CoursePage key={id} id={id} />;
  if (kind === 'assess' && id) return <AssessPage key={id} id={id} placement={false} />;
  if (kind === 'place' && id) return <AssessPage key={id} id={id} placement />;
  return <Dashboard />;
}

const STATUS_CLASS: Record<Status, string> = { 'not-started': '', 'in-progress': 'soon', completed: 'win', mastered: 'win', 'needs-review': 'loss' };
export function StatusBadge({ status }: { status: Status }) {
  return <span className={`badge ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>;
}

const LEVELS: Array<{ id: NonNullable<MetaRecord['level']>; label: string; text: string }> = [
  { id: 'new', label: 'I am new to chess', text: 'Start from the board and the pieces.' },
  { id: 'rules', label: 'I know the rules', text: 'Skip ahead after a short placement check.' },
  { id: 'regular', label: 'I play regularly', text: 'Go to tactics and strategy.' },
  { id: 'advanced', label: 'I am an experienced player', text: 'Go to advanced courses.' },
];

function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  return <progress className="ac-progress" value={value} max={Math.max(1, max)} aria-label={label} />;
}

function RecRow({ r, tag }: { r: Recommendation; tag?: string }) {
  return (
    <li>
      <div className="grow">
        <a href={`#/academy/lesson/${r.lessonId}`}><strong>{r.title}</strong></a> {tag && <span className="badge">{tag}</span>}
        <div className="muted">{r.reason}</div>
        {r.evidence && <div className="ac-evidence">{r.evidence}</div>}
      </div>
    </li>
  );
}

/* ------------------------------ dashboard ------------------------------ */

function Dashboard() {
  const data = useAcademyData();
  const puzzles = usePuzzleData();
  const actions = useAcademyActions(data);
  const [changing, setChanging] = useState(false);
  if (!data.loaded) return <p className="muted" role="status">Loading the Academy…</p>;
  const { evidence, plan } = data;
  const states = COURSES.map((c) => ({ course: c, state: courseState(c, evidence, CURRICULUM_INDEX), access: courseAccess(c, evidence, CURRICULUM_INDEX) }));
  const done = states.reduce((n, s) => n + s.state.lessonsCompleted, 0);
  const known = states.reduce((n, s) => n + s.state.lessonsKnown, 0);
  const mastered = states.reduce((n, s) => n + s.state.lessonsMastered, 0);
  const started = evidence.lessonRecords.size > 0 || evidence.assessments.size > 0;
  const level = evidence.meta?.level;
  const advice = startAdvice(evidence, puzzles.loaded && puzzles.rating.attempts > 0 ? { rating: puzzles.rating.rating, attempts: puzzles.rating.attempts } : null, null);
  const path = currentPath(PATHS, CURRICULUM_INDEX, evidence);
  const picking = !level && !started || changing;
  return (
    <div className="stack ac-page" style={{ maxWidth: 980, margin: '0 auto' }}>
      <header>
        <h1 style={{ marginBottom: 4 }}>Chess Academy</h1>
        <p className="muted">Lessons, exercises and knowledge checks. Everything works offline, and your progress stays on this device.</p>
      </header>

      {picking && (
        <section className="card" aria-labelledby="ac-level">
          <h2 id="ac-level">Where would you like to start?</h2>
          <p className="muted">This only picks a starting point. You can open any course at any time.</p>
          <div className="ac-levels">
            {LEVELS.map((l) => (
              <button key={l.id} type="button" className="ac-level" onClick={async () => { await actions.setMeta({ level: l.id }); setChanging(false); }}>
                <strong>{l.label}</strong>
                <span className="muted">{l.text}</span>
              </button>
            ))}
          </div>
          {changing && <button className="btn" type="button" onClick={() => setChanging(false)}>Cancel</button>}
        </section>
      )}

      {!picking && (
        <section className="card" aria-labelledby="ac-next">
          <h2 id="ac-next">Your next step</h2>
          {plan.continue && (
            <p>
              <a className="btn primary" href={`#/academy/lesson/${plan.continue.lessonId}`}>Continue: {plan.continue.title}</a>
              <span className="muted"> {plan.continue.reason}</span>
            </p>
          )}
          {plan.next && (
            <p>
              <a className={`btn${plan.continue ? '' : ' primary'}`} href={`#/academy/lesson/${plan.next.lessonId}`}>Start: {plan.next.title}</a>
              <span className="muted"> {plan.next.reason}</span>
            </p>
          )}
          {!plan.continue && !plan.next && <p>You have worked through the lessons on your current path. Pick any course below to go further.</p>}
          {!started && (
            <>
              <p className="muted">{advice.why}</p>
              {advice.placement.length > 0 && (
                <p>{advice.placement.map((c) => {
                  const course = CURRICULUM_INDEX.courseById.get(c);
                  return course ? <a key={c} className="btn" href={`#/academy/place/${c}`} style={{ marginRight: 8 }}>Placement check: {course.title}</a> : null;
                })}</p>
              )}
            </>
          )}
          <p className="muted ac-small">
            {level ? `You said: “${LEVELS.find((l) => l.id === level)?.label}”. ` : ''}
            <button className="linklike" type="button" onClick={() => setChanging(true)}>Change</button>
          </p>
        </section>
      )}

      <section className="card" aria-labelledby="ac-progress">
        <h2 id="ac-progress">Your progress</h2>
        <p>
          <strong>{done}</strong> of {TOTAL_LESSONS} lessons completed · <strong>{mastered}</strong> mastered
          {known > done ? ` · ${known - done} more known from placement checks` : ''}
        </p>
        <Bar value={known} max={TOTAL_LESSONS} label="Lessons completed or known" />
        {path && <p className="muted">Current path: <strong>{path.title}</strong>. {path.blurb}</p>}
      </section>

      {plan.review.length > 0 && (
        <section className="card" aria-labelledby="ac-review">
          <h2 id="ac-review">Worth revisiting</h2>
          <ul className="list">{plan.review.slice(0, 5).map((r) => <RecRow key={r.lessonId} r={r} />)}</ul>
        </section>
      )}

      <section className="card" aria-labelledby="ac-evidence">
        <h2 id="ac-evidence">Based on your results</h2>
        {plan.evidence.length > 0 ? (
          <ul className="list">{plan.evidence.slice(0, 5).map((r) => <RecRow key={r.lessonId} r={r} />)}</ul>
        ) : (
          <p className="muted">
            Nothing is suggested from your results yet. Lessons are recommended when the same puzzle theme keeps going wrong (at least {MIN_ATTEMPTS} puzzles on it) or Game Review finds the same weakness in at least {MIN_REVIEW_GAMES} of your games. Until then the Academy will not guess.
          </p>
        )}
      </section>

      <section aria-labelledby="ac-courses">
        <h2 id="ac-courses">Courses</h2>
        <div className="ac-courses">
          {states.map(({ course, state, access }) => (
            <article key={course.id} className="card ac-course">
              <div className="ac-row spread">
                <h3><a href={`#/academy/course/${course.id}`}>{course.title}</a></h3>
                <StatusBadge status={state.status} />
              </div>
              <p className="muted">{course.level[0]!.toUpperCase() + course.level.slice(1)} · {state.lessonsTotal} lessons</p>
              <p>{course.blurb}</p>
              <Bar value={state.lessonsKnown} max={state.lessonsTotal} label={`${course.title}: lessons done`} />
              <p className="muted ac-small">
                {state.placed ? 'Passed by placement check.' : `${state.lessonsCompleted} of ${state.lessonsTotal} completed`}
                {!access.open && ` · recommended first: ${access.missing.map((m) => m.title).join(', ')}`}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

/* -------------------------------- course -------------------------------- */

function CoursePage({ id }: { id: string }) {
  const data = useAcademyData();
  const actions = useAcademyActions(data);
  const course = CURRICULUM_INDEX.courseById.get(id);
  if (!course) return <div className="card"><h1>Course not found</h1><p><a href="#/academy">Back to the Academy</a></p></div>;
  if (!data.loaded) return <p className="muted" role="status">Loading…</p>;
  const ev = data.evidence;
  const state = courseState(course, ev, CURRICULUM_INDEX);
  const access = courseAccess(course, ev, CURRICULUM_INDEX);
  const noWork = state.lessonsCompleted === 0 && state.chapters.every((c) => c.state.check.attempts === 0 && c.state.lessons.every((l) => l.state.status === 'not-started'));
  const placed = isPlaced(ev, course.id);
  return (
    <div className="stack ac-page" style={{ maxWidth: 860, margin: '0 auto' }}>
      <nav className="ac-crumbs" aria-label="Breadcrumb"><a href="#/academy">Academy</a> › <span>{course.title}</span></nav>
      <header>
        <div className="ac-row spread"><h1 style={{ marginBottom: 4 }}>{course.title}</h1><StatusBadge status={state.status} /></div>
        <p>{course.blurb}</p>
        <Bar value={state.lessonsKnown} max={state.lessonsTotal} label="Lessons done" />
        <p className="muted">{placed ? 'You passed this course by placement check.' : `${state.lessonsCompleted} of ${state.lessonsTotal} lessons completed · ${state.lessonsMastered} mastered`}</p>
      </header>

      {!access.open && (
        <div className="notice" role="note">
          <strong>Recommended first:</strong> {access.missing.map((m) => <a key={m.id} href={`#/academy/course/${m.id}`} style={{ marginRight: 8 }}>{m.title}</a>)}
          <p className="muted">This is a suggestion, not a lock. If you already know the material, take the placement check below, or open the course anyway.</p>
          <button className="btn" type="button" onClick={() => actions.setMeta({ opened: [...(ev.meta?.opened ?? []), course.id] })}>Open this course anyway</button>
        </div>
      )}

      {noWork && !placed && (
        <div className="notice" role="note">
          <strong>Already know this?</strong> Take the placement check. Score {Math.round(PLACEMENT_SCORE * 100)}% or more before starting any lesson and the course counts as known. Lessons you skip this way are shown separately and are never counted as completed.
          <div><a className="btn" href={`#/academy/place/${course.id}`}>Take the placement check</a></div>
        </div>
      )}

      {state.chapters.map(({ chapter, state: cs }) => (
        <section key={chapter.id} className="card" aria-labelledby={`ch-${chapter.id}`}>
          <div className="ac-row spread"><h2 id={`ch-${chapter.id}`}>{chapter.title}</h2><StatusBadge status={cs.status} /></div>
          <p className="muted">{chapter.blurb}</p>
          <ul className="list">
            {cs.lessons.map(({ loc, state: ls }) => (
              <li key={loc.lesson.id}>
                <div className="grow">
                  <a href={`#/academy/lesson/${loc.lesson.id}`}><strong>{loc.lesson.title}</strong></a>
                  <div className="muted">{loc.lesson.minutes} min{ls.placed ? ' · known from placement' : ''}{ls.bestScore !== null ? ` · best check ${Math.round(ls.bestScore * 100)}%` : ''}</div>
                  {ls.status === 'needs-review' && ls.notes[0] && <div className="ac-evidence">{ls.notes[0]}</div>}
                </div>
                <StatusBadge status={ls.status} />
              </li>
            ))}
          </ul>
          <div className="ac-row">
            <a className="btn" href={`#/academy/assess/${chapter.id}`}>Chapter check</a>
            <span className="muted">{cs.check.attempts ? `Best ${Math.round((cs.check.best ?? 0) * 100)}% · ${cs.check.passed ? 'passed' : `pass mark ${Math.round(PASS_SCORE * 100)}%`}` : `${chapter.check.length} questions · pass mark ${Math.round(PASS_SCORE * 100)}%`}</span>
          </div>
        </section>
      ))}

      <section className="card" aria-labelledby="ac-assessment">
        <h2 id="ac-assessment">Course assessment</h2>
        <p className="muted">{course.assessment.length} questions across the whole course. Pass at {Math.round(COURSE_PASS * 100)}% to complete the course; {Math.round(COURSE_MASTERY * 100)}% with mastered lessons earns Mastered. Retake it as often as you like.</p>
        <div className="ac-row">
          <a className="btn primary" href={`#/academy/assess/${course.id}`}>Take the assessment</a>
          <span className="muted">{state.assessment.attempts ? `${state.assessment.attempts} attempt${state.assessment.attempts === 1 ? '' : 's'} · best ${Math.round((state.assessment.best ?? 0) * 100)}%` : 'Not taken yet'}</span>
        </div>
      </section>
    </div>
  );
}

/* ------------------------- chapter / course checks ---------------------- */

function AssessPage({ id, placement }: { id: string; placement: boolean }) {
  const data = useAcademyData();
  const actions = useAcademyActions(data);
  const ch = CURRICULUM_INDEX.chapters.get(id);
  const course: Course | undefined = placement || !ch ? CURRICULUM_INDEX.courseById.get(id) : ch.course;
  if (!course || (ch && placement)) return <div className="card"><h1>Check not found</h1><p><a href="#/academy">Back to the Academy</a></p></div>;
  if (!data.loaded) return <p className="muted" role="status">Loading…</p>;
  const scope: 'chapter' | 'course' = ch && !placement ? 'chapter' : 'course';
  const questions: Question[] = scope === 'chapter' ? ch!.chapter.check : course.assessment;
  const pass = scope === 'chapter' ? PASS_SCORE : placement ? PLACEMENT_SCORE : COURSE_PASS;
  const title = placement ? `${course.title}: placement check` : scope === 'chapter' ? `${ch!.chapter.title}: chapter check` : `${course.title}: assessment`;
  const st = assessState(data.evidence, id, pass);
  const hasWork = CURRICULUM_INDEX.order.some((l) => l.course.id === course.id && data.evidence.lessonRecords.has(l.lesson.id));
  const allowPlacement = placement && !hasWork;
  return (
    <div className="stack ac-page" style={{ maxWidth: 980, margin: '0 auto' }}>
      <nav className="ac-crumbs" aria-label="Breadcrumb"><a href="#/academy">Academy</a> › <a href={`#/academy/course/${course.id}`}>{course.title}</a> › <span>{placement ? 'Placement check' : scope === 'chapter' ? 'Chapter check' : 'Assessment'}</span></nav>
      <h1 style={{ marginBottom: 4 }}>{title}</h1>
      {placement && (
        <div className="notice" role="note">
          {allowPlacement
            ? <>Score {Math.round(PLACEMENT_SCORE * 100)}% or more and this course counts as known, so you can move on. If you score less, nothing is lost: just start the lessons.</>
            : <>You have already worked on this course, so a placement check can no longer skip it. This run counts as a normal course assessment.</>}
        </div>
      )}
      {st.attempts > 0 && <p className="muted">Previous best: {Math.round((st.best ?? 0) * 100)}% over {st.attempts} attempt{st.attempts === 1 ? '' : 's'}.</p>}
      <section className="card">
        <Runner
          title={title}
          questions={questions}
          pass={pass}
          mastery={scope === 'course' ? COURSE_MASTERY : MASTERY_SCORE}
          passText={placement && allowPlacement ? 'You know this material. The course is marked as known from your placement check.' : scope === 'chapter' ? 'Chapter check passed.' : 'Course assessment passed.'}
          onFinish={async (a) => { await actions.finishAssessment(id, scope, title, a, placement); }}
          after={({ missed }) => (
            <div className="ac-after">
              {missed.length > 0 && <MissedLessons missed={missed} />}
              <div className="ac-row"><a className="btn" href={`#/academy/course/${course.id}`}>Back to the course</a></div>
            </div>
          )}
        />
      </section>
    </div>
  );
}

/** Lessons whose questions were missed, so the learner knows where to look. */
function MissedLessons({ missed }: { missed: Question[] }) {
  const ids = [...new Set(missed.map((q) => q.lesson).filter((x): x is string => !!x))];
  if (!ids.length) return null;
  return (
    <>
      <h3>Lessons to revisit</h3>
      <ul className="list">
        {ids.map((l) => {
          const loc = CURRICULUM_INDEX.lessons.get(l);
          return loc ? <li key={l}><a href={`#/academy/lesson/${l}`}>{loc.lesson.title}</a></li> : null;
        })}
      </ul>
    </>
  );
}

export type { AcademyData };
