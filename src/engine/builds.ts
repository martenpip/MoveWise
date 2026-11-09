/**
 * Stockfish builds MoveWise knows how to run.
 *
 * Only ONE build ships in the app: the "lite, single-threaded" WebAssembly build (about 1.9 MB). It needs no special
 * server headers, works on any static host, and is cached for offline use with the rest of the app.
 *
 * The shape below is deliberately general so that stronger builds can be added later without touching the pages or
 * `EngineClient`: a build is just "where its script is" plus what it needs from the browser. A future, larger build
 * (for example the ~94 MB full-strength one) would be an optional download the person chooses, stored in its own
 * cache, and listed here only once it is installed. The 'requires cross-origin isolation' flag exists because the
 * multi-threaded builds need COOP/COEP headers that a plain static host does not send.
 */
export interface StockfishBuild {
  /** Stable id, e.g. "stockfish-19-lite-single". */
  id: string;
  /** Shown next to evaluations, e.g. "Stockfish 19 (lite)". */
  name: string;
  /** URL of the engine's .js file, which is itself a Web Worker script. */
  scriptUrl: string;
  /** Where the .wasm lives, if not next to the script with the same base name. */
  wasmUrl?: string;
  /** True for the multi-threaded builds, which need SharedArrayBuffer (COOP + COEP headers). */
  requiresCrossOriginIsolation: boolean;
  /**
   * Lowest search depth to request for analysis. Stockfish is far faster than the built-in engine, so the depth
   * the pages ask for (tuned for the built-in engine) would finish almost instantly and waste its strength. The
   * time limit the page asks for still applies, so this never makes analysis slower than before.
   */
  minAnalysisDepth: number;
}

/** What the current browser can offer. */
export interface BuildEnvironment {
  crossOriginIsolated: boolean;
}

export function isBuildUsable(build: StockfishBuild, env: BuildEnvironment): boolean {
  return !build.requiresCrossOriginIsolation || env.crossOriginIsolated;
}

/** Injected by scripts/build.mjs (esbuild `define`); null when the build did not include Stockfish. */
export interface BundledStockfishInfo {
  id: string;
  name: string;
  /** The Stockfish.js (npm) version that was bundled, e.g. "19.0.1". */
  version: string;
  scriptUrl: string;
}

/** The builds that ship inside this copy of the app (zero or one today). */
export function bundledStockfishBuilds(): StockfishBuild[] {
  const b = typeof __STOCKFISH__ === 'undefined' ? null : __STOCKFISH__;
  if (!b) return [];
  return [
    {
      id: b.id,
      name: b.name,
      scriptUrl: b.scriptUrl,
      requiresCrossOriginIsolation: false,
      minAnalysisDepth: 18,
    },
  ];
}
