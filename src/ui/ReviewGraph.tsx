import { useId, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import type { PlyAnalysis } from '../review/analyse';
import { CLASS_LABEL } from '../review/explain';
import { formatEval } from '../review/format';
import type { PositionEval } from '../review/types';

const W = 640;
const H = 170;
const PAD = { l: 12, r: 12, t: 22, b: 22 };

/** Text that tells a screen-reader user what the line shows, without reading every point. */
export function graphSummary(series: number[], plies: PlyAnalysis[]): string {
  if (series.length < 2) return 'Evaluation graph: no moves.';
  const swings = plies.filter((p) => p.cls === 'blunder' || p.cls === 'mistake').length;
  const final = series[series.length - 1]!;
  const lead = final > 60 ? 'White is clearly ahead' : final < 40 ? 'Black is clearly ahead' : 'the position is about level';
  return `Evaluation graph over ${plies.length} moves. At the end ${lead}. ${swings} mistakes or blunders are marked. Use the left and right arrow keys to move through the game.`;
}

/**
 * The game's evaluation move by move, as White's chance of winning (top = White ahead). Click or drag to jump to a
 * move; the arrow keys step. Mistakes and blunders are marked with different SHAPES as well as colours.
 * Everything drawn is the stored engine evaluation; nothing is smoothed or invented.
 */
export function ReviewGraph({
  series, plies, positions, current, onSelect,
}: {
  series: number[];
  plies: PlyAnalysis[];
  positions: PositionEval[];
  current: number;
  onSelect: (ply: number) => void;
}) {
  const id = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const n = series.length - 1;
  if (n < 1) return null;
  const x = (i: number) => PAD.l + (i / n) * (W - PAD.l - PAD.r);
  const y = (w: number) => PAD.t + ((100 - w) / 100) * (H - PAD.t - PAD.b);
  const mid = y(50);
  const pts = series.map((w, i) => `${x(i).toFixed(1)},${y(w).toFixed(1)}`);
  const line = `M${pts.join(' L')}`;
  const area = `M${x(0).toFixed(1)},${mid} L${pts.join(' L')} L${x(n).toFixed(1)},${mid} Z`;

  const plyAt = (clientX: number): number => {
    const rect = svgRef.current!.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * W;
    return Math.max(0, Math.min(n, Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * n)));
  };
  const onDown = (e: PointerEvent<SVGSVGElement>) => {
    dragging.current = true;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    onSelect(plyAt(e.clientX));
  };
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    if (dragging.current) onSelect(plyAt(e.clientX));
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const to = e.key === 'ArrowLeft' ? current - 1 : e.key === 'ArrowRight' ? current + 1 : e.key === 'Home' ? 0 : e.key === 'End' ? n : null;
    if (to === null) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect(Math.max(0, Math.min(n, to)));
  };

  const cur = current > 0 ? plies[current - 1] : null;
  const valueText =
    current === 0
      ? `Start of the game, evaluation ${formatEval(positions[0]!)}`
      : `After move ${Math.ceil(current / 2)}${cur!.color === 'white' ? '' : ' by Black'}, ${cur!.san}: ${CLASS_LABEL[cur!.cls]}, evaluation ${formatEval(positions[current]!)}`;

  return (
    <div className="rv-graph">
      <svg
        ref={svgRef}
        className="rv-graph-svg"
        viewBox={`0 0 ${W} ${H}`}
        role="slider"
        tabIndex={0}
        aria-label={graphSummary(series, plies)}
        aria-valuemin={0}
        aria-valuemax={n}
        aria-valuenow={current}
        aria-valuetext={valueText}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        onKeyDown={onKey}
      >
        <defs>
          <clipPath id={`${id}-up`}><rect x="0" y="0" width={W} height={mid} /></clipPath>
          <clipPath id={`${id}-down`}><rect x="0" y={mid} width={W} height={H - mid} /></clipPath>
        </defs>
        <rect x="0" y="0" width={W} height={H} className="rv-graph-bg" />
        <path d={area} className="rv-area-white" clipPath={`url(#${id}-up)`} />
        <path d={area} className="rv-area-black" clipPath={`url(#${id}-down)`} />
        <line x1={PAD.l} x2={W - PAD.r} y1={mid} y2={mid} className="rv-mid" />
        <text x={PAD.l + 2} y={PAD.t - 8} className="rv-axis">White ahead</text>
        <text x={PAD.l + 2} y={H - 6} className="rv-axis">Black ahead</text>
        <path d={line} className="rv-line" fill="none" />
        {plies.map((p) => {
          if (p.cls !== 'inaccuracy' && p.cls !== 'mistake' && p.cls !== 'blunder') return null;
          const cx = x(p.ply);
          const cy = y(series[p.ply]!);
          const title = `Move ${Math.ceil(p.ply / 2)}${p.color === 'white' ? '' : '…'} ${p.san}: ${CLASS_LABEL[p.cls]}`;
          if (p.cls === 'blunder') return <circle key={p.ply} cx={cx} cy={cy} r="5.5" className="rv-mark blunder"><title>{title}</title></circle>;
          if (p.cls === 'mistake') return <rect key={p.ply} x={cx - 4.5} y={cy - 4.5} width="9" height="9" transform={`rotate(45 ${cx} ${cy})`} className="rv-mark mistake"><title>{title}</title></rect>;
          return <circle key={p.ply} cx={cx} cy={cy} r="3.5" className="rv-mark inaccuracy"><title>{title}</title></circle>;
        })}
        <line x1={x(current)} x2={x(current)} y1={PAD.t - 4} y2={H - PAD.b + 4} className="rv-cursor" />
        <circle cx={x(current)} cy={y(series[current]!)} r="4" className="rv-cursor-dot" />
      </svg>
      <details className="chart-data">
        <summary>Show the evaluations as a table</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th scope="col">Move</th><th scope="col">Played</th><th scope="col">Evaluation (White)</th><th scope="col">White win chance</th><th scope="col">Verdict</th></tr>
            </thead>
            <tbody>
              {plies.map((p) => (
                <tr key={p.ply}>
                  <th scope="row">{Math.ceil(p.ply / 2)}{p.color === 'white' ? '.' : '…'}</th>
                  <td>{p.san}</td>
                  <td>{formatEval(positions[p.ply]!)}</td>
                  <td>{Math.round(series[p.ply]!)}%</td>
                  <td>{CLASS_LABEL[p.cls]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
