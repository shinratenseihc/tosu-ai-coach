function recordFingerprint(record) {
  return `${record.beatmapId}|${record.score}|${record.accuracy}|${record.combo}|${record.misses}|${record.completion || 'finished'}`;
}

function timingStats(values) {
  const clean = (values || []).filter(value => Number.isFinite(value) && Math.abs(value) < 250);
  if (!clean.length) return { average: 0, unstableRate: 0, earlyPercent: 0, latePercent: 0 };
  const average = clean.reduce((sum, value) => sum + value, 0) / clean.length;
  const variance = clean.reduce((sum, value) => sum + Math.pow(value - average, 2), 0) / clean.length;
  return { average: Math.round(average * 10) / 10, unstableRate: Math.round(Math.sqrt(variance) * 100) / 10, earlyPercent: Math.round(clean.filter(value => value < 0).length / clean.length * 100), latePercent: Math.round(clean.filter(value => value > 0).length / clean.length * 100) };
}

function offsetAdvice(records) {
  const unique = [];
  const seen = new Set();
  for (const record of records) {
    const key = recordFingerprint(record);
    if (!seen.has(key)) { seen.add(key); unique.push(record); }
  }
  const eligible = unique.filter(record => record.completion === 'finished' && Number.isFinite(record.timing?.average) && Number(record.hit50) + Number(record.hit100) + Number(record.hit300) >= 100).slice(-12);
  const maps = new Set(eligible.map(record => record.beatmapId));
  if (eligible.length < 3 || maps.size < 3) return null;
  const early = eligible.filter(record => record.timing.average < 0).length;
  const late = eligible.filter(record => record.timing.average > 0).length;
  const sorted = eligible.map(record => record.timing.average).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (eligible.length >= 5 && Math.max(early, late) / eligible.length >= 0.8 && Math.abs(median) >= 8) {
    const changeMs = Math.max(-20, Math.min(20, Math.round(-median)));
    return { type: 'universal', changeMs, sampleSize: eligible.length, mapCount: maps.size, medianHitError: Math.round(median * 10) / 10, instruction: `${changeMs > 0 ? 'augmente' : 'diminue'} ton offset universel de ${Math.abs(changeMs)} ms` };
  }
  const consecutive = eligible.slice(-3);
  const allEarly = consecutive.every(record => record.timing.average <= -8);
  const allLate = consecutive.every(record => record.timing.average >= 8);
  if (consecutive.length === 3 && new Set(consecutive.map(record => record.beatmapId)).size === 3 && (allEarly || allLate)) {
    const recentMedian = consecutive.map(record => record.timing.average).sort((a, b) => a - b)[1];
    return { type: 'check', direction: allEarly ? 'early' : 'late', sampleSize: 3, mapCount: 3, medianHitError: Math.round(recentMedian * 10) / 10, instruction: `vérifie ton offset universel : tes 3 dernières maps montrent un biais ${allEarly ? 'early' : 'late'}, sans le modifier automatiquement pour l’instant` };
  }
  return null;
}

function retryStreak(records, beatmapId) {
  let streak = 0;
  for (const record of [...records].reverse()) {
    if (record.beatmapId !== beatmapId || record.completion === 'finished') break;
    streak++;
  }
  return streak;
}

function currentSessionMinutes(records, gapMinutes = 90) {
  const timed = records.map(record => new Date(record.timestamp).getTime()).filter(Number.isFinite).sort((a, b) => a - b);
  if (timed.length < 2) return 0;
  const gapMs = Math.max(1, Number(gapMinutes) || 90) * 60000;
  let first = timed.length - 1;
  while (first > 0 && timed[first] - timed[first - 1] < gapMs) first--;
  return Math.max(0, Math.round((timed.at(-1) - timed[first]) / 60000));
}

function fatigueAdvice(records, options = {}) {
  if (options.personality === 'training_companion') return null;
  const sessionMinutes = currentSessionMinutes(records, options.session_gap_minutes);
  const minimumSessionMinutes = Math.max(60, Number(options.fatigue_min_session_minutes) || 60);
  if (sessionMinutes < minimumSessionMinutes) return null;
  const cooldownMs = (Number(options.pause_cooldown_minutes) || 60) * 60000;
  const recordTimes = records.map(record => new Date(record.timestamp).getTime()).filter(Number.isFinite);
  const latestTime = recordTimes.length ? Math.max(...recordTimes) : Date.now();
  if (records.some(record => record.fatigueAdvice && Number.isFinite(new Date(record.timestamp).getTime()) && latestTime - new Date(record.timestamp).getTime() < cooldownMs)) return null;
  const failures = [];
  for (const record of [...records].reverse()) {
    if (record.completion === 'finished') break;
    if (record.completion === 'failed' || record.completion === 'abandoned') failures.unshift(record);
  }
  const failureTimes = failures.map(record => new Date(record.timestamp).getTime()).filter(Number.isFinite);
  const failureAttempts = Number(options.failure_pause_attempts) || 6;
  const failureWindowMs = (Number(options.failure_pause_minutes) || 15) * 60000;
  if (failures.length >= failureAttempts && failureTimes.length >= 2 && failureTimes.at(-1) - failureTimes[0] >= failureWindowMs) return { reason: 'failure_streak', attempts: failures.length, minutes: Math.round((failureTimes.at(-1) - failureTimes[0]) / 60000) };
  const recent = records.filter(record => record.completion === 'finished').slice(-3);
  if (recent.length < 3) return null;
  const times = recent.map(record => new Date(record.timestamp).getTime()).filter(Number.isFinite);
  if (times.length < 2 || times.at(-1) - times[0] < (Number(options.performance_pause_minutes) || 30) * 60000) return null;
  const accuracyDrop = Number(recent[0].accuracy) - Number(recent.at(-1).accuracy);
  return accuracyDrop >= 2 ? { reason: 'performance_drop', accuracyDrop: Math.round(accuracyDrop * 100) / 100 } : null;
}

function previousMapResult(records, beatmapId) {
  return [...records].reverse().find(record => record.beatmapId === beatmapId && record.completion === 'finished') || null;
}

function bestMapResult(records, beatmapId) {
  return records.filter(record => record.beatmapId === beatmapId && record.completion === 'finished').reduce((best, record) => !best || Number(record.score) > Number(best.score) || (Number(record.score) === Number(best.score) && Number(record.accuracy) > Number(best.accuracy)) ? record : best, null);
}

module.exports = { bestMapResult, currentSessionMinutes, fatigueAdvice, offsetAdvice, previousMapResult, recordFingerprint, retryStreak, timingStats };
