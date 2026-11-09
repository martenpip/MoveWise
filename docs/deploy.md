# Installing, running and deploying MoveWise

## Run it locally

```bash
npm ci
npm run build        # writes dist/
npm run serve        # http://localhost:4173
```

Open the page once while online. After that the app, including Stockfish, runs without a network and can be installed from the browser menu.

## GitHub Pages

MoveWise is a static site with relative URLs and hash routes (`#/play`), so it works under a sub-path such as `https://USER.github.io/movewise/` and a refresh on any page works without server rewrites. The service worker, manifest, icons and the Stockfish WebAssembly files are all referenced relative to the page.

The workflow `.github/workflows/pages.yml` runs the type check, unit tests, build and several browser tests, then uploads `dist/` and deploys it with the official Pages actions. To use it:

1. Create the repository on GitHub and push this project to the `main` branch.
2. In the repository, open Settings, then Pages, and set the source to **GitHub Actions**.
3. Push to `main` (or run the workflow by hand). The deploy job prints the site address.

**Status of this repository:** the workflow has been written and its syntax checked, but it has **not been run on GitHub**, and no deployment has been made from this project. The first run may need small fixes (for example browser installation on the runner).

### Testing the sub-path locally

```bash
npm run build
npm run test:e2e:subpath
```

This serves `dist/` under `/movewise/` (the same way Pages serves a project site, using `BASE_PATH=/movewise` in `scripts/serve.mjs`) and checks the service worker scope, the manifest, Stockfish loading, a Stockfish-backed bot move, a reload on a deep route, and offline use.

### Custom domain or a user site

A site served at the root of a domain needs no change. If you use a custom domain, add it in the Pages settings.

## Other static hosts

Upload the contents of `dist/` anywhere that serves static files. Serve `.wasm` as `application/wasm` if you can (the app tolerates a wrong type). No special headers are needed: the bundled Stockfish is the single-threaded build.

## Updating

After a new version is deployed, installed copies show "A new version is ready" and update when you choose, not in the middle of a game.
