const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyTosuState, createGameMonitor } = require('../lib/game-monitor.js');

test('classifyTosuState distingue jeu et résultats', () => {
  assert.deepEqual(classifyTosuState({ state: { name: 'play' }, beatmap: { id: 42 } }), { isResults: false, isPlaying: true });
  assert.deepEqual(classifyTosuState({ state: { name: 'resultScreen' }, resultsScreen: {} }), { isResults: true, isPlaying: false });
});

test('un ancien résultat est ignoré jusqu’au lancement d’une map', () => {
  const events = [];
  const monitor = createGameMonitor({
    platform: 'linux',
    getTosuUrl: () => '',
    onOnline: () => events.push('online'),
    onMapStart: () => events.push('start'),
    onResult: (_data, completion) => events.push(completion),
  });
  monitor.processTosuData({ state: { name: 'resultScreen' }, resultsScreen: { playerName: 'x', score: 10 } });
  monitor.processTosuData({ state: { name: 'play' }, beatmap: { id: 42 } });
  monitor.processTosuData({ state: { name: 'resultScreen' }, resultsScreen: { playerName: 'x', score: 20 } });
  assert.deepEqual(events, ['online', 'start', 'finished']);
});

test('quitter une map déclenche un abandon sans résultat', () => {
  const events = [];
  const monitor = createGameMonitor({ platform: 'linux', getTosuUrl: () => '', onMapStart: () => events.push('start'), onResult: () => events.push('result'), onAbandon: () => events.push('abandon') });
  monitor.processTosuData({ state: { name: 'play' }, beatmap: { id: 9 } });
  monitor.processTosuData({ state: { name: 'menu' }, beatmap: { id: 9 } });
  assert.deepEqual(events, ['start', 'abandon']);
});
