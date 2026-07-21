const test = require('node:test');
const assert = require('node:assert/strict');
const { progressByDay, sessionMemory, splitSessions } = require('../lib/sessions.js');

test('sessionMemory regroupe les tentatives récentes par beatmap', () => {
  const records = [
    { timestamp: '2026-07-20T10:00:00Z', beatmapId: 7, artist: 'A', title: 'T', difficulty: 'D', completion: 'failed' },
    { timestamp: '2026-07-20T10:05:00Z', beatmapId: 7, artist: 'A', title: 'T', difficulty: 'D', completion: 'finished', accuracy: 98, misses: 1 },
  ];
  assert.deepEqual(sessionMemory(records, 90), { runs: 2, tracks: [{ beatmapId: 7, map: 'A - T [D]', attempts: 2, bestAccuracy: 98, bestMisses: 1 }] });
});

test('splitSessions sépare les journées même avec un petit intervalle', () => {
  const records = [{ timestamp: '2026-07-20T23:59:00' }, { timestamp: '2026-07-21T00:01:00' }];
  assert.deepEqual(splitSessions(records, 90).map(group => group.length), [1, 1]);
});

test('progressByDay conserve les jours sans partie', () => {
  const result = progressByDay([{ timestamp: '2026-07-21T10:00:00', completion: 'finished', accuracy: 97 }], 2, new Date('2026-07-21T20:00:00'));
  assert.equal(result.length, 2);
  assert.equal(result[0].runs, 0);
  assert.equal(result[1].accuracy, 97);
});
