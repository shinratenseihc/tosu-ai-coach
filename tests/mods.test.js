const test = require('node:test');
const assert = require('node:assert/strict');
const { modsSignature, normalizeMods, selectionSignature } = require('../lib/mods.js');

test('normalizeMods accepte les formats name, array et lazer', () => {
  assert.equal(normalizeMods({ name: 'HDHR' }), 'HDHR');
  assert.equal(normalizeMods({ array: [{ acronym: 'DT' }] }), 'DT');
  assert.equal(normalizeMods([{ acronym: 'EZ' }]), 'EZ');
});

test('la signature change avec les mods et leur vitesse', () => {
  const base = { beatmap: { id: 7 }, play: { mods: { name: 'DT', array: [{ acronym: 'DT', settings: { speed_change: 1.5 } }], rate: 1.5 } } };
  const custom = { beatmap: { id: 7 }, play: { mods: { name: 'DT', array: [{ acronym: 'DT', settings: { speed_change: 1.2 } }], rate: 1.2 } } };
  assert.notEqual(selectionSignature(base), selectionSignature(custom));
  assert.match(modsSignature(base.play.mods), /DT/);
});
