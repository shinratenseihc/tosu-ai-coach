const test = require('node:test');
const assert = require('node:assert/strict');
const { compactAnswer, createAiProviders, findExecutable } = require('../lib/ai-providers.js');

test('compactAnswer normalise et limite la réponse', () => {
  assert.equal(compactAnswer('  Salut\n  joueur  ', 1000), 'Salut joueur');
  assert.equal(compactAnswer('un message vraiment trop long', 15), 'un message…');
  assert.throws(() => compactAnswer('   '), /réponse vide/);
});

test('findExecutable préfère un chemin explicite puis utilise where.exe', () => {
  const explicit = findExecutable('claude', ['C:\\tools\\claude.exe'], {
    fsImpl: { existsSync: candidate => candidate === 'C:\\tools\\claude.exe' },
    spawnSyncImpl: () => { throw new Error('where.exe ne doit pas être appelé'); },
  });
  assert.equal(explicit, 'C:\\tools\\claude.exe');

  const discovered = findExecutable('codex', [], {
    fsImpl: { existsSync: () => false },
    spawnSyncImpl: () => ({ status: 0, stdout: 'C:\\npm\\codex.cmd\r\n' }),
  });
  assert.equal(discovered, 'C:\\npm\\codex.cmd');
});

test('le mode auto bascule sur Codex si Claude échoue', async () => {
  const calls = [];
  const logs = [];
  const providers = createAiProviders({
    rootDir: 'C:\\test',
    getConfig: () => ({ provider: 'auto', claude_first: true, max_report_chars: 1000 }),
    log: message => logs.push(message),
    env: {},
    fsImpl: { existsSync: () => false },
    spawnSyncImpl: () => ({ status: 1, stdout: '' }),
    runners: {
      Claude: async () => { calls.push('Claude'); throw new Error('quota'); },
      Codex: async () => { calls.push('Codex'); return 'OK'; },
    },
  });

  assert.deepEqual(await providers.runAi('test'), { provider: 'Codex', text: 'OK' });
  assert.deepEqual(calls, ['Claude', 'Codex']);
  assert.match(logs[0], /Claude indisponible: quota/);
});

test('un fournisseur imposé ne déclenche aucun fallback', async () => {
  const calls = [];
  const providers = createAiProviders({
    rootDir: 'C:\\test',
    getConfig: () => ({ provider: 'codex', max_report_chars: 1000 }),
    env: {},
    fsImpl: { existsSync: () => false },
    spawnSyncImpl: () => ({ status: 1, stdout: '' }),
    runners: {
      Claude: async () => { calls.push('Claude'); return 'Claude'; },
      Codex: async () => { calls.push('Codex'); return 'Codex'; },
    },
  });

  assert.deepEqual(await providers.runAi('test'), { provider: 'Codex', text: 'Codex' });
  assert.deepEqual(calls, ['Codex']);
});
