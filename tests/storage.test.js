const test = require('node:test');
const assert = require('node:assert/strict');
const { createStorage } = require('../lib/storage.js');

test('le stockage calcule des chemins isolables', () => {
  const storage = createStorage({ rootDir: 'C:\\app', defaultConfig: {}, env: { TOSU_COACH_DATA_DIR: 'C:\\data' } });
  assert.equal(storage.paths.config, 'C:\\data\\config.json');
  assert.equal(storage.paths.profileHistory, 'C:\\data\\profile-history.json');
});

test('la configuration retombe sur les valeurs par défaut si elle est illisible', () => {
  const storage = createStorage({
    rootDir: 'C:\\app',
    defaultConfig: { provider: 'auto' },
    env: { TOSU_COACH_DATA_DIR: 'C:\\data' },
    fsImpl: { statSync: () => { throw new Error('absent'); } },
  });
  assert.deepEqual(storage.config(), { provider: 'auto' });
});
