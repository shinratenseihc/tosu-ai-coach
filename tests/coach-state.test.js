const test = require('node:test');
const assert = require('node:assert/strict');
const { createCoachState } = require('../lib/coach-state.js');

function makeState(onChange = () => {}) {
  return createCoachState({ initial: { status: 'idle', record: null, updatedAt: 0 }, onChange });
}

test('set effectue une transition franche', () => {
  const state = makeState();
  state.set({ status: 'playing', record: { beatmapId: 7 } });
  assert.equal(state.get().status, 'playing');
  assert.equal(state.get().record.beatmapId, 7);
});

test('applyIfCurrent applique le patch sur l’état courant', () => {
  const state = makeState();
  state.set({ status: 'selected', record: { beatmapId: 7 } });
  assert.equal(state.applyIfCurrent({ status: 'selected', beatmapId: 7 }, { report: 'Prêt' }), true);
  assert.equal(state.get().report, 'Prêt');
});

test('applyIfCurrent rejette un statut devenu obsolète', () => {
  const state = makeState();
  state.set({ status: 'playing', record: { beatmapId: 7 } });
  assert.equal(state.applyIfCurrent({ status: 'selected', beatmapId: 7 }, { report: 'Obsolète' }), false);
  assert.equal(state.get().report, undefined);
});

test('applyIfCurrent rejette une beatmap devenue obsolète', () => {
  const state = makeState();
  state.set({ status: 'selected', record: { beatmapId: 8 } });
  assert.equal(state.applyIfCurrent({ status: 'selected', beatmapId: 7 }, { report: 'Obsolète' }), false);
  assert.equal(state.get().report, undefined);
});

test('chaque écriture augmente updatedAt et appelle onChange', () => {
  const changes = [];
  const state = makeState(snapshot => changes.push(snapshot));
  const first = state.set({ status: 'selected', record: { beatmapId: 7 } });
  const second = state.applyIfCurrent({ beatmapId: 7 }, { report: 'Deuxième écriture' });
  assert.equal(second, true);
  assert.ok(state.get().updatedAt > first.updatedAt);
  assert.equal(changes.length, 2);
  assert.equal(changes.at(-1).report, 'Deuxième écriture');
});
