// Minimal static file server for dist/ (used for local testing and e2e).
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const root = join(new URL('..', import.meta.url).pathname, 'dist');
const port = Number(process.env.PORT || 4173);
// BASE_PATH=/movewise serves the app under a sub-path, the way GitHub Pages serves a project site (https://user.github.io/movewise/).
const base = (process.env.BASE_PATH || '').replace(/\/+$/, '');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
  // Stockfish's WebAssembly must be served as application/wasm (streaming compilation requires it).
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

createServer((req, res) => {
  let path = decodeURIComponent((req.url || '/').split('?')[0]);
  if (base) {
    if (path === base) {
      res.writeHead(301, { Location: base + '/' }).end();
      return;
    }
    if (!path.startsWith(base + '/')) {
      res.writeHead(404).end('Not found');
      return;
    }
    path = path.slice(base.length);
  }
  let file = normalize(join(root, path));
  if (!file.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': types[extname(file)] || 'application/octet-stream',
    'Cache-Control': file.endsWith('sw.js') ? 'no-cache' : 'no-cache',
  });
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`MoveWise on http://localhost:${port}/`));
