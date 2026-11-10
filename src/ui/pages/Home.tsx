import { useEffect, useMemo, useState } from 'react';
import { getLevel } from '../../engine/levels';
import { buildProfileModel } from '../../profile/model';
import { suggestedLevel } from '../../profile/rating';
import type { CurrentGame } from '../../storage/types';
import { useApp } from '../app';
import { Avatar } from '../Avatar';
import { Sparkline } from '../charts';
import { useStoredData } from '../hooks';
import { Logo, NavIcon } from '../icons';
import { useAcademyData } from '../academyData';
import { insightsFrom } from '../../notebook/insights';
import { isDueToday, statusOf } from '../../notebook/srs';
import type { NotebookEntry } from '../../notebook/types';
import { CURRICULUM_INDEX } from '../../academy/curriculum';
import { formatDate } from '../shared';
import { outcomeFor } from './Games';

function greeting(hour: number): string {
  return hour < 5 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

interface Suggestion {
  title: string;
  body: string;
  href: string;
  cta: string;
}

export function HomePage() {
  const { store, dataVersion } = useApp();
  const { data, error } = useStoredData();
  const [current, setCurrent] = useState<CurrentGame | null>(null);
  const [notebook, setNotebook] = useState<NotebookEntry[] | null>(null);
  const [reviewedIds, setReviewedIds] = useState<Set<string> | null>(null);
  const academy = useAcademyData();

  useEffect(() => {
    let live = true;
    void store.getCurrentGame().then((c) => live && setCurrent(c)).catch(() => undefined);
    void store.listNotebook().then((n) => live && setNotebook(n)).catch(() => live && setNotebook([]));
    void store.listReviews().then((rs) => live && setReviewedIds(new Set(rs.filter((r) => r.complete).map((r) => r.gameId)))).catch(() => live && setReviewedIds(new Set()));
    return () => {
      live = false;
    };
  }, [store, dataVersion]);

  const now = useMemo(() => Date.now(), [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const model = useMemo(
    () => (data ? buildProfileModel({ games: data.games, activity: data.activity, profile: data.profile, period: 'all', now, achievementState: data.achievements }) : null),
    [data, now],
  );

  if (error) return <div className="notice error" role="alert">Your saved data could not be read: {error}</div>;
  if (!data || !model) return <p className="muted" role="status">Loading…</p>;

  const r = model.rating;
  const recent = [...data.games].filter((g) => g.source === 'played' || g.source === 'imported').slice(0, 5);
  const deltaFor = new Map(r.history.map((h) => [h.gameId, h.delta]));

  const nb = notebook ?? [];
  const dueNow = nb.filter((e) => isDueToday(e, now));
  const lastPlayed = [...data.games].filter((g) => g.source === 'played').sort((x, y) => y.createdAt - x.createdAt)[0];
  const lastUnreviewed = lastPlayed && reviewedIds && !reviewedIds.has(lastPlayed.id) && lastPlayed.uciMoves.length >= 8 ? lastPlayed : null;
  const lessonTitle = (id: string) => CURRICULUM_INDEX.lessons.get(id)?.lesson.title ?? 'a lesson';

  // The things to do next, most useful first. The page shows the top four.
  const suggestions: Suggestion[] = [];
  if (current) {
    suggestions.push({
      title: 'Resume your game',
      body: `You are ${Math.ceil(current.uciMoves.length / 2)} moves into a game against ${getLevel(current.botLevel).name}.`,
      href: '#/play',
      cta: 'Resume',
    });
  }
  if (dueNow.length > 0) {
    suggestions.push({
      title: `Practise ${dueNow.length} saved ${dueNow.length === 1 ? 'mistake' : 'mistakes'}`,
      body: 'Positions from your own games that are due for another try. A short session takes a few minutes.',
      href: '#/notebook/review',
      cta: 'Practise',
    });
  }
  if (academy.loaded && academy.plan.continue) {
    suggestions.push({ title: 'Continue your lesson', body: lessonTitle(academy.plan.continue.lessonId), href: `#/academy/lesson/${academy.plan.continue.lessonId}`, cta: 'Continue' });
  }
  if (lastUnreviewed) {
    suggestions.push({
      title: 'Review your last game',
      body: lastUnreviewed.result === '1/2-1/2' ? 'See where the game could have gone differently.' : outcomeFor(lastUnreviewed) === 'loss' ? 'Find the moment it turned, and save what you can learn from it.' : 'See what went well and what to tidy up, even in a win.',
      href: `#/games/${lastUnreviewed.id}/review`,
      cta: 'Review',
    });
  }
  if (model.allTime.n === 0) {
    suggestions.push({
      title: 'Play your first game',
      body: 'A game against Bot 400 is a gentle start. It is a practice bot, so it never changes your rating.',
      href: '#/play?level=r400',
      cta: 'Start',
    });
  } else {
    const lvl = getLevel(suggestedLevel(r.current));
    suggestions.push({
      title: `Challenge ${lvl.name}`,
      body: r.confidence === 'unrated' ? 'Closest to where a new rating starts.' : `Its strength is closest to your current rating of ${Math.round(r.current)}, so games should be competitive.`,
      href: `#/play?level=${lvl.id}`,
      cta: 'Play',
    });
  }
  if (academy.loaded && !academy.plan.continue && academy.plan.next) {
    suggestions.push({ title: model.lessons.completed === 0 ? 'Start learning' : 'Next lesson', body: lessonTitle(academy.plan.next.lessonId), href: `#/academy/lesson/${academy.plan.next.lessonId}`, cta: 'Open' });
  }
  suggestions.push({
    title: 'Today’s puzzle',
    body: 'One tactic, picked for your level and explained when you finish. Works offline.',
    href: '#/puzzles/play/daily',
    cta: 'Solve',
  });

  // What to practise: the clearest pattern in the saved mistakes, else the Academy's evidence-based suggestion, else a plain default.
  const insight = insightsFrom(nb, now)[0];
  const evidenceRec = academy.loaded ? academy.plan.evidence[0] : undefined;
  const practise: { text: string; href: string; cta: string } = insight
    ? { text: `${insight.sentence} ${insight.count} saved ${insight.count === 1 ? 'position shows' : 'positions show'} it.`, href: insight.suggest.lessons[0] ? `#/academy/lesson/${insight.suggest.lessons[0]}` : '#/notebook', cta: insight.suggest.lessons[0] ? 'Open the lesson' : 'Open the Notebook' }
    : evidenceRec
      ? { text: `${evidenceRec.reason}${evidenceRec.evidence ? ` ${evidenceRec.evidence}` : ''}`, href: `#/academy/lesson/${evidenceRec.lessonId}`, cta: 'Open the lesson' }
      : { text: 'There is not enough yet to spot a pattern. Play a few games and review them, and your most useful topics will show up here.', href: '#/games', cta: 'Your games' };

  // How am I improving: only numbers that exist, with the period they cover.
  const monthAgo = now - 30 * 86_400_000;
  const monthRating = r.history.filter((h) => h.at >= monthAgo);
  const ratingChange = monthRating.length >= 2 ? Math.round(monthRating[monthRating.length - 1]!.after - monthRating[0]!.before) : null;
  const retained = nb.filter((e) => statusOf(e, now) === 'retained').length;
  const improving: string[] = [];
  if (ratingChange !== null) improving.push(`Rating ${ratingChange === 0 ? 'unchanged' : ratingChange > 0 ? `up ${ratingChange}` : `down ${Math.abs(ratingChange)}`} over the last 30 days (${monthRating.length} rated games).`);
  else if (r.confidence !== 'unrated') improving.push(`Rating ${Math.round(r.current)}. Play more rated games to see a trend.`);
  if (model.puzzles.attempts > 0) improving.push(`${model.puzzles.solved} puzzles solved.`);
  if (model.lessons.completed > 0) improving.push(`${model.lessons.completed} ${model.lessons.completed === 1 ? 'lesson' : 'lessons'} completed.`);
  if (nb.length > 0) improving.push(`${retained} of ${nb.length} saved ${nb.length === 1 ? 'mistake' : 'mistakes'} now remembered, ${dueNow.length} due today.`);
  if (improving.length === 0) improving.push('Nothing to measure yet. Your progress will appear here as you play, solve and learn.');

  return (
    <div className="stack">
      <section className="dash-head" aria-labelledby="h-greet">
        <div className="dash-main">
          <h1 id="h-greet">{greeting(new Date().getHours())}, {data.profile.displayName}.</h1>
          <p className="lead">
            {model.allTime.n === 0
              ? 'Play a game against a bot to get started.'
              : `${model.allTime.n} ${model.allTime.n === 1 ? 'game' : 'games'} played · ${model.allTime.wins} won, ${model.allTime.draws} drawn, ${model.allTime.losses} lost.`}
          </p>
          <div className="home-play">
            <a className="btn primary big" href="#/play">Play</a>
            <a className="home-quick" href="#/play?quick=1">Quick game</a>
          </div>
          <div className="home-tiles" role="group" aria-label="Where to go">
            <a className="home-tile" href="#/puzzles"><NavIcon name="puzzles" /><span>Puzzles</span></a>
            <a className="home-tile" href="#/academy"><NavIcon name="academy" /><span>Learn</span></a>
            <a className="home-tile" href="#/games"><NavIcon name="games" /><span>Review</span></a>
            <a className="home-tile" href="#/analysis"><NavIcon name="analysis" /><span>Analysis</span></a>
          </div>
        </div>
        <a className="rating-card" href="#/profile" aria-label="Open your profile">
          <div className="rating-card-top">
            <Avatar avatar={data.profile.avatar} name={data.profile.displayName} size={44} />
            <div>
              <div className="eyebrow">MOVEWISE RATING</div>
              <div className="muted small">{r.confidence === 'unrated' ? 'Unrated' : r.confidence === 'provisional' ? `Provisional · ${r.ratedGames} rated` : `${r.ratedGames} rated games`}</div>
            </div>
          </div>
          {r.confidence === 'unrated' ? (
            <p className="muted small">Finish a game against a bot to get your first rating.</p>
          ) : (
            <div className="rating-card-num">
              <span className="rating-number">{Math.round(r.current)}</span>
              <Sparkline values={r.history.slice(-30).map((h) => h.after)} />
            </div>
          )}
          <span className="link-arrow">View profile <span aria-hidden="true">→</span></span>
        </a>
      </section>


      {error === null && data.games.length === 0 && !current && (
        <p className="muted small hero-logo-note">
          <Logo size={20} /> MoveWise is free, ad-free and open source. No account, and it works without internet.
        </p>
      )}

      <div className="home-cols">
        <section className="card" aria-labelledby="h-next" data-testid="home-next">
          <h2 id="h-next">What can I do now?</h2>
          <ul className="list">
            {suggestions.slice(0, 3).map((s) => (
              <li key={s.title}>
                <div className="grow">
                  <b>{s.title}</b>
                  <div className="muted small">{s.body}</div>
                </div>
                <a className="btn small" href={s.href}>{s.cta}</a>
              </li>
            ))}
          </ul>
        </section>
        <section className="card" aria-labelledby="h-recent">
          <h2 id="h-recent">Recent games</h2>
          {recent.length === 0 ? (
            <p className="muted">Nothing here yet. Your first game is a good place to start.</p>
          ) : (
            <ul className="list">
              {recent.map((g) => {
                const o = outcomeFor(g);
                const d = deltaFor.get(g.id);
                return (
                  <li key={g.id}>
                    <div className="grow">
                      <a href={`#/games/${g.id}`}>{g.white} vs {g.black}</a>
                      <div className="muted small">{formatDate(g.createdAt)}</div>
                    </div>
                    {d !== undefined && <span className={`delta small ${d >= 0 ? 'up' : 'down'}`} aria-label={`Rating change ${Math.round(d)}`}>{d >= 0 ? '+' : '−'}{Math.abs(Math.round(d))}</span>}
                    <span className={`badge ${o === 'win' ? 'win' : o === 'loss' ? 'loss' : ''}`}>
                      {o === 'win' ? 'Won' : o === 'loss' ? 'Lost' : o === 'draw' ? 'Draw' : g.result}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <h2 className="home-sub">Your progress</h2>
      <div className="grid-3" style={{ alignItems: 'start' }}>
        <section className="card" aria-labelledby="h-practise" data-testid="home-practise">
          <h2 id="h-practise">What should I practise?</h2>
          <p>{practise.text}</p>
          <a className="btn small" href={practise.href}>{practise.cta}</a>
        </section>
        <section className="card" aria-labelledby="h-improve" data-testid="home-improving">
          <h2 id="h-improve">How am I improving?</h2>
          <ul className="list">
            {improving.map((t) => (
              <li key={t}><span className="grow">{t}</span></li>
            ))}
          </ul>
          <a className="link-arrow" href="#/profile">View profile <span aria-hidden="true">→</span></a>
        </section>
        <section className="card" aria-labelledby="h-train">
          <h2 id="h-train">Training progress</h2>
          <dl className="kv">
            <dt>Current streak</dt>
            <dd>{model.activity.current} {model.activity.current === 1 ? 'day' : 'days'}</dd>
            <dt>Best streak</dt>
            <dd>{model.activity.best} {model.activity.best === 1 ? 'day' : 'days'}</dd>
            <dt>Lessons</dt>
            <dd>{model.lessons.completed === 0 ? <a href="#/academy">Start the Academy</a> : `${model.lessons.completed} completed`}</dd>
            <dt>Puzzles</dt>
            <dd>{model.puzzles.attempts === 0 ? <a href="#/puzzles">Try one</a> : `${model.puzzles.solved} solved`}</dd>
          </dl>
          <p className="muted small" style={{ marginTop: 10 }}>Streaks count days you played a game, solved a puzzle, reviewed a game or finished a lesson.</p>
        </section>
      </div>

    </div>
  );
}
