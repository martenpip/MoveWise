import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { LADDER_RD } from '../src/engine/ladderCalibration';
import { COMPETITIVE_FROM, LEVELS, STOCKFISH_FROM } from '../src/engine/levels';

const doc = readFileSync(new URL('../docs/bots.md', import.meta.url), 'utf8');
const dir = new URL('../docs/calibration-ladder/', import.meta.url);

test('the ladder is 100 to 2500 in steps of 100 with the documented categories and backends', () => {
  assert.deepEqual(LEVELS.map((l) => l.rating), Array.from({ length: 25 }, (_, i) => (i + 1) * 100));
  for (const l of LEVELS) {
    assert.equal(l.category, l.rating < COMPETITIVE_FROM ? 'practice' : 'competitive', l.id);
    assert.equal(l.backend, l.rating < STOCKFISH_FROM ? 'builtin' : 'stockfish', l.id);
    assert.equal(l.name, `Bot ${l.rating}`);
  }
  assert.equal(COMPETITIVE_FROM, 1000);
  assert.equal(STOCKFISH_FROM, 1400);
});

test('Stockfish levels use their own number inside the limiter range', () => {
  for (const l of LEVELS.filter((x) => x.backend === 'stockfish')) {
    assert.equal(l.elo, l.rating);
    assert.ok(l.elo! >= 1320 && l.elo! <= 3190, l.id);
  }
});

test('the docs describe the ratings as approximate and do not claim Elo or FIDE equivalence', () => {
  assert.ok(doc.includes('approximate MoveWise bot ratings'));
  assert.match(doc, /not Elo, FIDE/);
  assert.match(doc, /spacing is not 100 per step/);
  assert.ok(doc.includes(`rating deviation of ${LADDER_RD.builtin}`) && doc.includes(`${LADDER_RD.stockfish} (Stockfish levels)`));
});

test('the verification table in the docs matches the raw games shipped with it', () => {
  let total = 0;
  for (let w = 100; w <= 1100; w += 100) {
    const file = new URL(`verify-${w}_${w + 200}.jsonl`, dir);
    assert.ok(existsSync(file), `missing ${w}`);
    const games = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { score: number; weak: number; strong: number });
    total += games.length;
    const wins = games.filter((g) => g.score === 1).length;
    const draws = games.filter((g) => g.score === 0.5).length;
    const row = new RegExp(`\\| ${w} v ${w + 200} \\| ${games.length} \\| ${wins}-${draws}-${games.length - wins - draws} \\|`);
    assert.match(doc, row, `table row for ${w}`);
    assert.ok(games.every((g) => g.weak === w && g.strong === w + 200));
  }
  assert.equal(total, 132);
  assert.match(doc, /\| All \| 132 \|/);
  assert.ok(readdirSync(dir).some((f) => f.startsWith('fam_')));
});

test('the Stockfish anchor results in the docs match the raw games', () => {
  for (const [r, games] of [[1100, 12], [1200, 12], [1300, 16]] as const) {
    const lines = readFileSync(new URL(`anc_${r}.jsonl`, dir), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { score: number });
    assert.equal(lines.length, games);
    const score = lines.reduce((a, g) => a + g.score, 0) / games;
    assert.match(doc, new RegExp(`\\| Bot ${r} \\| ${games} \\| ${score.toFixed(2)} \\|`), `anchor row ${r}`);
  }
});
