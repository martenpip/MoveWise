import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

/**
 * Small, dependency-free charts. They use the theme's colour tokens (--c1…, --good, --danger, --grid) so they
 * follow dark/light automatically, can be explored by pointer or keyboard, and each offers its numbers as a table.
 * Callers decide whether there is enough data; these components never invent points.
 */

/* ------------------------------ helpers ------------------------------ */

function niceRange(min: number, max: number): { lo: number; hi: number; ticks: number[] } {
  if (min === max) {
    min -= 10;
    max += 10;
  }
  const span = max - min;
  const raw = span / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { lo, hi, ticks };
}

function DataTable({ caption, columns, rows }: { caption: string; columns: string[]; rows: Array<Array<string | number>> }) {
  return (
    <details className="chart-data">
      <summary>View the numbers as a table</summary>
      <div className="table-scroll">
        <table>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>{columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>{r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>))}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/* ----------------------------- line chart ---------------------------- */

export interface LinePoint {
  /** Heading shown in the tooltip and table (e.g. a date). */
  label: string;
  y: number;
  /** Extra tooltip line (e.g. "+12 vs Casual bot"). */
  detail?: string;
  /** Optional uncertainty band around y. */
  band?: { low: number; high: number };
}

const W = 640;
const H = 240;
const PAD = { l: 44, r: 14, t: 26, b: 26 };

export function LineChart({
  points,
  ariaLabel,
  yLabel,
  xLabel = 'Game',
  format = (n) => String(Math.round(n)),
  color = 'var(--c1)',
}: {
  points: LinePoint[];
  ariaLabel: string;
  yLabel: string;
  xLabel?: string;
  format?: (n: number) => string;
  color?: string;
}) {
  const id = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const n = points.length;
  const all = points.flatMap((p) => [p.y, p.band?.low ?? p.y, p.band?.high ?? p.y]);
  const { lo, hi, ticks } = niceRange(Math.min(...all), Math.max(...all));
  const x = (i: number) => PAD.l + (n === 1 ? (W - PAD.l - PAD.r) / 2 : (i * (W - PAD.l - PAD.r)) / (n - 1));
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join('');
  const hasBand = points.every((p) => p.band);
  const band = hasBand
    ? points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.band!.high).toFixed(1)}`).join('') +
      [...points].reverse().map((p, k) => `L${x(n - 1 - k).toFixed(1)},${y(p.band!.low).toFixed(1)}`).join('') + 'Z'
    : '';

  const nearest = (e: PointerEvent<SVGSVGElement>) => {
    const r = svgRef.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    setActive(best);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') setActive((a) => Math.min(n - 1, (a ?? -1) + 1));
    else if (e.key === 'ArrowLeft') setActive((a) => Math.max(0, (a ?? n) - 1));
    else if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(n - 1);
    else if (e.key === 'Escape') setActive(null);
    else return;
    e.preventDefault();
  };
  const a = active !== null ? points[active] : null;
  const xTicks = n <= 8 ? points.map((_, i) => i) : [0, Math.round((n - 1) / 2), n - 1];

  return (
    <figure className="chart">
      <div className="chart-box">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          role="application"
          tabIndex={0}
          aria-label={`${ariaLabel}. ${n} points. Use the left and right arrow keys to inspect each one.`}
          onPointerMove={nearest}
          onPointerDown={nearest}
          onPointerLeave={() => setActive(null)}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
              <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" className="axis">{format(t)}</text>
            </g>
          ))}
          {xTicks.map((i) => (
            <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 && n > 1 ? 'start' : i === n - 1 && n > 1 ? 'end' : 'middle'} className="axis">
              {xLabel} {i + 1}
            </text>
          ))}
          {hasBand && <path d={band} fill={color} opacity="0.13" />}
          <path d={line} fill="none" stroke={color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
          {n <= 60 && points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.y)} r={active === i ? 5.5 : 3} fill="var(--surface)" stroke={color} strokeWidth="2" />)}
          {active !== null && <line x1={x(active)} x2={x(active)} y1={PAD.t} y2={H - PAD.b} stroke={color} opacity="0.5" strokeDasharray="3 4" />}
          {active !== null && <circle cx={x(active)} cy={y(points[active]!.y)} r="6" fill={color} stroke="var(--surface)" strokeWidth="2" />}
          <text x="4" y="12" className="axis axis-title">{yLabel}</text>
        </svg>
        {a && active !== null && (
          <div className="tooltip" style={{ left: `clamp(80px, ${(x(active) / W) * 100}%, calc(100% - 80px))`, top: `${(y(a.y) / H) * 100}%` }} role="status">
            <b>{format(a.y)}</b>
            <span>{a.label}</span>
            {a.detail && <span>{a.detail}</span>}
          </div>
        )}
      </div>
      <DataTable
        caption={ariaLabel}
        columns={[xLabel, yLabel, 'Detail']}
        rows={points.map((p, i) => [`${xLabel} ${i + 1} · ${p.label}`, format(p.y), p.detail ?? ''])}
      />
      <span id={id} className="sr-only" />
    </figure>
  );
}

/* --------------------------- results columns ------------------------- */

export interface ResultBar {
  label: string;
  wins: number;
  draws: number;
  losses: number;
}

/** Stacked wins / draws / losses per time bucket. Losses are hatched so the chart does not rely on colour alone. */
export function ResultsChart({ bars, ariaLabel }: { bars: ResultBar[]; ariaLabel: string }) {
  const [active, setActive] = useState<number | null>(null);
  const hatch = useId().replace(/:/g, '');
  const max = Math.max(...bars.map((b) => b.wins + b.draws + b.losses), 1);
  const { hi, ticks } = niceRange(0, Math.max(max, 3));
  const n = bars.length;
  const slot = (W - PAD.l - PAD.r) / n;
  const bw = Math.min(46, slot * 0.66);
  const y = (v: number) => PAD.t + (1 - v / hi) * (H - PAD.t - PAD.b);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') setActive((a) => Math.min(n - 1, (a ?? -1) + 1));
    else if (e.key === 'ArrowLeft') setActive((a) => Math.max(0, (a ?? n) - 1));
    else if (e.key === 'Escape') setActive(null);
    else return;
    e.preventDefault();
  };
  const a = active !== null ? bars[active] : null;
  return (
    <figure className="chart">
      <div className="chart-box">
        <svg viewBox={`0 0 ${W} ${H}`} role="application" tabIndex={0} aria-label={`${ariaLabel}. ${n} bars. Use the arrow keys to inspect each one.`} onKeyDown={onKey} onBlur={() => setActive(null)} onPointerLeave={() => setActive(null)}>
          <defs>
            <pattern id={hatch} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="var(--danger)" />
              <rect width="2.4" height="6" fill="var(--surface)" opacity="0.55" />
            </pattern>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
              <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" className="axis">{Number.isInteger(t) ? t : ''}</text>
            </g>
          ))}
          {bars.map((b, i) => {
            const cx = PAD.l + slot * i + slot / 2;
            const total = b.wins + b.draws + b.losses;
            let acc = 0;
            const seg = (v: number, fill: string, key: string) => {
              if (!v) return null;
              const top = y(acc + v);
              const h = y(acc) - top;
              acc += v;
              return <rect key={key} x={cx - bw / 2} y={top} width={bw} height={Math.max(h - 1, 1)} rx="3" fill={fill} />;
            };
            return (
              <g key={i} onPointerEnter={() => setActive(i)} opacity={active === null || active === i ? 1 : 0.55}>
                <rect x={cx - slot / 2} y={PAD.t} width={slot} height={H - PAD.t - PAD.b} fill="transparent" />
                {seg(b.wins, 'var(--good)', 'w')}
                {seg(b.draws, 'var(--muted)', 'd')}
                {seg(b.losses, `url(#${hatch})`, 'l')}
                {(n <= 8 || i % Math.ceil(n / 8) === 0) && (
                  <text x={cx} y={H - 6} textAnchor="middle" className="axis">{b.label.replace('Week of ', '')}</text>
                )}
                <title>{`${b.label}: ${b.wins} won, ${b.draws} drawn, ${b.losses} lost (${total} ${total === 1 ? 'game' : 'games'})`}</title>
              </g>
            );
          })}
          <text x="4" y="12" className="axis axis-title">Games</text>
        </svg>
        {a && active !== null && (
          <div className="tooltip" style={{ left: `clamp(80px, ${((PAD.l + slot * active + slot / 2) / W) * 100}%, calc(100% - 80px))`, top: '8%' }} role="status">
            <b>{a.label}</b>
            <span>{a.wins} won · {a.draws} drawn · {a.losses} lost</span>
          </div>
        )}
      </div>
      <div className="legend" aria-hidden="true">
        <span><i style={{ background: 'var(--good)' }} /> Won</span>
        <span><i style={{ background: 'var(--muted)' }} /> Drawn</span>
        <span><i className="hatch" /> Lost</span>
      </div>
      <DataTable caption={ariaLabel} columns={['Period', 'Won', 'Drawn', 'Lost']} rows={bars.map((b) => [b.label, b.wins, b.draws, b.losses])} />
    </figure>
  );
}

/* ----------------------------- split bars ---------------------------- */

export interface SplitRow {
  label: string;
  sub?: string;
  n: number;
  wins: number;
  draws: number;
  losses: number;
}

/** One horizontal win/draw/loss bar per row, with the sample size always visible. */
export function SplitBars({ rows, minGames = 1 }: { rows: SplitRow[]; minGames?: number }) {
  return (
    <ul className="splitbars">
      {rows.map((r) => {
        const pct = (v: number) => `${(v / r.n) * 100}%`;
        const score = Math.round(((r.wins + r.draws / 2) / r.n) * 100);
        return (
          <li key={r.label}>
            <div className="splitbars-head">
              <span className="splitbars-label">{r.label}</span>
              <span className="muted small">
                {r.wins}W {r.draws}D {r.losses}L · {r.n} {r.n === 1 ? 'game' : 'games'}
                {r.n < minGames ? ' · too few to judge' : ` · ${score}% score`}
              </span>
            </div>
            <div className="splitbar" role="img" aria-label={`${r.label}: ${r.wins} won, ${r.draws} drawn, ${r.losses} lost`}>
              <span style={{ width: pct(r.wins), background: 'var(--good)' }} />
              <span style={{ width: pct(r.draws), background: 'var(--muted)' }} />
              <span className="hatch" style={{ width: pct(r.losses) }} />
            </div>
            {r.sub && <div className="muted small">{r.sub}</div>}
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------ sparkline ---------------------------- */

/** A tiny trend line with no axes. Decorative: callers always put the real numbers beside it. */
export function Sparkline({ values, color = 'var(--c1)' }: { values: number[]; color?: string }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const w = 120;
  const h = 36;
  const span = hi - lo || 1;
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * (w - 4) + 2).toFixed(1)},${(h - 4 - ((v - lo) / span) * (h - 8) + 2).toFixed(1)}`).join('');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true" focusable="false" className="sparkline">
      <path d={d} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
