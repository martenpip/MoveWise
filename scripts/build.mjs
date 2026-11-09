// MoveWise build: bundles the app, the engine worker and the CSS with esbuild,
// writes index.html, copies static files, and generates a service worker whose
// precache list covers every built file (so the app works fully offline).
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

// createRequire keeps this working with a normal install and with NODE_PATH-provided tooling.
const { build } = createRequire(import.meta.url)('esbuild');

const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'assets'), { recursive: true });

const common = {
  bundle: true,
  minify: true,
  sourcemap: false,
  target: 'es2022',
  legalComments: 'none',
  absWorkingDir: root,
  // Extra module lookup roots (empty in a normal install; set via NODE_PATH for pre-provisioned tooling).
  nodePaths: (process.env.NODE_PATH || '').split(':').filter(Boolean),
  metafile: true,
};

// 0. Stockfish. Exactly ONE build ships: the lite, single-threaded WebAssembly build (~1.9 MB). It needs no special
// server headers and is precached for offline use. The package also contains ~94 MB full builds, multi-threaded builds
// and an asm.js build; none of them are copied. Files keep their original names because the engine script locates its
// .wasm next to itself by name. A missing engine fails the build instead of quietly shipping an app without it.
const sfDir = join(root, 'node_modules/stockfish');
const sfBin = join(sfDir, 'bin');
const sfScripts = existsSync(sfBin) ? readdirSync(sfBin).filter((f) => /^stockfish-\d+-lite-single\.js$/.test(f)) : [];
if (sfScripts.length !== 1 || !existsSync(join(sfBin, sfScripts[0].replace(/\.js$/, '.wasm')))) {
  throw new Error('Stockfish lite single-threaded build (.js + .wasm) not found in node_modules/stockfish/bin. Run "npm ci".');
}
const sfBase = sfScripts[0].replace(/\.js$/, '');
const sfMajor = /^stockfish-(\d+)-/.exec(sfBase)[1];
const sfVersion = JSON.parse(readFileSync(join(sfDir, 'package.json'), 'utf8')).version;
mkdirSync(join(dist, 'assets/stockfish'), { recursive: true });
for (const ext of ['.js', '.wasm']) cpSync(join(sfBin, sfBase + ext), join(dist, 'assets/stockfish', sfBase + ext));
const stockfishInfo = {
  id: sfBase,
  name: `Stockfish ${sfMajor} (lite)`,
  version: sfVersion,
  scriptUrl: `./assets/stockfish/${sfBase}.js`,
};

// Licence texts and the written pointer to Stockfish's corresponding source (GPL-3.0 section 6).
mkdirSync(join(dist, 'licenses'), { recursive: true });
cpSync(join(root, 'LICENSE'), join(dist, 'licenses/MoveWise-LICENSE.txt'));
cpSync(join(sfDir, 'Copying.txt'), join(dist, 'licenses/Stockfish-COPYING.txt'));
// React, React DOM and scheduler are bundled into the app script under the MIT licence, which requires their notices to travel with it.
for (const pkg of ['react', 'react-dom', 'scheduler']) cpSync(join(root, 'node_modules', pkg, 'LICENSE'), join(dist, `licenses/${pkg}-LICENSE.txt`));
writeFileSync(
  join(dist, 'licenses/Stockfish-SOURCE.txt'),
  `Stockfish in MoveWise: licence and corresponding source
=======================================================

MoveWise includes an unmodified copy of a WebAssembly build of the Stockfish chess engine,
made by the Stockfish.js project and published on npm as "stockfish".

  Engine:        Stockfish ${sfMajor}, "lite" build (smaller neural network), single-threaded
  Package:       stockfish ${sfVersion} (npm)
  Files:         assets/stockfish/${sfBase}.js
                 assets/stockfish/${sfBase}.wasm
  Licence:       GNU General Public License, version 3 (full text: Stockfish-COPYING.txt, in this folder)

Complete corresponding source code
----------------------------------
  Stockfish.js ${sfVersion} (the Stockfish source, the WebAssembly glue code and the build scripts):
    https://github.com/nmrugg/stockfish.js/tree/v${sfVersion}
  Stockfish ${sfMajor} (the upstream engine):
    https://github.com/official-stockfish/Stockfish/tree/sf_${sfMajor}
  The published npm package:
    https://www.npmjs.com/package/stockfish/v/${sfVersion}

MoveWise itself is licensed GPL-3.0-or-later (MoveWise-LICENSE.txt, in this folder).
`,
);

// 1. Engine worker (classic script so it also loads in older browsers).
const worker = await build({
  ...common,
  entryPoints: { 'engine.worker': 'src/engine/worker.ts' },
  outdir: join(dist, 'assets'),
  entryNames: '[name]-[hash]',
  format: 'iife',
});
const workerFile = Object.keys(worker.metafile.outputs)[0];
const workerUrl = './assets/' + workerFile.split('/').pop();

// 2. App bundle + CSS; the worker URL is injected at build time.
const app = await build({
  ...common,
  entryPoints: { app: 'src/ui/main.tsx' },
  outdir: join(dist, 'assets'),
  entryNames: '[name]-[hash]',
  format: 'esm',
  jsx: 'automatic',
  define: {
    __WORKER_URL__: JSON.stringify(workerUrl),
    __STOCKFISH__: JSON.stringify(stockfishInfo),
    'process.env.NODE_ENV': '"production"',
  },
  loader: { '.css': 'css' },
});
const outs = Object.keys(app.metafile.outputs).map((p) => './assets/' + p.split('/').pop());
const js = outs.find((f) => f.endsWith('.js'));
const css = outs.find((f) => f.endsWith('.css'));

// 3. Static files.
cpSync(join(root, 'public'), dist, { recursive: true });

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>MoveWise — Learn. Play. Improve.</title>
<meta name="description" content="MoveWise is a free, open-source chess app that works offline.">
<meta name="theme-color" content="#0f1420">
<link rel="manifest" href="./manifest.webmanifest">
<link rel="icon" href="./icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="./icons/icon-192.png">
<link rel="stylesheet" href="${css}">
<script>
/* Apply the saved theme before first paint to avoid a dark-to-light flash. */
try {
  var t = localStorage.getItem('mw-theme') || 'dark';
  var b = localStorage.getItem('mw-board') || 'walnut';
  var dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.board = b;
} catch (e) {}
</script>
</head>
<body>
<div id="root"></div>
<noscript>MoveWise needs JavaScript to run. It has no trackers and makes no network requests for normal use.</noscript>
<script type="module" src="${js}"></script>
</body>
</html>
`;
writeFileSync(join(dist, 'index.html'), html);

// 4. Service worker with a build-specific precache list.
function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const files = walk(dist)
  .map((p) => './' + relative(dist, p).replaceAll('\\', '/'))
  .filter((f) => f !== './sw.js');
const hash = createHash('sha256');
for (const f of files.sort()) hash.update(f).update(readFileSync(join(dist, f)));
const version = hash.digest('hex').slice(0, 12);
const sw = readFileSync(join(root, 'scripts/sw.template.js'), 'utf8')
  .replace('__VERSION__', version)
  .replace('__PRECACHE__', JSON.stringify(['./', ...files]));
writeFileSync(join(dist, 'sw.js'), sw);

const size = files.reduce((n, f) => n + statSync(join(dist, f)).size, 0);
console.log(`Built MoveWise ${version}: ${files.length} files, ${(size / 1024).toFixed(0)} KiB precached`);
