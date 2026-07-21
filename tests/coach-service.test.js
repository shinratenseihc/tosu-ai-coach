const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const testDataDir = path.join(os.tmpdir(), `tosu-ai-coach-tests-${process.pid}`);
process.env.TOSU_COACH_DATA_DIR = testDataDir;
const { timingStats, recordFingerprint, offsetAdvice, instantSummary, retryStreak, fatigueAdvice, sessionTransition, sessionSummary, previousMapResult, bestMapResult, makeLiveRecord, mapStartSummary, removeUnscheduledBreakAdvice, sessionMemory, splitSessions, summarizeSession, progressByDay, personalityInstruction, warmupRecommendations, displayDeadline, coachingKnowledge, pickRank, promptFor, profileProgressSummary, restoreLastReport } = require('../coach-service');

test('le service conserve sa routine de restauration au démarrage', () => {
  assert.equal(typeof restoreLastReport, 'function');
});

test.after(() => {
  if (path.dirname(testDataDir) === os.tmpdir() && path.basename(testDataDir).startsWith('tosu-ai-coach-tests-')) {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  }
});

function completed(overrides = {}) {
  return {
    beatmapId: 1, score: 1000, accuracy: 95, combo: 100, misses: 1,
    completion: 'finished', hit50: 0, hit100: 10, hit300: 190,
    timing: { average: -10, unstableRate: 100 }, ...overrides,
  };
}

test('timingStats ignore les valeurs aberrantes', () => {
  assert.deepEqual(timingStats([-10, 10, 500]), { average: 0, unstableRate: 100, earlyPercent: 50, latePercent: 50 });
});

test('recordFingerprint distingue un abandon d’un résultat terminé', () => {
  assert.notEqual(recordFingerprint(completed()), recordFingerprint(completed({ completion: 'abandoned' })));
});

test('offsetAdvice exige assez de parties et de beatmaps', () => {
  assert.equal(offsetAdvice([completed(), completed({ beatmapId: 2 })]), null);
});

test('offsetAdvice conseille un offset universel positif pour des frappes early', () => {
  const records = [1, 2, 3, 4, 5].map((beatmapId, index) => completed({ beatmapId, score: 1000 + index, timing: { average: -12 + index % 2, unstableRate: 100 } }));
  const advice = offsetAdvice(records);
  assert.equal(advice.changeMs, 12);
  assert.equal(advice.type, 'universal');
});

test('offsetAdvice ignore les doublons exacts', () => {
  const record = completed();
  assert.equal(offsetAdvice([record, record, record, record, record]), null);
});

test('instantSummary transforme un abandon en apprentissage', () => {
  const text = instantSummary(completed({ completion: 'abandoned', progressPercent: 42 }), null);
  assert.match(text, /42%/);
  assert.match(text, /données|revanche/);
});

test('retryStreak compte les abandons consécutifs de la même map', () => {
  const records = [completed({ beatmapId: 3, completion: 'abandoned' }), completed({ beatmapId: 7, completion: 'abandoned' }), completed({ beatmapId: 7, completion: 'failed' })];
  assert.equal(retryStreak(records, 7), 2);
});

test('fatigueAdvice signale une baisse nette, pas une variation minime', () => {
  const records = [completed({ timestamp: '2026-07-20T10:00:00Z', accuracy: 97, timing: { average: 0, unstableRate: 100 } }), completed({ timestamp: '2026-07-20T10:15:00Z', accuracy: 96, timing: { average: 0, unstableRate: 115 } }), completed({ timestamp: '2026-07-20T10:31:00Z', accuracy: 94, timing: { average: 0, unstableRate: 135 } })];
  assert.ok(fatigueAdvice(records));
  assert.equal(fatigueAdvice([completed(), completed(), completed()]), null);
});

test('fatigueAdvice ne transforme pas une hausse d’UR seule en alerte', () => {
  const records = [
    completed({ timestamp: '2026-07-20T10:00:00Z', accuracy: 97, timing: { average: 0, unstableRate: 80 } }),
    completed({ timestamp: '2026-07-20T10:31:00Z', accuracy: 97, timing: { average: 0, unstableRate: 180 } }),
  ];
  assert.equal(fatigueAdvice(records), null);
});

test('fatigueAdvice bloque les conseils rapprochés pendant le cooldown', () => {
  const records = [
    completed({ timestamp: '2026-07-20T10:00:00Z', accuracy: 98, fatigueAdvice: { reason: 'performance_drop' } }),
    completed({ timestamp: '2026-07-20T10:15:00Z', accuracy: 96 }),
    completed({ timestamp: '2026-07-20T10:25:00Z', accuracy: 93 }),
  ];
  assert.equal(fatigueAdvice(records), null);
});

test('fatigueAdvice suggère une pause après quinze minutes et six échecs', () => {
  const records = [0, 3, 6, 9, 12, 16].map(minutes => completed({ timestamp: `2026-07-20T10:${String(minutes).padStart(2, '0')}:00Z`, completion: 'failed' }));
  assert.equal(fatigueAdvice(records).reason, 'failure_streak');
});

test('offsetAdvice demande un check après trois maps distinctes early', () => {
  const records = [1, 2, 3].map((beatmapId, index) => completed({ beatmapId, score: 2000 + index, timing: { average: -11 - index, unstableRate: 110 } }));
  const advice = offsetAdvice(records);
  assert.equal(advice.type, 'check');
  assert.equal(advice.direction, 'early');
});

test('sessionTransition détecte une reprise après 90 minutes', () => {
  const records = [
    completed({ timestamp: '2026-07-20T08:00:00.000Z' }),
    completed({ timestamp: '2026-07-20T08:30:00.000Z' }),
  ];
  assert.equal(sessionTransition(records, new Date('2026-07-20T09:59:59.000Z'), 90), null);
  const transition = sessionTransition(records, new Date('2026-07-20T10:00:00.000Z'), 90);
  assert.equal(transition.session.length, 2);
  assert.equal(transition.newDay, false);
});

test('sessionSummary résume la session précédente et choisit une priorité', () => {
  const records = [
    completed({ timestamp: '2026-07-19T18:00:00.000Z', accuracy: 94, misses: 7 }),
    completed({ timestamp: '2026-07-19T18:20:00.000Z', accuracy: 96, misses: 5 }),
  ];
  const recap = sessionSummary(records, new Date('2026-07-20T08:00:00.000Z'), 90);
  assert.equal(recap.newDay, true);
  assert.match(recap.report, /Nouvelle journée/);
  assert.match(recap.report, /95\.00% moy\./);
  assert.match(recap.focus, /régularité|aim/);
});

test('previousMapResult retrouve le dernier score terminé de la même difficulté', () => {
  const records = [
    completed({ beatmapId: 4, accuracy: 93 }),
    completed({ beatmapId: 4, accuracy: 94, completion: 'abandoned' }),
    completed({ beatmapId: 9, accuracy: 98 }),
    completed({ beatmapId: 4, accuracy: 96 }),
  ];
  assert.equal(previousMapResult(records, 4).accuracy, 96);
  assert.equal(previousMapResult(records, 7), null);
});

test('bestMapResult retient le score le plus élevé de la difficulté', () => {
  const records = [completed({ beatmapId: 4, score: 3000, accuracy: 94 }), completed({ beatmapId: 4, score: 9000, accuracy: 96 }), completed({ beatmapId: 4, score: 5000, accuracy: 98 })];
  assert.equal(bestMapResult(records, 4).score, 9000);
});

test('mapStartSummary affiche la référence précédente', () => {
  const data = { beatmap: { id: 4, artist: 'Test', title: 'Map', version: 'Insane', stats: { stars: { total: 4.2 }, bpm: { common: 180 }, maxCombo: 500 } }, play: {} };
  const live = makeLiveRecord(data, completed({ beatmapId: 4, accuracy: 96.5, misses: 2, combo: 450, maxCombo: 500 }));
  assert.equal(live.phase, 'playing');
  assert.match(mapStartSummary(live), /96\.50%/);
  assert.match(mapStartSummary(live), /2 miss/);
  assert.match(mapStartSummary(live, { comfortableStars: 3.5 }), /Défi/);
  assert.match(mapStartSummary(live, { comfortableStarsMin: 4.0, comfortableStarsMax: 4.5 }), /zone confort/);
});

test('removeUnscheduledBreakAdvice bloque les pauses non déclenchées', () => {
  const filtered = removeUnscheduledBreakAdvice('Ton aim progresse. Bois un peu et repose tes poignets. Travaille les bursts à 180 BPM.');
  assert.equal(filtered, 'Ton aim progresse. Travaille les bursts à 180 BPM.');
});

test('splitSessions sépare les reprises éloignées', () => {
  const records = [
    completed({ timestamp: '2026-07-20T10:00:00Z' }),
    completed({ timestamp: '2026-07-20T10:30:00Z' }),
    completed({ timestamp: '2026-07-20T12:01:00Z' }),
  ];
  assert.deepEqual(splitSessions(records, 90).map(session => session.length), [2, 1]);
});

test('summarizeSession calcule un bilan compact', () => {
  const summary = summarizeSession([
    completed({ timestamp: '2026-07-20T10:00:00Z', beatmapId: 1, accuracy: 94, misses: 4 }),
    completed({ timestamp: '2026-07-20T10:20:00Z', beatmapId: 2, accuracy: 96, misses: 2 }),
  ]);
  assert.equal(summary.runs, 2);
  assert.equal(summary.uniqueMaps, 2);
  assert.equal(summary.averageAccuracy, 95);
});

test('progressByDay produit les jours vides et les moyennes', () => {
  const data = progressByDay([completed({ timestamp: '2026-07-20T10:00:00Z', accuracy: 96 })], 2, new Date('2026-07-20T20:00:00Z'));
  assert.equal(data.length, 2);
  assert.equal(data.at(-1).accuracy, 96);
});

test('les personnalités produisent des consignes distinctes', () => {
  assert.match(personalityInstruction('analyst'), /factuel|données/);
  assert.notEqual(personalityInstruction('analyst'), personalityInstruction('sarcastic'));
  assert.match(personalityInstruction('training_companion'), /plaisir|fun|pote/);
});

test('le prompt de coaching ne transmet pas l’UR au modèle', () => {
  const prompt = promptFor(completed({ timing: { average: -4, unstableRate: 170 } }), []);
  assert.doesNotMatch(prompt, /unstableRate|170/);
  assert.match(prompt, /Ne parle jamais d.UR/);
});

test('les petits gains de PP et de classement sont célébrés', () => {
  assert.match(instantSummary(completed({ pp: 101 }), completed({ pp: 100 })), /1\.0pp|fête/);
  assert.match(profileProgressSummary({ ppGain: 1, globalRankGain: 3, countryRankGain: 0 }), /1\.0pp.*3 places/);
});

test('warmupRecommendations propose trois maps uniques dans la zone confort', () => {
  const records = [4.5, 4.8, 5.15, 5.8].map((stars, index) => completed({ beatmapId: index + 1, setId: 100 + index, stars, score: 1000 + index, artist: 'A', title: `Map ${index}`, difficulty: 'Insane', bpm: 180 }));
  const maps = warmupRecommendations(records, { comfortableStarsMin: 4.5, comfortableStarsMax: 5.2 });
  assert.equal(maps.length, 3);
  assert.ok(maps.every(map => map.stars >= 4.5 && map.stars <= 5.2));
});

test('displayDeadline utilise une durée temporisée', () => {
  const before = Date.now() + 19000;
  const deadline = displayDeadline(20);
  assert.ok(deadline >= before && deadline <= Date.now() + 21000);
});

test('la base de connaissances garde l’UR comme statistique secondaire', () => {
  assert.match(coachingKnowledge(), /UR.*secondaire/);
  assert.match(coachingKnowledge(), /early\/late/);
});

test('pickRank utilise le rank pays quand une région est renseignée', () => {
  const profile = { globalRank: 150000, countryRank: 1109 };
  assert.equal(pickRank(profile, 'Suisse'), 1109);
  assert.equal(pickRank(profile, ''), 150000);
  assert.equal(pickRank(profile, '   '), 150000);
});

test('pickRank retombe sur le rank global ou null sans données', () => {
  assert.equal(pickRank({ globalRank: 42, countryRank: null }, 'Suisse'), 42);
  assert.equal(pickRank({ globalRank: null, countryRank: null }, ''), null);
  assert.equal(pickRank(null, 'Suisse'), null);
});
