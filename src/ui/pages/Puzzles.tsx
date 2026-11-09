import { useMemo, useRef, useState } from 'react';
import { localDateKey, dailyStreak } from '../../puzzles/daily';
import { checkPack, csvToPack, isBundled } from '../../puzzles/library';
import { PUZZLE_START_RATING } from '../../puzzles/rating';
import { RUSH_MINUTES, highScore } from '../../puzzles/rush';
import { incorrectPuzzles } from '../../puzzles/select';
import { isClean, themeSkills, type SkillLevel } from '../../puzzles/skills';
import { THEMES, themeLabel } from '../../puzzles/themes';
import { useApp } from '../app';
import { invalidateLibrary, useLibrary, usePuzzleData } from '../puzzleData';

export type PuzzlesView = 'hub' | 'themes' | 'history' | 'packs' | 'games';

const LEVEL_TEXT: Record<SkillLevel, string> = {
  unknown: 'Not enough puzzles yet',
  weak: 'Needs work',
  learning: 'Improving',
  mastered: 'Mastered',
};

export function PuzzlesPage({ view }: { view: PuzzlesView }) {
  const { library, error } = useLibrary();
  const data = usePuzzleData();
  if (error && !library) return <div className="card"><h1>Puzzles</h1><div className="notice error" role="alert">{error}</div></div>;
  if (!library || !data.loaded) return <p className="muted" role="status">Loading puzzles…</p>;
  return (
    <div className="stack" style={{ maxWidth: 980, margin: '0 auto' }}>
      <nav className="pz-tabs" aria-label="Puzzle sections">
        {([['hub', '#/puzzles', 'Train'], ['themes', '#/puzzles/themes', 'Themes'], ['history', '#/puzzles/history', 'History'], ['packs', '#/puzzles/packs', 'Collection']] as const).map(([id, href, label]) => (
          <a key={id} href={href} aria-current={view === id ? 'page' : undefined}>{label}</a>
        ))}
      </nav>
      {view === 'hub' && <Hub />}
      {view === 'themes' && <Themes />}
      {view === 'history' && <History />}
      {view === 'packs' && <Packs />}
      {view === 'games' && <FromGames />}
    </div>
  );
}

/* ------------------------------- Hub ------------------------------- */

function Hub() {
  const { library } = useLibrary();
  const data = usePuzzleData();
  const lib = library!;
  const today = localDateKey(Date.now());
  const todayRec = data.daily.find((d) => d.date === today);
  const streak = dailyStreak(data.daily, today);
  const r = data.rating;
  const skills = useMemo(() => themeSkills(data.events), [data.events]);
  const weak = [...skills.values()].filter((s) => s.level === 'weak' || s.level === 'learning').length;
  const wrong = useMemo(() => incorrectPuzzles({ puzzles: lib.puzzles, events: data.events, rating: r.rating, now: Date.now(), rng: Math.random }).length, [lib, data.events, r.rating]);
  const ratedEvents = data.events.filter((e) => e.rated);
  const recent = [...data.events].sort((a, b) => b.at - a.at).slice(0, 12);
  const attempted = data.events.length;
  const solved = data.events.filter((e) => e.solved).length;
  const clean = data.events.filter(isClean).length;
  const [explain, setExplain] = useState(false);

  return (
    <>
      <header>
        <h1 style={{ marginBottom: 4 }}>Puzzles</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          {lib.puzzles.length.toLocaleString()} checked puzzles, all on this device. Each one is explained when you finish it.
        </p>
      </header>

      <div className="grid-2">
        <section className="card" aria-labelledby="pz-daily">
          <h2 id="pz-daily" style={{ marginTop: 0 }}>Daily puzzle</h2>
          <p className="muted small">The same puzzle all day, picked for your level. No internet needed.</p>
          <p data-testid="daily-status">
            {todayRec?.solvedAt ? <>✓ Solved today.{todayRec.clean ? ' Clean, with no hints.' : ''}</> : todayRec ? 'Started, not solved yet.' : 'Not started today.'}
            {streak > 0 && <> Streak: <b>{streak}</b> day{streak === 1 ? '' : 's'}.</>}
          </p>
          <a className="btn primary" href="#/puzzles/play/daily" data-testid="daily-start">{todayRec?.solvedAt ? 'Replay (unrated)' : todayRec ? 'Continue' : 'Start today’s puzzle'}</a>
        </section>

        <section className="card" aria-labelledby="pz-rating">
          <h2 id="pz-rating" style={{ marginTop: 0 }}>Puzzle rating</h2>
          {r.attempts === 0 ? (
            <p>No rated puzzles yet. Your first result on each puzzle sets a starting rating of {PUZZLE_START_RATING}.</p>
          ) : (
            <p className="pz-big" data-testid="puzzle-rating">
              {Math.round(r.rating)} <span className="muted small">± {Math.round(r.rd * 1.96)}{r.provisional ? ' · provisional' : ''}</span>
            </p>
          )}
          <p className="muted small">
            {r.attempts} rated · {attempted} played · {solved} solved{attempted ? ` (${Math.round((solved / attempted) * 100)}%)` : ''}{r.peak !== null ? ` · peak ${Math.round(r.peak)}` : ''}
          </p>
          <p className="muted small">This is separate from your playing rating and from lesson progress. It never mixes with them.</p>
          <button className="btn small" type="button" aria-expanded={explain} onClick={() => setExplain(!explain)}>How is this worked out?</button>
          {explain && (
            <div className="pz-explain-rating" data-testid="rating-explanation">
              <p>It is a Glicko-2 rating with its own uncertainty, which is what the ± shows. It is provisional until that uncertainty is small.</p>
              <ul>
                <li>Only your <b>first attempt</b> at each puzzle counts. Repeats and the daily replay never change it.</li>
                <li>A clean solve scores 1. A solve that used a hint scores ½. A wrong move, giving up or viewing the solution scores 0.</li>
                <li>Beating a harder puzzle moves your rating more than beating an easy one.</li>
                <li>Speed is never used. Puzzle Rush, and positions from your own games, are not rated.</li>
              </ul>
              {r.attempts > 0 && <p>At your level, one more clean solve of an equally rated puzzle would add about <b>{Math.round(r.exampleWin)}</b>, and a miss would take about <b>{Math.round(Math.abs(r.exampleLoss))}</b>.</p>}
              <p className="muted small">{ratedEvents.length} of your attempts counted. Clean solves overall: {clean}.</p>
            </div>
          )}
        </section>
      </div>

      <section className="card" aria-labelledby="pz-train">
        <h2 id="pz-train" style={{ marginTop: 0 }}>Train</h2>
        <div className="pz-modes">
          <a className="pz-mode" href="#/puzzles/play/practice" data-testid="mode-practice">
            <b>Continue training</b>
            <span>Puzzles near your level, mixed with ideas you have not tried.</span>
          </a>
          <a className="pz-mode" href="#/puzzles/themes" data-testid="mode-theme">
            <b>Theme training</b>
            <span>Pick a pattern such as forks, pins or back-rank mates.</span>
          </a>
          <a className="pz-mode" href="#/puzzles/play/weakness" data-testid="mode-weakness">
            <b>Weakness training</b>
            <span>{weak > 0 ? `${weak} theme${weak === 1 ? '' : 's'} to work on, based on your results.` : 'Needs a few results first. Until then it mixes themes.'}</span>
          </a>
          <a className="pz-mode" href="#/puzzles/play/mixed">
            <b>Mixed</b>
            <span>A spread of themes at your level.</span>
          </a>
          <a className="pz-mode" href="#/puzzles/play/review" aria-disabled={wrong === 0}>
            <b>Review mistakes</b>
            <span>{wrong > 0 ? `${wrong} puzzle${wrong === 1 ? '' : 's'} you have not solved cleanly.` : 'Nothing to review yet.'}</span>
          </a>
          <a className="pz-mode" href="#/notebook">
            <b>Your mistakes</b>
            <span>Positions from your own games, practised in the Mistake Notebook.</span>
          </a>
        </div>
      </section>

      <section className="card" aria-labelledby="pz-rush">
        <h2 id="pz-rush" style={{ marginTop: 0 }}>Puzzle Rush <span className="muted small">optional practice, not rated</span></h2>
        <p className="muted small">Solve as many as you can. Three misses end the run. No hints.</p>
        <div className="btn-row">
          {RUSH_MINUTES.map((m) => {
            const best = highScore(data.rush, m);
            return <a key={m} className="btn" href={`#/puzzles/rush/${m}`} data-testid={`rush-${m}`}>{m} min{best ? ` · best ${best.solved}` : ''}</a>;
          })}
        </div>
      </section>

      {recent.length > 0 && (
        <section className="card" aria-labelledby="pz-recent">
          <h2 id="pz-recent" style={{ marginTop: 0 }}>Recent</h2>
          <ul className="pz-dots" aria-label="Last results, newest first">
            {recent.map((e) => (
              <li key={e.id} className={isClean(e) ? 'ok' : e.solved ? 'half' : 'bad'} title={`${themeLabel(e.themes[0] ?? 'puzzle')} · ${isClean(e) ? 'clean solve' : e.solved ? 'solved with help or after a miss' : 'not solved'}`}>
                <span className="sr-only">{isClean(e) ? 'clean solve' : e.solved ? 'solved with help' : 'not solved'}</span>
              </li>
            ))}
          </ul>
          <p className="muted small"><a href="#/puzzles/history">Full history</a> · <a href="#/profile">Profile statistics</a></p>
        </section>
      )}
    </>
  );
}

/* ------------------------------ Themes ------------------------------ */

function Themes() {
  const { library } = useLibrary();
  const data = usePuzzleData();
  const lib = library!;
  const skills = useMemo(() => themeSkills(data.events), [data.events]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of lib.puzzles) for (const t of p.themes) m.set(t, (m.get(t) ?? 0) + 1);
    return m;
  }, [lib]);
  const groups: Array<[string, string]> = [['mate', 'Checkmate'], ['tactic', 'Tactics'], ['pattern', 'Patterns'], ['defence', 'Defence'], ['endgame', 'Endgames']];
  return (
    <>
      <header>
        <h1 style={{ marginBottom: 4 }}>Themes</h1>
        <p className="muted" style={{ marginTop: 0 }}>Counts are the puzzles installed on this device. Skill levels need at least 5 puzzles of a theme, so a short run is never judged.</p>
      </header>
      {groups.map(([g, title]) => {
        const rows = THEMES.filter((t) => t.group === g && (counts.get(t.id) ?? 0) > 0);
        if (!rows.length) return null;
        return (
          <section key={g} className="card" aria-label={title}>
            <h2 style={{ marginTop: 0 }}>{title}</h2>
            <ul className="pz-themes">
              {rows.map((t) => {
                const s = skills.get(t.id);
                return (
                  <li key={t.id}>
                    <a href={`#/puzzles/play/theme/${t.id}`} data-testid={`theme-${t.id}`}>
                      <b>{t.label}</b>
                      <span className="muted small">{counts.get(t.id)} puzzles</span>
                      <span className={`pz-level ${s?.level ?? 'unknown'}`}>{s ? `${LEVEL_TEXT[s.level]} · ${s.attempts} tried` : LEVEL_TEXT.unknown}{s?.hotStreak ? ' · strong run' : ''}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      <p className="muted small">
        Not in the collection yet: exchange sacrifices, king hunts and strategic exercises. Lichess does not tag those, and MoveWise does not guess at them.
      </p>
    </>
  );
}

/* ------------------------------ History ----------------------------- */

function History() {
  const { library } = useLibrary();
  const data = usePuzzleData();
  const lib = library!;
  const rows = [...data.events].sort((a, b) => b.at - a.at).slice(0, 150);
  const daily = [...data.daily].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  return (
    <>
      <header>
        <h1 style={{ marginBottom: 4 }}>History</h1>
        <p className="muted" style={{ marginTop: 0 }}>Open any puzzle again to revisit it. Revisits never change your rating.</p>
      </header>
      {rows.length === 0 ? (
        <div className="card"><p>No puzzles played yet.</p><a className="btn primary" href="#/puzzles/play/practice">Start training</a></div>
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="pz-table" data-testid="puzzle-history">
            <thead><tr><th>When</th><th>Theme</th><th>Rating</th><th>Result</th><th>Mode</th><th /></tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.at).toLocaleDateString()}</td>
                  <td>{e.themes[0] ? themeLabel(e.themes[0]) : e.puzzleId.startsWith('game:') ? 'Your game' : '-'}</td>
                  <td>{e.puzzleRating}</td>
                  <td>{isClean(e) ? 'Clean' : e.solved ? (e.hintsUsed ? `Hint ${e.hintsUsed}` : 'After a miss') : e.usedSolution ? 'Viewed' : 'Missed'}{e.rated ? ' · rated' : ''}</td>
                  <td>{e.mode ?? 'practice'}</td>
                  <td>{e.puzzleId.startsWith('game:') ? <a href={gameHref(e.puzzleId)}>Open</a> : lib.byId.has(e.puzzleId) && e.mode !== 'rush' ? <a href={`#/puzzles/play/id/${encodeURIComponent(e.puzzleId)}`}>Revisit</a> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {daily.length > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Daily puzzles</h2>
          <ul className="pz-daily-list">
            {daily.map((d) => (
              <li key={d.date}>{d.date}: {d.solvedAt ? (d.clean ? 'solved cleanly' : 'solved') : 'not solved'} · <a href={`#/puzzles/play/id/${encodeURIComponent(d.puzzleId)}`}>Revisit</a></li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

/* ------------------------------ Packs ------------------------------- */

function Packs() {
  const { store, toast, notifyDataChanged } = useApp();
  const { library } = useLibrary();
  const lib = library!;
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [csv, setCsv] = useState<{ text: string; name: string } | null>(null);
  const [meta, setMeta] = useState({ name: '', license: '', attribution: '', source: '' });
  const [report, setReport] = useState<string | null>(null);

  async function install(raw: unknown) {
    const c = checkPack(raw);
    if (!c.pack) {
      setReport(c.error ?? 'The pack could not be read.');
      return;
    }
    if (isBundled(c.pack.id)) {
      setReport('That id belongs to the bundled pack. Give your pack its own id.');
      return;
    }
    await store.putPack(c.pack);
    invalidateLibrary();
    notifyDataChanged();
    setReport(`Installed "${c.pack.name}": ${c.accepted} puzzles passed validation${c.rejected.length ? `, ${c.rejected.length} were rejected (${[...new Set(c.rejected.map((r) => r.reason))].slice(0, 3).join('; ')})` : ''}. It is available after you reload this page.`);
    toast(`Installed ${c.accepted} puzzles`);
  }

  async function onFile(f: File) {
    setBusy(true);
    setReport(null);
    try {
      const text = await f.text();
      if (/\.csv$/i.test(f.name)) {
        setCsv({ text, name: f.name });
        setMeta({ name: f.name.replace(/\.csv$/i, ''), license: '', attribution: '', source: '' });
      } else {
        await install(JSON.parse(text));
      }
    } catch {
      setReport('That file could not be read as a puzzle pack.');
    } finally {
      setBusy(false);
      if (file.current) file.current.value = '';
    }
  }

  async function installCsv() {
    if (!csv) return;
    const id = 'csv-' + meta.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const raw = csvToPack(csv.text, { id, ...meta });
    if (!raw) {
      setReport('The CSV needs the Lichess columns PuzzleId, FEN, Moves, Rating and Themes.');
      return;
    }
    setBusy(true);
    try {
      await install(raw);
      setCsv(null);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Remove the pack "${name}"? Your history stays, but those puzzles cannot be opened again.`)) return;
    await store.deletePack(id);
    invalidateLibrary();
    notifyDataChanged();
    setReport(`Removed "${name}". Reload this page to refresh the collection.`);
  }

  return (
    <>
      <header>
        <h1 style={{ marginBottom: 4 }}>Collection</h1>
        <p className="muted" style={{ marginTop: 0 }}>{lib.puzzles.length.toLocaleString()} puzzles installed. Nothing is downloaded automatically.</p>
      </header>
      {lib.problems.length > 0 && <div className="notice error" role="alert">{lib.problems.join(' ')}</div>}
      <div className="stack">
        {lib.packs.map((p) => (
          <section key={p.id} className="card" data-testid={`pack-${p.id}`}>
            <h2 style={{ marginTop: 0 }}>{p.name} <span className="muted small">{p.count.toLocaleString()} puzzles{p.bundled ? ' · bundled' : ''}</span></h2>
            {p.description && <p>{p.description}</p>}
            <p className="small"><b>Licence:</b> {p.license}. <b>Attribution:</b> {p.attribution}. <b>Source:</b> {p.source}</p>
            {!p.bundled && <button className="btn small" type="button" onClick={() => void remove(p.id, p.name)}>Remove</button>}
          </section>
        ))}
      </div>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Add a puzzle pack</h2>
        <p className="muted small">
          A pack is a file you choose yourself, either a MoveWise pack (.json) or a Lichess puzzle export (.csv). Every position and solution is checked with the chess rules before it is kept, and a pack must state its licence and source.
          The Lichess database is free to download from <span className="pv">database.lichess.org</span> (CC0).
        </p>
        <input ref={file} type="file" accept=".json,.csv,application/json,text/csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} disabled={busy} aria-label="Choose a puzzle pack file" data-testid="pack-file" />
        {csv && (
          <form className="stack" onSubmit={(e) => { e.preventDefault(); void installCsv(); }} style={{ marginTop: 12 }}>
            <p className="small">Before installing {csv.name}, say where it comes from.</p>
            {(['name', 'license', 'attribution', 'source'] as const).map((k) => (
              <label key={k} className="field">
                <span>{k === 'license' ? 'Licence (for example CC0-1.0)' : k[0]!.toUpperCase() + k.slice(1)}</span>
                <input value={meta[k]} onChange={(e) => setMeta({ ...meta, [k]: e.target.value })} required />
              </label>
            ))}
            <button className="btn primary" type="submit" disabled={busy}>Check and install</button>
          </form>
        )}
        {report && <div className="notice" role="status" data-testid="pack-report">{report}</div>}
      </section>
    </>
  );
}

const gameHref = (puzzleId: string): string => {
  const m = /^game:(.+):(\d+)$/.exec(puzzleId);
  return m ? `#/puzzles/play/game/${encodeURIComponent(m[1]!)}/${m[2]}` : '#/puzzles';
};

/* --------------------------- From your games ------------------------- */

function FromGames() {
  return (
    <>
      <header>
        <h1 style={{ marginBottom: 4 }}>From your games</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          Practice positions from your own games now live in the Mistake Notebook, which schedules them for review. Anything you saved here before has been moved there.
        </p>
      </header>
      <div className="card"><a className="btn primary" href="#/notebook">Open the Mistake Notebook</a></div>
    </>
  );
}
