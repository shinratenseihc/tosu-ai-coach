const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const testDataDir = path.join(os.tmpdir(), `tosu-ai-coach-tests-${process.pid}`);
process.env.TOSU_COACH_DATA_DIR = testDataDir;
const { timingStats, recordFingerprint, offsetAdvice, instantSummary } = require('../coach-service');

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
