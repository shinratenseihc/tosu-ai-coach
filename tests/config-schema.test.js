const test = require('node:test');
const assert = require('node:assert/strict');
const { validateConfig } = require('../lib/config-schema.js');

const current = () => ({ overlay_accent_color: '#112233', osu_client_secret: 'secret', osu_client_id: '123', display_seconds: 20 });

test('validateConfig borne display_seconds entre 5 et 120', () => {
  assert.equal(validateConfig({ display_seconds: 1 }, current()).display_seconds, 5);
  assert.equal(validateConfig({ display_seconds: 999 }, current()).display_seconds, 120);
});

test('validateConfig conserve la couleur précédente si le hex est invalide', () => {
  assert.equal(validateConfig({ overlay_accent_color: 'rouge' }, current()).overlay_accent_color, '#112233');
});

test('validateConfig conserve un secret vide et efface un secret null', () => {
  assert.equal(validateConfig({ osu_client_secret: '' }, current()).osu_client_secret, 'secret');
  assert.equal(validateConfig({ osu_client_secret: null }, current()).osu_client_secret, '');
});

test('validateConfig remet les bornes d’étoiles dans l’ordre', () => {
  const result = validateConfig({ comfortable_stars_min: 6, comfortable_stars_max: 4 }, current());
  assert.deepEqual([result.comfortable_stars_min, result.comfortable_stars_max], [4, 6]);
});

test('validateConfig rejette un client_id non numérique', () => {
  assert.equal(validateConfig({ osu_client_id: '12abc' }, current()).osu_client_id, '123');
});
