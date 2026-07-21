const test = require('node:test');
const assert = require('node:assert/strict');
const stats = require('../lib/stats.js');

test('timingStats filtre les valeurs aberrantes', () => {
  assert.deepEqual(stats.timingStats([-10, 0, 10, 900]), { average: 0, unstableRate: 81.6, earlyPercent: 33, latePercent: 33 });
});

test('les références de map ignorent les runs non terminés', () => {
  const records = [
    { beatmapId: 12, completion: 'finished', score: 100, accuracy: 98 },
    { beatmapId: 12, completion: 'abandoned', score: 999, accuracy: 100 },
    { beatmapId: 12, completion: 'finished', score: 200, accuracy: 97 },
  ];
  assert.equal(stats.previousMapResult(records, 12).score, 200);
  assert.equal(stats.bestMapResult(records, 12).score, 200);
});

test('retryStreak s’arrête au dernier résultat terminé', () => {
  const records = [
    { beatmapId: 5, completion: 'finished' },
    { beatmapId: 5, completion: 'failed' },
    { beatmapId: 5, completion: 'abandoned' },
  ];
  assert.equal(stats.retryStreak(records, 5), 2);
});
