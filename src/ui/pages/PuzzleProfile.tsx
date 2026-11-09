import { useMemo } from 'react';
import { dailyStreak, localDateKey } from '../../puzzles/daily';
import { RUSH_MINUTES, highScore } from '../../puzzles/rush';
import { isClean, themeSkills, type SkillLevel } from '../../puzzles/skills';
import { themeLabel } from '../../puzzles/themes';
import { LineChart } from '../charts';
import { usePuzzleData } from '../puzzleData';
import { formatDate } from '../shared';

/** Below this many attempts a rate is shown as a count only: a handful of puzzles says nothing about skill. */
const ENOUGH = 5;
const pct = (n: number, d: number): string => (d >= ENOUGH ? `${Math.round((n / d) * 100)}%` : `${n} of ${d}`);
const LEVEL: Record<SkillLevel, string> = { unknown: 'too few puzzles', weak: 'needs work', learning: 'improving', mastered: 'mastered' };

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="tile">
      <dt>{label}</dt>
      <dd>{value}</dd>
      {hint && <span className="muted small">{hint}</span>}
    </div>
  );
}

/** Puzzle analytics for the Profile. Built from the saved attempts only; positions from the player's own games are excluded. */
export function PuzzleProfile() {
  const data = usePuzzleData();
  const own = data.events.filter((e) => e.puzzleId.startsWith('game:'));
  const events = useMemo(() => data.events.filter((e) => !e.puzzleId.startsWith('game:')), [data.events]);
  const skills = useMemo(() => themeSkills(events), [events]);
  const r = data.rating;

  if (!data.loaded) return <section className="card"><h2>Tactics and puzzles</h2><p className="muted" role="status">Loading…</p></section>;

  if (events.length === 0) {
    return (
      <section className="card" aria-labelledby="h-tac">
        <h2 id="h-tac">Tactics and puzzles</h2>
        <p className="muted small">Your puzzle rating is separate from your playing strength and from lesson progress, and is never mixed into either.</p>
        <p className="muted">No puzzles played yet, so no number is shown. Your puzzle rating, solving accuracy and progress by theme appear here after your first puzzles.</p>
        <a className="btn primary" href="#/puzzles">Open Puzzles</a>
      </section>
    );
  }

  const solved = events.filter((e) => e.solved);
  const clean = events.filter(isClean);
  const hinted = events.filter((e) => e.hintsUsed > 0);
  const hintedSolved = hinted.filter((e) => e.solved);
  const timed = solved.filter((e) => e.timeMs > 0);
  const avgSolve = timed.length ? timed.reduce((a, e) => a + e.timeMs, 0) / timed.length : null;
  const rated = events.filter((e) => e.rated);

  const themeRows = [...skills.values()].sort((a, b) => b.attempts - a.attempts).slice(0, 10);
  const buckets: Array<[string, (n: number) => boolean]> = [
    ['Under 1000', (n) => n < 1000],
    ['1000 to 1399', (n) => n >= 1000 && n < 1400],
    ['1400 to 1799', (n) => n >= 1400 && n < 1800],
    ['1800 and up', (n) => n >= 1800],
  ];
  const today = localDateKey(Date.now());
  const dailySolved = data.daily.filter((d) => d.solvedAt).length;
  const streak = dailyStreak(data.daily, today);
  const rushBests = RUSH_MINUTES.map((m) => [m, highScore(data.rush, m)] as const).filter(([, s]) => s);
  const pts = r.history;

  return (
    <section className="card" aria-labelledby="h-tac">
      <h2 id="h-tac">Tactics and puzzles</h2>
      <p className="muted small">Your puzzle rating is separate from your playing strength and from lesson progress, and is never mixed into either.</p>
      <dl className="tiles">
        <Tile label="Puzzle rating" value={r.attempts ? String(Math.round(r.rating)) : '—'} hint={r.attempts ? `± ${Math.round(r.rd * 1.96)}${r.provisional ? ' · provisional' : ''}` : 'no rated puzzle yet'} />
        <Tile label="Peak" value={r.peak === null ? '—' : String(Math.round(r.peak))} hint={r.peak === null ? 'shown once the rating settles' : undefined} />
        <Tile label="Solved" value={`${solved.length}/${events.length}`} hint={pct(solved.length, events.length)} />
        <Tile label="Solved cleanly" value={pct(clean.length, events.length)} hint="no hint, no wrong move" />
      </dl>

      {pts.length >= 2 ? (
        <LineChart
          ariaLabel="Puzzle rating after each rated puzzle"
          yLabel="Puzzle rating"
          xLabel="Rated puzzle"
          points={pts.map((p, i) => ({ y: p.rating, label: `#${i + 1} · ${formatDate(p.at)}`, detail: `${Math.round(p.rating)} ± ${Math.round(p.rd * 1.96)}`, band: { low: p.rating - p.rd, high: p.rating + p.rd } }))}
        />
      ) : (
        <p className="muted small">A rating trend needs at least two rated puzzles. {rated.length} so far.</p>
      )}
      <p className="muted small">{rated.length} rated · {events.length - rated.length} not rated (repeats, daily replays and Puzzle Rush). Only the first attempt at each puzzle counts, and time is never used.</p>

      <h3>By theme</h3>
      {themeRows.length === 0 ? (
        <p className="muted small">No theme data yet.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="pz-table" data-testid="profile-themes">
            <thead><tr><th>Theme</th><th>Puzzles</th><th>Solved cleanly</th><th>Level</th></tr></thead>
            <tbody>
              {themeRows.map((t) => (
                <tr key={t.theme}>
                  <td>{themeLabel(t.theme)}</td>
                  <td>{t.attempts}</td>
                  <td>{pct(t.clean, t.attempts)}</td>
                  <td>{LEVEL[t.level]}{t.hotStreak ? ' · strong run' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">A level needs at least {ENOUGH} puzzles of a theme. “Mastered” also needs 10 attempts over 3 different days with recent clean solves: a lucky streak is shown as “strong run”, never as mastery.</p>

      <h3>How you solve</h3>
      <dl className="tiles">
        <Tile label="Used a hint" value={pct(hinted.length, events.length)} hint={hinted.length ? `${pct(hintedSolved.length, hinted.length)} of those solved` : undefined} />
        <Tile label="Avg. solve time" value={avgSolve === null ? '—' : `${Math.round(avgSolve / 1000)} s`} hint="solved puzzles only" />
        <Tile label="Solved after a miss" value={String(events.filter((e) => e.retrySolved).length)} hint="retry in the same sitting" />
        <Tile label="Viewed the solution" value={String(events.filter((e) => e.usedSolution).length)} />
      </dl>
      <ul className="list">
        {buckets.map(([label, f]) => {
          const list = events.filter((e) => f(e.puzzleRating));
          return list.length ? <li key={label}><span className="grow">Puzzles rated {label}</span><span>{pct(list.filter(isClean).length, list.length)} clean · {list.length} played</span></li> : null;
        })}
      </ul>

      <h3>Consistency</h3>
      <dl className="tiles">
        <Tile label="Daily puzzles solved" value={String(dailySolved)} hint={streak ? `${streak}-day streak` : undefined} />
        <Tile label="From your own games" value={String(own.filter((e) => e.solved).length)} hint="not part of the puzzle rating" />
        {rushBests.map(([m, s]) => <Tile key={m} label={`Rush ${m} min`} value={String(s!.solved)} hint="best, not rated" />)}
      </dl>
      <p className="small"><a href="#/puzzles">Open Puzzles</a> · <a href="#/puzzles/history">History</a></p>
    </section>
  );
}
