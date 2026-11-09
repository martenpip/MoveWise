/** "Lessons that could help" on a reviewed game. Shown only when the player's own results support it (see academy/recommend.ts). */
import { CURRICULUM_INDEX } from '../../academy/curriculum';
import { useAcademyData } from '../academyData';

export function AcademySuggestions({ gameId }: { gameId: string }) {
  const data = useAcademyData();
  if (!data.loaded) return null;
  const mine = data.reviews.find((r) => r.gameId === gameId);
  if (!mine) return null;
  const recs = data.plan.evidence.filter((r) => {
    if (r.kind === 'game-phase') return true;
    if (r.kind !== 'game-weakness') return false;
    const lesson = CURRICULUM_INDEX.lessons.get(r.lessonId)?.lesson;
    return !!lesson?.reviewTags?.some((t) => mine.weaknesses.includes(t));
  });
  if (recs.length === 0) return null;
  return (
    <section className="card" aria-labelledby="h-rv-academy" data-testid="review-academy">
      <h2 id="h-rv-academy">Lessons that could help</h2>
      <ul className="list">
        {recs.slice(0, 3).map((r) => (
          <li key={r.lessonId}>
            <div className="grow">
              <a href={`#/academy/lesson/${r.lessonId}`}><strong>{r.title}</strong></a>
              <div className="muted">{r.reason}</div>
              {r.evidence && <div className="muted small">{r.evidence}</div>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
