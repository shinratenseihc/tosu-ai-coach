const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createCoachServer, publicConfig, readRequestJson } = require('../lib/server.js');

async function withServer(run) {
  let state = { status: 'idle', updatedAt: 0 };
  const server = createCoachServer({
    dashboardDir: __dirname,
    getConfig: () => ({ coach_port: 24051, coach_name: 'Coach', osu_client_secret: 'secret' }),
    updateConfig: input => ({ ...input, osu_client_secret: 'secret' }),
    syncOsuProfile: async () => ({}),
    getSessions: () => [], getProgress: () => [], getWarmup: () => [],
    getState: () => state, setState: next => { state = next; }, getGameStatus: () => 'online',
    resolveLanguage: () => 'fr', getHistory: () => [], instantSummary: () => '',
    analyzeCurrent: () => {}, dashboardHeartbeat: () => {},
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try { await run(url); } finally { await new Promise(resolve => server.close(resolve)); }
}

test('publicConfig ne renvoie jamais le secret osu!', () => {
  const result = publicConfig({ coach_name: 'Coach', osu_client_secret: 'ultra-secret' });
  assert.equal(result.coach_name, 'Coach');
  assert.equal(result.osu_client_secret, '');
  assert.equal(result.osu_client_secret_set, true);
  assert.doesNotMatch(JSON.stringify(result), /ultra-secret/);
});

test('readRequestJson accepte un petit objet JSON', async () => {
  const req = new EventEmitter();
  const promise = readRequestJson(req);
  req.emit('data', Buffer.from('{"ok":true}'));
  req.emit('end');
  assert.deepEqual(await promise, { ok: true });
});

test('readRequestJson refuse une requête trop volumineuse', async () => {
  const req = new EventEmitter();
  const promise = readRequestJson(req, 4);
  req.emit('data', Buffer.from('12345'));
  await assert.rejects(promise, /trop volumineuse/);
});

test('GET /state reste lisible depuis une origine externe', async () => {
  await withServer(async url => {
    const response = await fetch(`${url}/state`, { headers: { Origin: 'https://example.test' } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
  });
});

test('POST /api/config rejette une origine externe', async () => {
  await withServer(async url => {
    const response = await fetch(`${url}/api/config`, { method: 'POST', headers: { Origin: 'https://example.test', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 403);
  });
});

test('POST /api/config accepte une origine locale ou absente', async () => {
  await withServer(async url => {
    const local = await fetch(`${url}/api/config`, { method: 'POST', headers: { Origin: url, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(local.status, 200);
    const withoutOrigin = await fetch(`${url}/api/config`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(withoutOrigin.status, 200);
  });
});
