const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyTosuState, createGameMonitor } = require('../lib/game-monitor.js');

test('classifyTosuState distingue jeu et résultats', () => {
  assert.deepEqual(classifyTosuState({ state: { name: 'play' }, beatmap: { id: 42 } }), { isResults: false, isPlaying: true, isSelected: false });
  assert.deepEqual(classifyTosuState({ state: { name: 'resultScreen' }, resultsScreen: {} }), { isResults: true, isPlaying: false, isSelected: false });
  assert.deepEqual(classifyTosuState({ state: { name: 'selectPlay' }, beatmap: { id: 42 } }), { isResults: false, isPlaying: false, isSelected: true });
});

test('une map sélectionnée est signalée une seule fois jusqu’au lancement', () => {
  const events = [];
  const monitor = createGameMonitor({ platform: 'linux', getTosuUrl: () => '', onMapSelected: data => events.push(`selected:${data.beatmap.id}`), onMapStart: () => events.push('start') });
  monitor.processTosuData({ state: { name: 'selectPlay' }, beatmap: { id: 7 } });
  monitor.processTosuData({ state: { name: 'selectPlay' }, beatmap: { id: 7 } });
  monitor.processTosuData({ state: { name: 'selectPlay' }, beatmap: { id: 8 } });
  monitor.processTosuData({ state: { name: 'play' }, beatmap: { id: 8 } });
  monitor.processTosuData({ state: { name: 'selectPlay' }, beatmap: { id: 8 } });
  assert.deepEqual(events, ['selected:7', 'selected:8', 'start', 'selected:8']);
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
