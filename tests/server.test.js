const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { publicConfig, readRequestJson } = require('../lib/server.js');

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
