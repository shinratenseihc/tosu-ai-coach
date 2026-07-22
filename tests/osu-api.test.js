const test = require('node:test');
const assert = require('node:assert/strict');
const { clearTokenCache, createClient, normalizeScore, normalizeBeatmapPlaycount } = require('../osu-api');

test('normalizeScore accepte le format de score osu! v2 moderne', () => {
  const score = normalizeScore({ total_score: 1234567, accuracy: 0.9876, max_combo: 500, pp: 123.4, rank: 'A', mods: [{ acronym: 'HD' }], statistics: { miss: 2 } });
  assert.deepEqual(score, { score: 1234567, accuracy: 98.76, combo: 500, misses: 2, pp: 123.4, rank: 'A', mods: 'HD', endedAt: null });
});

test('normalizeBeatmapPlaycount lit le compteur officiel osu!', () => {
  assert.deepEqual(normalizeBeatmapPlaycount({ beatmap_id: 42, count: 17 }), { beatmapId: 42, count: 17 });
});

test('createClient lie les identifiants aux méthodes osu!', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  clearTokenCache();
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/oauth/token')) return { ok: true, json: async () => ({ access_token: 'token-test', expires_in: 3600 }) };
    return { ok: true, status: 200, json: async () => ({ id: 7, username: 'Joueur', statistics: {} }) };
  };
  try {
    const client = createClient({ clientId: '123', clientSecret: 'secret-test' });
    const user = await client.fetchUser('Joueur');
    assert.equal(user.id, 7);
    assert.match(calls[0].options.body, /"client_id":"123"/);
    assert.match(calls[0].options.body, /"client_secret":"secret-test"/);
    assert.match(calls[1].url, /users\/@Joueur\/osu/);
  } finally {
    global.fetch = originalFetch;
    clearTokenCache();
  }
});
