import { TAG_LABEL } from '../../review/explain';
import type { Tag } from '../../review/types';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { LEVELS, findLevel } from '../../engine/levels';
import { buildProfileModel, type ProfileModel } from '../../profile/model';
import {
  INELIGIBLE_TEXT, MIN_PLIES_RATED, PLAYER_START_RATING, PROVISIONAL_GAMES, PROVISIONAL_RD, botStrength,
} from '../../profile/rating';
import { PERIODS, dayKey, type Period } from '../../profile/stats';
import { AVATAR_COLORS, AVATAR_PIECES, MAX_NAME_LENGTH, type AvatarColor, type AvatarPiece, type Profile } from '../../profile/types';
import { cleanName } from '../../storage/backup';
import { useApp } from '../app';
import { AVATAR_STYLE, Avatar } from '../Avatar';
import { LineChart, ResultsChart, SplitBars } from '../charts';
import { useStoredData } from '../hooks';
import { AchievementsSection } from './Achievements';
import { AcademyProfile } from './AcademyProfile';
import { PuzzleProfile } from './PuzzleProfile';
import { TOTAL_LESSONS } from '../../academy/curriculum';
import { downloadText, formatDate } from '../shared';

const DAY = 86_400_000;
const pct = (v: number | null): string => (v === null ? '—' : `${Math.round(v * 100)}%`);
const signed = (n: number): string => `${n >= 0 ? '+' : '−'}${Math.abs(Math.round(n))}`;

export function ProfilePage() {
  const { data, error } = useStoredData();
  const [period, setPeriod] = useState<Period>('all');
  const now = useMemo(() => Date.now(), [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const model = useMemo(
    () => (data ? buildProfileModel({ games: data.games, activity: data.activity, profile: data.profile, period, now, totalLessons: TOTAL_LESSONS, achievementState: data.achievements }) : null),
    [data, period, now],
  );

  if (error) return <div className="notice error" role="alert">Your profile could not be loaded: {error}</div>;
  if (!model || !data) return <p className="muted" role="status">Loading your profile…</p>;

  return (
    <div className="stack profile">
      <Header model={model} />
      {model.allTime.n === 0 && <Welcome />}
      <div className="period-bar">
        <span className="label" id="period-l">Statistics for</span>
        <div className="seg" role="group" aria-labelledby="period-l">
          {PERIODS.map((p) => (
            <button key={p.id} type="button" aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>{p.label}</button>
          ))}
        </div>
        <span className="muted small" aria-live="polite">
          {model.overall.n} {model.overall.n === 1 ? 'game' : 'games'} in this period · {model.allTime.n} in total
        </span>
      </div>

      <RatingSection model={model} now={now} period={period} />
      <div className="grid-2">
        <ResultsSection model={model} period={period} />
        <OpponentsSection model={model} />
      </div>
      <div className="grid-2">
        <OpeningsSection model={model} />
        <HighlightsSection model={model} />
      </div>
      <div className="grid-2">
        <QualitySection model={model} />
        <PuzzleProfile />
      </div>
      <AcademyProfile />
      <TrainingSection model={model} now={now} timestamps={data.games.filter((g) => g.source === 'played').map((g) => g.createdAt).concat(data.activity.map((a) => a.at))} />
      <AchievementsSection achievements={model.achievements} />
      <DataSection model={model} />
    </div>
  );
}

/* ------------------------------ header ------------------------------- */

function Header({ model }: { model: ProfileModel }) {
  const { store, notifyDataChanged, toast } = useApp();
  const [editing, setEditing] = useState(false);
  const p = model.profile;
  const r = model.rating;
  const save = async (next: Profile) => {
    try {
      await store.putProfile(next);
      notifyDataChanged();
      setEditing(false);
      toast('Profile saved.', 'ok');
    } catch {
      toast('Your profile could not be saved on this device.', 'error');
    }
  };
  const confidenceText =
    r.confidence === 'unrated'
      ? 'Unrated'
      : r.confidence === 'provisional'
        ? `Provisional · ${r.ratedGames} rated ${r.ratedGames === 1 ? 'game' : 'games'}`
        : `Established · ${r.ratedGames} rated games`;
  return (
    <section className="card profile-head" aria-labelledby="h-profile">
      <div className="profile-id">
        <Avatar avatar={p.avatar} name={p.displayName} size={88} />
        <div>
          <h1 id="h-profile">{p.displayName}</h1>
          <p className="muted">Playing on MoveWise since {formatDate(p.startedAt)} · stored only on this device</p>
          <div className="btn-row">
            <button className="btn small" type="button" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>
              {editing ? 'Cancel' : 'Edit profile'}
            </button>
          </div>
        </div>
      </div>
      <div className="rating-block">
        <div className="eyebrow">MOVEWISE RATING · ESTIMATED STRENGTH</div>
        {r.confidence === 'unrated' ? (
          <>
            <div className="rating-number muted" aria-label="No rating yet">—</div>
            <p className="muted">Finish a game against a bot to get your first rating. Until then MoveWise does not guess a number.</p>
          </>
        ) : (
          <>
            <div className="rating-number" aria-label={`Rating ${Math.round(r.current)}`}>
              {Math.round(r.current)}
              {r.lastDelta !== null && <span className={`delta ${r.lastDelta >= 0 ? 'up' : 'down'}`} aria-label={`Last game ${signed(r.lastDelta)}`}>{signed(r.lastDelta)}</span>}
            </div>
            <div className="rating-meta">
              <span className={`chip ${r.confidence}`}>{confidenceText}</span>
              <span className="muted small">Likely range {Math.round(r.low)}–{Math.round(r.high)}</span>
              <span className="muted small">Peak {Math.round(r.peak)}</span>
            </div>
          </>
        )}
        <p className="muted small rating-note">A provisional score measured against MoveWise's own bots. Not a FIDE or online rating.</p>
      </div>
      {editing && <ProfileEditor profile={p} onSave={save} />}
    </section>
  );
}

function ProfileEditor({ profile, onSave }: { profile: Profile; onSave: (p: Profile) => void }) {
  const [name, setName] = useState(profile.displayName);
  const [kind, setKind] = useState(profile.avatar.kind);
  const [color, setColor] = useState<AvatarColor>(profile.avatar.color);
  const [piece, setPiece] = useState<AvatarPiece>(profile.avatar.piece);
  const [err, setErr] = useState<string | null>(null);
  const preview = { kind, color, piece };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setErr('Please enter a name.');
    if (trimmed.length > MAX_NAME_LENGTH) return setErr(`Names can be up to ${MAX_NAME_LENGTH} characters.`);
    setErr(null);
    onSave({ ...profile, displayName: cleanName(trimmed), avatar: preview });
  };

  return (
    <form className="profile-editor" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="pf-name">Display name</label>
        <input
          id="pf-name"
          type="text"
          value={name}
          maxLength={MAX_NAME_LENGTH + 10}
          autoComplete="off"
          aria-invalid={err ? true : undefined}
          aria-describedby="pf-name-help"
          onChange={(e) => setName(e.target.value)}
        />
        <span id="pf-name-help" className={err ? 'field-error' : 'muted small'} role={err ? 'alert' : undefined}>
          {err ?? `Shown on your profile and home page. Up to ${MAX_NAME_LENGTH} characters. It never leaves this device.`}
        </span>
      </div>
      <div className="field">
        <span className="label" id="pf-av-l">Avatar</span>
        <div className="seg" role="group" aria-labelledby="pf-av-l">
          <button type="button" aria-pressed={kind === 'initials'} onClick={() => setKind('initials')}>Initials</button>
          <button type="button" aria-pressed={kind === 'piece'} onClick={() => setKind('piece')}>Chess piece</button>
        </div>
      </div>
      {kind === 'piece' && (
        <div className="field">
          <span className="label" id="pf-piece-l">Piece</span>
          <div className="swatches" role="group" aria-labelledby="pf-piece-l">
            {AVATAR_PIECES.map((pc) => (
              <button key={pc} type="button" className="swatch-btn" aria-pressed={piece === pc} aria-label={pc} onClick={() => setPiece(pc)}>
                <Avatar avatar={{ kind: 'piece', color, piece: pc }} name={pc} size={40} />
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="field">
        <span className="label" id="pf-col-l">Colour</span>
        <div className="swatches" role="group" aria-labelledby="pf-col-l">
          {AVATAR_COLORS.map((c) => (
            <button key={c} type="button" className="swatch-btn" aria-pressed={color === c} aria-label={AVATAR_STYLE[c].label} onClick={() => setColor(c)}>
              <span className="swatch" style={{ background: `linear-gradient(145deg, ${AVATAR_STYLE[c].from}, ${AVATAR_STYLE[c].to})` }} />
            </button>
          ))}
        </div>
      </div>
      <div className="profile-editor-foot">
        <Avatar avatar={preview} name={name || 'Player'} size={52} />
        <button className="btn primary" type="submit">Save profile</button>
      </div>
    </form>
  );
}

function Welcome() {
  return (
    <section className="card welcome" aria-labelledby="h-welcome">
      <h2 id="h-welcome">Your profile starts here</h2>
      <p className="muted">
        Everything on this page is built from your real games, on this device. Finish a game against a bot and your first rating,
        results and opening statistics appear. Nothing is estimated before then.
      </p>
      <div className="btn-row">
        <a className="btn primary" href="#/play?quick=1">Play your first game</a>
        <a className="btn" href="#/games">Import a game</a>
      </div>
    </section>
  );
}

/* ----------------------------- rating -------------------------------- */

function RatingSection({ model, now, period }: { model: ProfileModel; now: number; period: Period }) {
  const days = PERIODS.find((p) => p.id === period)?.days ?? null;
  const pts = model.rating.history.filter((h) => days === null || h.at >= now - days * DAY);
  const gameNumber = new Map(model.rating.history.map((h, i) => [h.gameId, i + 1]));
  const level = (id: string) => findLevel(id)?.name ?? id;
  return (
    <section className="card" aria-labelledby="h-rating">
      <h2 id="h-rating">Rating over time</h2>
      {model.rating.ratedGames === 0 ? (
        <Empty>No rated games yet. Finish a game against a bot, played from the standard start without take-backs, to start your rating history.</Empty>
      ) : pts.length < 2 ? (
        <Empty>
          {pts.length === 0 ? 'No rated games in this period.' : 'Only one rated game in this period.'} A trend needs at least two. You have {model.rating.ratedGames} rated{' '}
          {model.rating.ratedGames === 1 ? 'game' : 'games'} in total; choose “All time” to see them.
        </Empty>
      ) : (
        <LineChart
          ariaLabel="Estimated rating after each rated game"
          yLabel="Rating"
          xLabel="Game"
          points={pts.map((h) => ({
            y: h.after,
            label: `#${gameNumber.get(h.gameId)} · ${formatDate(h.at)}`,
            detail: `${signed(h.delta)} ${h.score === 1 ? 'win' : h.score === 0 ? 'loss' : 'draw'} vs ${level(h.opponentLevel)} (${Math.round(h.opponentRating)})`,
            band: { low: h.after - h.rdAfter, high: h.after + h.rdAfter },
          }))}
        />
      )}
      <p className="muted small">
        Based on {model.rating.ratedGames} rated {model.rating.ratedGames === 1 ? 'game' : 'games'}. The shaded band is ±1 rating deviation: the narrower it gets, the more reliable the number.
      </p>
      {model.unrated.length > 0 && (
        <p className="muted small">
          Not counted toward the rating: {model.unrated.map((u) => `${u.count} × ${INELIGIBLE_TEXT[u.reason].toLowerCase()}`).join(', ')}.
        </p>
      )}
      <HowRatingWorks model={model} />
    </section>
  );
}

function HowRatingWorks({ model }: { model: ProfileModel }) {
  return (
    <details className="explain">
      <summary>How is this rating calculated?</summary>
      <div className="explain-body">
        <p>
          <b>Method.</b> After every finished game against a bot, your rating is updated with the <b>Glicko-2</b> system, the same family of maths used by many chess sites. Beating a bot stronger than you raises it
          more; losing to a weaker one lowers it more. Each rating comes with a <b>rating deviation</b> (RD): how uncertain it still is.
        </p>
        <p>
          <b>Where you start.</b> A new player starts at {PLAYER_START_RATING} with maximum uncertainty (RD 350), so the first games move the number a lot. It is called <b>provisional</b> until you have at least {PROVISIONAL_GAMES} rated games
          and an RD of {PROVISIONAL_RD} or lower{model.rating.ratedGames > 0 ? `; yours is ${Math.round(model.rating.rd)} after ${model.rating.ratedGames} ${model.rating.ratedGames === 1 ? 'game' : 'games'}` : ''}.
        </p>
        <p>
          <b>What the bots are worth.</b> The ratings below are <i>approximate MoveWise bot ratings</i>. Levels from 1400 use Stockfish with its own strength limiter, so their numbers are on Stockfish’s scale; levels below that use MoveWise’s built-in engine,
          placed on the same scale by games against Stockfish at 1320 and against each other. The uncertainty is wide, a few hundred points at the extremes, and time-limited levels depend on device speed. This rating is a MoveWise-only strength score,
          <b> not</b> a FIDE, national or online (Lichess / Chess.com) rating, and it is not comparable to them. Bots from 100 to 900 are practice only and never change it.
        </p>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
          <table>
            <caption className="sr-only">Bot strength on the MoveWise scale</caption>
            <thead>
              <tr><th scope="col">Bot level</th><th scope="col">Approx. rating</th><th scope="col">Counts toward rating</th></tr>
            </thead>
            <tbody>
              {LEVELS.map((l) => {
                const s = botStrength(l.id);
                return s ? <tr key={l.id}><th scope="row">{l.name}</th><td>{Math.round(s.rating)}</td><td>{l.category === 'competitive' ? 'Yes' : 'No, practice'}</td></tr> : null;
              })}
            </tbody>
          </table>
        </div>
        <p>
          <b>What counts.</b> Finished games you played against a competitive bot (1000 and above) from the standard starting position, with no take-backs, without the Trainer, and at least {MIN_PLIES_RATED} half-moves. Imported games, games from custom positions and unfinished games do not count. Playing style
          (Balanced, Aggressive, …) is not rated separately because it was not calibrated. Restarting your rating never deletes games.
        </p>
        <p>
          <b>It is always recomputed from your saved games</b>, so it cannot drift from the data, and deleting a game changes the history accordingly.
        </p>
      </div>
    </details>
  );
}

/* ------------------------------ results ------------------------------ */

function ResultsSection({ model, period }: { model: ProfileModel; period: Period }) {
  const o = model.overall;
  return (
    <section className="card" aria-labelledby="h-results">
      <h2 id="h-results">Results</h2>
      {o.n === 0 ? (
        <Empty>No finished games in this period.</Empty>
      ) : (
        <>
          <dl className="tiles">
            <Tile label="Games" value={String(o.n)} />
            <Tile label="Won" value={String(o.wins)} />
            <Tile label="Drawn" value={String(o.draws)} />
            <Tile label="Lost" value={String(o.losses)} />
            <Tile label="Win rate" value={pct(o.winRate)} hint={o.n < 10 ? `only ${o.n} games` : undefined} />
            <Tile label="Avg. length" value={model.avgMoves === null ? '—' : `${Math.round(model.avgMoves)} moves`} />
            <Tile label="As White" value={model.asWhite.n ? `${model.asWhite.wins}–${model.asWhite.draws}–${model.asWhite.losses}` : '—'} hint={model.asWhite.n ? `${model.asWhite.n} games` : 'no games'} />
            <Tile label="As Black" value={model.asBlack.n ? `${model.asBlack.wins}–${model.asBlack.draws}–${model.asBlack.losses}` : '—'} hint={model.asBlack.n ? `${model.asBlack.n} games` : 'no games'} />
            <Tile label="Win streak" value={String(model.streaks.currentWin)} hint={`best ${model.streaks.bestWin}`} />
            <Tile label="Losing streak" value={String(model.streaks.currentLoss)} hint={`worst ${model.streaks.worstLoss}`} />
          </dl>
          <div className="form-row" aria-label="Recent form, oldest to newest">
            <span className="muted small">Recent form</span>
            <span className="form">
              {model.form.map((r, i) => (
                <span key={i} className={`form-dot ${r}`} aria-label={r === 'win' ? 'won' : r === 'loss' ? 'lost' : 'drawn'}>{r === 'win' ? 'W' : r === 'loss' ? 'L' : 'D'}</span>
              ))}
            </span>
          </div>
          {model.results.length >= 2 ? (
            <ResultsChart ariaLabel={`Results per ${period === '90d' || period === 'all' ? 'week' : 'day'}`} bars={model.results.map((b) => ({ label: b.label, wins: b.wins, draws: b.draws, losses: b.losses }))} />
          ) : (
            <p className="muted small">The results chart appears once you have played on at least two different {period === '90d' || period === 'all' ? 'weeks' : 'days'}.</p>
          )}
        </>
      )}
    </section>
  );
}

function OpponentsSection({ model }: { model: ProfileModel }) {
  return (
    <section className="card" aria-labelledby="h-opp">
      <h2 id="h-opp">Against each opponent</h2>
      {model.overall.n === 0 ? (
        <Empty>No finished games in this period.</Empty>
      ) : (
        <>
          <h3>By bot level</h3>
          <SplitBars minGames={5} rows={model.byLevel.map((r) => ({ label: r.name, n: r.n, wins: r.wins, draws: r.draws, losses: r.losses }))} />
          <h3 className="spaced">By playing style</h3>
          <SplitBars minGames={5} rows={model.byPersonality.map((r) => ({ label: r.name, n: r.n, wins: r.wins, draws: r.draws, losses: r.losses }))} />
          <p className="muted small">Styles change how a bot chooses moves but are not rated separately. Fewer than 5 games against one opponent is too few to read much into.</p>
        </>
      )}
    </section>
  );
}

/* ----------------------------- openings ------------------------------ */

function OpeningsSection({ model }: { model: ProfileModel }) {
  const o = model.openings;
  const empty = o.white.length === 0 && o.black.length === 0;
  const list = (title: string, rows: typeof o.white) =>
    rows.length === 0 ? null : (
      <>
        <h3>{title}</h3>
        <SplitBars minGames={3} rows={rows.slice(0, 5).map((r) => ({ label: r.key, n: r.n, wins: r.wins, draws: r.draws, losses: r.losses }))} />
      </>
    );
  const best = [...o.white, ...o.black].filter((r) => r.n >= 3 && (r.winRate ?? 0) > 0).sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0) || b.n - a.n)[0];
  return (
    <section className="card" aria-labelledby="h-open">
      <h2 id="h-open">Openings</h2>
      {empty ? (
        <Empty>No recognised openings in this period yet.</Empty>
      ) : (
        <>
          {list('Most played as White', o.white)}
          {list('Most played as Black', o.black)}
          {best && <p className="muted small"><b>Best results so far:</b> {best.key} — {Math.round((best.winRate ?? 0) * 100)}% wins over {best.n} games.</p>}
        </>
      )}
      <p className="muted small">
        Opening names come from a built-in table of well-known lines; {o.unrecognised} {o.unrecognised === 1 ? 'game' : 'games'} in this period left it early or started unusually and are not named. Opening
        mistakes are not listed here yet; the opening part of each reviewed game is in Chess quality below.
      </p>
    </section>
  );
}

function HighlightsSection({ model }: { model: ProfileModel }) {
  const level = (id: string | null) => findLevel(id ?? '')?.name ?? 'a bot';
  const one = (g: ProfileModel['bestWin'], kind: 'win' | 'loss') =>
    g ? (
      <li>
        <div className="grow">
          <b>{kind === 'win' ? 'Best win' : 'Toughest loss'}</b>
          <div className="muted small">
            {kind === 'win' ? 'Beat' : 'Lost to'} {level(g.game.botLevel)} · {formatDate(g.game.createdAt)} · {Math.ceil(g.plies / 2)} moves
          </div>
        </div>
        <a className="btn small" href={`#/games/${g.game.id}`}>Replay</a>
      </li>
    ) : null;
  return (
    <section className="card" aria-labelledby="h-high">
      <h2 id="h-high">Best and toughest results</h2>
      {!model.bestWin && !model.worstLoss ? (
        <Empty>Rated wins and losses in this period will show here.</Empty>
      ) : (
        <ul className="list">{one(model.bestWin, 'win')}{one(model.worstLoss, 'loss')}</ul>
      )}
      <p className="muted small">
        “Best” is the win against the strongest-rated bot and “toughest” the loss against the weakest-rated one, by the rating of the opponent, not by how well you played. Your most and least accurate reviewed games are under Chess quality.
      </p>
    </section>
  );
}

/* ------------------- quality / tactics / training -------------------- */

function QualitySection({ model }: { model: ProfileModel }) {
  const q = model.quality;
  const f = (v: number | null, d = 1) => (v === null ? '—' : v.toFixed(d));
  return (
    <section className="card" aria-labelledby="h-qual">
      <h2 id="h-qual">Chess quality</h2>
      {q.reviewedGames === 0 ? (
        <>
          <p className="unavailable"><span className="badge soon">No reviewed games yet</span></p>
          <p className="muted">
            Average centipawn loss, accuracy, blunders, mistakes and inaccuracies per game, performance by game phase and missed tactics come from Game Review, which analyses each of your moves with the engine.
            MoveWise shows no estimates before a game has been reviewed.
          </p>
          <a className="btn small" href="#/games">Choose a game to review</a>
        </>
      ) : (
        <>
          <dl className="tiles">
            <Tile label="Avg. centipawn loss" value={f(q.avgAcpl, 0)} />
            <Tile label="Accuracy" value={q.avgAccuracy === null ? '—' : `${f(q.avgAccuracy, 0)}%`} />
            <Tile label="Blunders / game" value={f(q.blundersPerGame)} />
            <Tile label="Mistakes / game" value={f(q.mistakesPerGame)} />
            <Tile label="Inaccuracies / game" value={f(q.inaccuraciesPerGame)} />
            <Tile label="Missed tactics / game" value={f(q.missedTacticsPerGame)} />
          </dl>
          <p className="muted small">Based on {q.reviewedGames} reviewed {q.reviewedGames === 1 ? 'game' : 'games'}. Opening {f(q.phaseAcpl.opening, 0)} · middlegame {f(q.phaseAcpl.middlegame, 0)} · endgame {f(q.phaseAcpl.endgame, 0)} (average centipawn loss).</p>
          {(q.best || q.worst) && q.reviewedGames > 1 && (
            <ul className="list">
              {q.best && <li><div className="grow"><b>Most accurate game</b><div className="muted small">{Math.round(q.best.accuracy)}% accuracy</div></div><a className="btn small" href={`#/games/${q.best.gameId}/review`}>Reopen review</a></li>}
              {q.worst && q.worst !== q.best && <li><div className="grow"><b>Least accurate game</b><div className="muted small">{Math.round(q.worst.accuracy)}% accuracy</div></div><a className="btn small" href={`#/games/${q.worst.gameId}/review`}>Reopen review</a></li>}
            </ul>
          )}
          {q.weaknesses.length > 0 && (
            <>
              <h3>Patterns that cost you</h3>
              <ul className="list">
                {q.weaknesses.slice(0, 5).map((w) => (
                  <li key={w.tag}>
                    <span className="grow">{TAG_LABEL[w.tag as Tag] ?? w.tag}</span>
                    <span className="muted small">in {w.count} of {q.reviewedGames} reviewed {q.reviewedGames === 1 ? 'game' : 'games'}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="muted small">Only games reviewed from your own side count. Figures are MoveWise’s own estimates and are not comparable with other sites.</p>
        </>
      )}
    </section>
  );
}

function TrainingSection({ model, now, timestamps }: { model: ProfileModel; now: number; timestamps: number[] }) {
  const l = model.lessons;
  const last30 = new Set(timestamps.filter((t) => t >= now - 30 * DAY).map(dayKey)).size;
  return (
    <section className="card" aria-labelledby="h-train">
      <h2 id="h-train">Training and consistency</h2>
      <dl className="tiles">
        <Tile label="Active days (30 days)" value={`${last30}/30`} hint="days with a game or training" />
        <Tile label="Current streak" value={`${model.activity.current} ${model.activity.current === 1 ? 'day' : 'days'}`} hint={`best ${model.activity.best}`} />
        <Tile label="Lessons completed" value={l.completed === 0 ? '—' : String(l.completed)} hint={l.completionRate === null ? undefined : `${pct(l.completionRate)} of the Academy`} />
        <Tile label="Puzzles solved" value={model.puzzles.attempts === 0 ? '—' : String(model.puzzles.solved)} hint={model.puzzles.attempts === 0 ? 'none played yet' : undefined} />
      </dl>
      {l.topics.length > 0 && (
        <ul className="list">
          {l.topics.map((t) => (
            <li key={t.topic}>
              <span className="grow">{t.topic}</span>
              <span className={`badge ${t.status === 'mastered' ? 'win' : t.status === 'practice' ? 'loss' : ''}`}>
                {t.status === 'mastered' ? 'Mastered' : t.status === 'practice' ? 'Needs practice' : 'Learning'}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="muted small">
        Streaks count any day you played a game or did training. Puzzles and Game Review practice count as training days.  Completed Academy lessons count as training days too.
      </p>
    </section>
  );
}

/* ------------------------------- data -------------------------------- */

function DataSection({ model }: { model: ProfileModel }) {
  const { store, notifyDataChanged, toast } = useApp();
  const exportAll = async () => {
    try {
      const backup = await store.exportAll();
      downloadText(`movewise-profile-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(backup, null, 2), 'application/json');
      toast(`Exported your profile and ${backup.games.length} games. Restore the file from Settings → Import backup.`, 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Export failed.', 'error');
    }
  };
  const restartRating = async () => {
    if (!window.confirm('Restart your rating? Your games stay, but only games played from now on count toward the new rating.')) return;
    try {
      await store.putProfile({ ...model.profile, ratingEpoch: Date.now() });
      notifyDataChanged();
      toast('Rating restarted. Your games were kept.', 'ok');
    } catch {
      toast('Could not restart the rating on this device.', 'error');
    }
  };
  const resetIdentity = async () => {
    if (!window.confirm('Reset your name and avatar to the defaults? Games and ratings are not affected.')) return;
    try {
      await store.putProfile({ ...model.profile, displayName: 'Player', avatar: { kind: 'initials', color: 'gold', piece: 'knight' } });
      notifyDataChanged();
      toast('Name and avatar reset.', 'ok');
    } catch {
      toast('Could not reset the profile on this device.', 'error');
    }
  };
  return (
    <section className="card flat" aria-labelledby="h-pdata">
      <h2 id="h-pdata">Your data</h2>
      <p className="muted">
        Your profile, rating history and statistics live only in this browser, with no account. Rating and statistics are calculated from your saved games, so exporting and restoring a backup brings them all back.
      </p>
      <div className="btn-row">
        <button className="btn primary" type="button" onClick={() => void exportAll()}>Export profile and games</button>
        <button className="btn" type="button" onClick={() => void restartRating()}>Restart my rating</button>
        <button className="btn" type="button" onClick={() => void resetIdentity()}>Reset name and avatar</button>
        <a className="btn" href="#/settings">Import or delete data in Settings</a>
      </div>
    </section>
  );
}

/* ------------------------------ pieces ------------------------------- */

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="tile">
      <dt>{label}</dt>
      <dd>{value}</dd>
      {hint && <dd className="muted small tile-hint">{hint}</dd>}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
