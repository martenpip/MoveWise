import { createRoot } from 'react-dom/client';
import { openStore } from '../storage/store';
import { DEFAULT_SETTINGS } from '../storage/types';
import { AppProvider, Shell, useRoute } from './app';
import { AcademyRoutes } from './pages/Academy';
import { AnalysisPage } from './pages/Analysis';
import { GamesPage } from './pages/Games';
import { NotebookRoutes } from './pages/Notebook';
import { HomePage } from './pages/Home';
import { PlayPage } from './pages/Play';
import { ProfilePage } from './pages/Profile';
import { PuzzleSolve, type SolveSource } from './pages/PuzzleSolve';
import { PuzzlesPage } from './pages/Puzzles';
import { ReviewPage } from './pages/Review';
import { SettingsPage } from './pages/Settings';
import './styles.css';

function Router() {
  const route = useRoute();
  if (route === '/play') return <PlayPage />;
  if (route === '/analysis') return <AnalysisPage />;
  if (route === '/games') return <GamesPage id={null} />;
  if (route.startsWith('/games/') && route.endsWith('/review')) return <ReviewPage key={route} id={decodeURIComponent(route.slice('/games/'.length, -'/review'.length))} />;
  if (route.startsWith('/games/')) return <GamesPage id={decodeURIComponent(route.slice('/games/'.length))} />;
  if (route.startsWith('/puzzles')) return <PuzzleRoutes route={route} />;
  if (route.startsWith('/academy')) return <AcademyRoutes route={route} />;
  if (route.startsWith('/notebook')) return <NotebookRoutes route={route} />;
  if (route === '/profile') return <ProfilePage />;
  if (route === '/settings') return <SettingsPage />;
  return <HomePage />;
}

const TRAIN = new Set(['practice', 'mixed', 'weakness', 'review']);

function PuzzleRoutes({ route }: { route: string }) {
  const parts = route.split('/').slice(2).map(decodeURIComponent);
  const [a, b, c, d] = parts;
  const solve = (source: SolveSource) => <PuzzleSolve key={route} source={source} />;
  if (!a) return <PuzzlesPage view="hub" />;
  if (a === 'themes' || a === 'history' || a === 'packs' || a === 'games') return <PuzzlesPage view={a} />;
  if (a === 'rush' && (b === '3' || b === '5' || b === '10')) return solve({ kind: 'rush', minutes: Number(b) as 3 | 5 | 10 });
  if (a === 'play') {
    if (b === 'daily') return solve({ kind: 'daily' });
    if (b === 'theme' && c) return solve({ kind: 'train', mode: 'theme', theme: c });
    if (b === 'confirmed' && c) return solve({ kind: 'train', mode: 'theme', theme: c, confirmed: true });
    if (b === 'id' && c) return solve({ kind: 'id', id: c });
    if (b === 'game' && c && d && /^\d+$/.test(d)) return solve({ kind: 'game', gameId: c, ply: Number(d) });
    if (b && TRAIN.has(b)) return solve({ kind: 'train', mode: b as 'practice' | 'mixed' | 'weakness' | 'review' });
  }
  return <PuzzlesPage view="hub" />;
}

async function main() {
  const store = await openStore();
  const settings = await store.getSettings().catch(() => undefined);
  createRoot(document.getElementById('root')!).render(
    <AppProvider store={store} initial={settings ?? DEFAULT_SETTINGS}>
      <Shell>
        <Router />
      </Shell>
    </AppProvider>,
  );
}

void main();
