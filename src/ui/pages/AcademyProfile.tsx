/** Learning analytics for the Profile. Every figure comes from the learner's own Academy records; nothing is estimated. */
import { COURSES, CURRICULUM_INDEX, TOTAL_LESSONS } from '../../academy/curriculum';
import { courseState } from '../../academy/progress';
import { useAcademyData } from '../academyData';

const pct = (x: number) => `${Math.round(x * 100)}%`;

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="tile">
      <dt>{label}</dt>
      <dd>{value}</dd>
      {hint && <span className="muted small">{hint}</span>}
    </div>
  );
}

export function AcademyProfile() {
  const data = useAcademyData();
  if (!data.loaded) return null;
  const ev = data.evidence;
  const states = COURSES.map((c) => ({ c, s: courseState(c, ev, CURRICULUM_INDEX) }));
  const completed = states.reduce((n, x) => n + x.s.lessonsCompleted, 0);
  const placed = states.reduce((n, x) => n + (x.s.lessonsKnown - x.s.lessonsCompleted), 0);
  const mastered = states.reduce((n, x) => n + x.s.lessonsMastered, 0);
  const lessonStates = states.flatMap((x) => x.s.chapters.flatMap((ch) => ch.state.lessons));
  const review = lessonStates.filter((l) => l.state.status === 'needs-review');
  const coursesDone = states.filter((x) => x.s.status === 'completed' || x.s.status === 'mastered').length;
  // Knowledge checks: every recorded attempt of every lesson check, chapter check and assessment.
  const attempts = [
    ...[...ev.lessonRecords.values()].flatMap((r) => r.checks),
    ...[...ev.assessments.values()].filter((a) => !a.placed).flatMap((a) => a.attempts),
  ];
  const avg = attempts.length ? attempts.reduce((a, c) => a + c.score, 0) / attempts.length : null;
  const started = ev.lessonRecords.size > 0 || ev.assessments.size > 0;
  // Topics: only those with at least one completed lesson. A weak average on a topic is shown as needing practice.
  const byTopic = new Map<string, { n: number; scores: number[] }>();
  for (const l of lessonStates) {
    if (l.state.placed || !['completed', 'mastered', 'needs-review'].includes(l.state.status)) continue;
    const t = byTopic.get(l.loc.lesson.topic) ?? { n: 0, scores: [] };
    t.n++;
    if (l.state.bestScore !== null) t.scores.push(l.state.bestScore);
    byTopic.set(l.loc.lesson.topic, t);
  }
  return (
    <section className="card" aria-labelledby="h-academy">
      <h2 id="h-academy">Academy</h2>
      {!started ? (
        <p className="muted">No Academy lessons yet. <a href="#/academy">Open the Academy</a> to start; progress will be tracked here from your own results.</p>
      ) : (
        <>
          <dl className="tiles">
            <Tile label="Lessons completed" value={`${completed}/${TOTAL_LESSONS}`} hint={placed > 0 ? `${placed} more known from placement checks` : undefined} />
            <Tile label="Lessons mastered" value={String(mastered)} hint="confirmed by a second check, an assessment or puzzles" />
            <Tile label="Courses completed" value={`${coursesDone}/${COURSES.length}`} />
            <Tile label="Average check score" value={avg === null ? '—' : pct(avg)} hint={attempts.length ? `over ${attempts.length} check ${attempts.length === 1 ? 'attempt' : 'attempts'}` : undefined} />
          </dl>
          {review.length > 0 && (
            <>
              <h3>Worth a refresher</h3>
              <ul className="list">
                {review.slice(0, 5).map((l) => (
                  <li key={l.loc.lesson.id}>
                    <span className="grow"><a href={`#/academy/lesson/${l.loc.lesson.id}`}>{l.loc.lesson.title}</a><span className="muted small"> {l.state.notes[0]}</span></span>
                    <span className="badge loss">Needs review</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {byTopic.size > 0 && (
            <>
              <h3>Topics you have studied</h3>
              <ul className="list">
                {[...byTopic.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([topic, t]) => (
                  <li key={topic}><span className="grow">{topic}</span><span className="muted small">{t.n} {t.n === 1 ? 'lesson' : 'lessons'}{t.scores.length ? ` · best checks average ${pct(t.scores.reduce((a, b) => a + b, 0) / t.scores.length)}` : ''}</span></li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      <p className="muted small">Lessons you skipped with a placement check are never counted as completed.</p>
    </section>
  );
}
