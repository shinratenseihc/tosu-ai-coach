const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeScore, normalizeBeatmapPlaycount } = require('../osu-api');

test('normalizeScore accepte le format de score osu! v2 moderne', () => {
  const score = normalizeScore({ total_score: 1234567, accuracy: 0.9876, max_combo: 500, pp: 123.4, rank: 'A', mods: [{ acronym: 'HD' }], statistics: { miss: 2 } });
  assert.deepEqual(score, { score: 1234567, accuracy: 98.76, combo: 500, misses: 2, pp: 123.4, rank: 'A', mods: 'HD', endedAt: null });
});

test('normalizeBeatmapPlaycount lit le compteur officiel osu!', () => {
  assert.deepEqual(normalizeBeatmapPlaycount({ beatmap_id: 42, count: 17 }), { beatmapId: 42, count: 17 });
});
