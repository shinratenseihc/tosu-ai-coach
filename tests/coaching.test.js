const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPrompt, coachingKnowledge, personalityInstruction, removeUnscheduledBreakAdvice } = require('../lib/coaching.js');

test('les personnalités restent distinctes et le compagnon privilégie le fun', () => {
  assert.match(personalityInstruction('analyst'), /factuel|données/);
  assert.match(personalityInstruction('training_companion'), /plaisir|fun|pote/);
  assert.notEqual(personalityInstruction('analyst'), personalityInstruction('sarcastic'));
});

test('le prompt ne transmet pas l’UR au fournisseur IA', () => {
  const prompt = buildPrompt({
    record: { accuracy: 98, timing: { average: -4, earlyPercent: 55, latePercent: 45, unstableRate: 170 }, fatigueAdvice: null },
    recent: [{ timing: { average: 2, earlyPercent: 40, latePercent: 60, unstableRate: 155 } }],
    config: { coach_name: 'Coach', personality: 'training_companion', max_report_chars: 1000 },
    language: 'fr',
    languageLabel: 'français',
    profile: {},
    memory: { runs: 2, tracks: [] },
  });

  assert.doesNotMatch(prompt, /unstableRate|170|155/);
  assert.match(prompt, /maximum 1000 caractères/);
  assert.match(prompt, /Compagnon d’entraînement/);
});

test('le filtre retire uniquement les phrases de pause non autorisées', () => {
  assert.equal(
    removeUnscheduledBreakAdvice('Ton aim progresse. Bois un peu et repose tes poignets. Travaille les bursts.'),
    'Ton aim progresse. Travaille les bursts.',
  );
});

test('la connaissance garde l’UR comme statistique secondaire', () => {
  assert.match(coachingKnowledge(), /statistique avancée secondaire/);
});
