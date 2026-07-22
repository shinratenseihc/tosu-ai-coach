const test = require('node:test');
const assert = require('node:assert/strict');
const { instantSummary, makeLiveRecord, makeRecord, selectedMapSummary } = require('../lib/records.js');

test('makeRecord normalise un résultat TOSU', () => {
  const record = makeRecord({ resultsScreen: { playerName: 'Shinra', score: 123, accuracy: 98.5, maxCombo: 44, hits: { 0: 1, 100: 2, 300: 30 } }, play: { hitErrorArray: [-5, 5] }, beatmap: { id: 9, set: 8, artist: 'A', title: 'T', version: 'D', stats: { maxCombo: 100 }, time: { live: 50, lastObject: 100 } } }, 'finished', new Date('2026-07-21T12:00:00Z'));
  assert.equal(record.timestamp, '2026-07-21T12:00:00.000Z');
  assert.equal(record.beatmapId, 9);
  assert.equal(record.misses, 1);
  assert.equal(record.progressPercent, 50);
});

test('makeLiveRecord ne conserve que la référence utile', () => {
  const live = makeLiveRecord({ beatmap: { id: 9 } }, { timestamp: 'x', score: 10, accuracy: 97, combo: 20, maxCombo: 30, misses: 2, pp: 5, secret: 'non' });
  assert.equal(live.phase, 'playing');
  assert.equal(live.previousScore.score, 10);
  assert.equal(live.previousScore.secret, undefined);
});

test('instantSummary célèbre un petit gain de PP', () => {
  const current = { completion: 'finished', accuracy: 98, misses: 1, combo: 100, maxCombo: 200, score: 1000, pp: 10.1, timing: { average: 0 } };
  assert.match(instantSummary(current, { accuracy: 98, misses: 1, score: 1000, pp: 10 }, 0), /\+0\.1pp|fête/);
});

test('selectedMapSummary varie les découvertes et retire l’ancienne blague', () => {
  const first = selectedMapSummary({ beatmapId: 9, timestamp: '2026-07-21T12:00:00Z', totalAttempts: 0 }, 'training_companion');
  const second = selectedMapSummary({ beatmapId: 10, timestamp: '2026-07-21T12:00:01Z', totalAttempts: 0 }, 'training_companion');
  assert.notEqual(first, second);
  assert.doesNotMatch(`${first} ${second}`, /barre de vie|jamais jouée|première rencontre/i);
});
