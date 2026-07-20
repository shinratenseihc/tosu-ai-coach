const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const testDataDir = path.join(os.tmpdir(), `tosu-ai-coach-tests-${process.pid}`);
process.env.TOSU_COACH_DATA_DIR = testDataDir;
const { timingStats, recordFingerprint, offsetAdvice, instantSummary, retryStreak, fatigueAdvice } = require('../coach-service');

test.after(() => {
  if (path.dirname(testDataDir) === os.tmpdir() && path.basename(testDataDir).startsWith('tosu-ai-coach-tests-')) {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  }
});

function completed(overrides = {}) {
  return {
    beatmapId: 1, score: 1000, accuracy: 95, combo: 100, misses: 1,
    completion: 'finished', hit50: 0, hit100: 10, hit300: 190,
    timing: { average: -10, unstableRate: 100 }, ...overrides,
  };
}

test('timingStats ignore les valeurs aberrantes', () => {
  assert.deepEqual(timingStats([-10, 10, 500]), { average: 0, unstableRate: 100, earlyPercent: 50, latePercent: 50 });
});

test('recordFingerprint distingue un abandon d’un résultat terminé', () => {
  assert.notEqual(recordFingerprint(completed()), recordFingerprint(completed({ completion: 'abandoned' })));
});

test('offsetAdvice exige assez de parties et de beatmaps', () => {
  assert.equal(offsetAdvice([completed(), completed({ beatmapId: 2 })]), null);
});

test('offsetAdvice conseille un offset universel positif pour des frappes early', () => {
  const records = [1, 2, 3, 4, 5].map((beatmapId, index) => completed({ beatmapId, score: 1000 + index, timing: { average: -12 + index % 2, unstableRate: 100 } }));
  const advice = offsetAdvice(records);
  assert.equal(advice.changeMs, 12);
  assert.equal(advice.type, 'universal');
});

test('offsetAdvice ignore les doublons exacts', () => {
  const record = completed();
  assert.equal(offsetAdvice([record, record, record, record, record]), null);
});

test('instantSummary transforme un abandon en apprentissage', () => {
  const text = instantSummary(completed({ completion: 'abandoned', progressPercent: 42 }), null);
  assert.match(text, /42%/);
  assert.match(text, /données|revanche/);
});

test('retryStreak compte les abandons consécutifs de la même map', () => {
  const records = [completed({ beatmapId: 3, completion: 'abandoned' }), completed({ beatmapId: 7, completion: 'abandoned' }), completed({ beatmapId: 7, completion: 'failed' })];
  assert.equal(retryStreak(records, 7), 2);
});

test('fatigueAdvice signale une baisse nette, pas une variation minime', () => {
  const records = [completed({ accuracy: 97, timing: { average: 0, unstableRate: 100 } }), completed({ accuracy: 96, timing: { average: 0, unstableRate: 115 } }), completed({ accuracy: 94, timing: { average: 0, unstableRate: 135 } })];
  assert.ok(fatigueAdvice(records));
  assert.equal(fatigueAdvice([completed(), completed(), completed()]), null);
});
