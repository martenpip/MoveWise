/** Runs the REAL Stockfish (the lite single-threaded build the app ships) in Node, one process per transport. */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import type { StockfishBuild } from '../src/engine/builds';
import type { UciTransport } from '../src/engine/uci';

const enginePath = (createRequire(import.meta.url)('stockfish') as { findEngine(flavor: string): string }).findEngine('lite-single');

export function realTransport(): UciTransport {
  const child = spawn(process.execPath, [enginePath], { stdio: ['pipe', 'pipe', 'ignore'] });
  let handler: (line: string) => void = () => undefined;
  let errorHandler: (e: Error) => void = () => undefined;
  let terminated = false;
  let buffered = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    buffered += chunk;
    for (let nl = buffered.indexOf('\n'); nl >= 0; nl = buffered.indexOf('\n')) {
      const line = buffered.slice(0, nl).replace(/\r$/, '');
      buffered = buffered.slice(nl + 1);
      if (line) handler(line);
    }
  });
  child.stdin.on('error', () => undefined);
  child.on('error', (e) => errorHandler(e));
  child.on('exit', () => {
    if (!terminated) errorHandler(new Error('The Stockfish process exited unexpectedly'));
  });
  return {
    send: (l) => void child.stdin.write(`${l}\n`),
    setHandler: (h) => {
      handler = h;
    },
    setErrorHandler: (h) => {
      errorHandler = h;
    },
    terminate: () => {
      terminated = true;
      child.kill();
    },
  };
}

export const TEST_BUILD: StockfishBuild = {
  id: 'test-lite',
  name: 'Stockfish 19 (lite)',
  scriptUrl: 'unused-in-node',
  requiresCrossOriginIsolation: false,
  minAnalysisDepth: 12,
};
