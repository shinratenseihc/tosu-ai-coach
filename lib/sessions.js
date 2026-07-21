function localDateKey(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function sessionTransition(records, now = new Date(), gapMinutes = 90) {
  const valid = records.filter(record => Number.isFinite(new Date(record.timestamp).getTime()));
  if (!valid.length) return null;
  const latest = valid.at(-1);
  const nowDate = new Date(now);
  const gapMs = nowDate.getTime() - new Date(latest.timestamp).getTime();
  const newDay = localDateKey(latest.timestamp) !== localDateKey(nowDate);
  if (!newDay && gapMs < Math.max(1, Number(gapMinutes) || 90) * 60000) return null;
  const session = [latest];
  const maxGapMs = Math.max(1, Number(gapMinutes) || 90) * 60000;
  for (let index = valid.length - 2; index >= 0; index--) {
    const newer = session[0];
    const candidate = valid[index];
    const between = new Date(newer.timestamp).getTime() - new Date(candidate.timestamp).getTime();
    if (between >= maxGapMs || localDateKey(candidate.timestamp) !== localDateKey(newer.timestamp)) break;
    session.unshift(candidate);
  }
  return { newDay, gapMs, session, latest };
}

function sessionSummary(records, now = new Date(), gapMinutes = 90) {
  const transition = sessionTransition(records, now, gapMinutes);
  if (!transition) return null;
  const runs = transition.session;
  const finished = runs.filter(record => record.completion === 'finished');
  const scored = finished.length ? finished : runs;
  const average = selector => scored.reduce((sum, record) => sum + Number(selector(record) || 0), 0) / Math.max(1, scored.length);
  const avgAccuracy = average(record => record.accuracy);
  const avgMisses = average(record => record.misses);
  const avgTiming = average(record => record.timing?.average);
  const completionRate = finished.length / runs.length;
  let focus = 'monter doucement la difficulté sans sacrifier la propreté';
  if (completionRate < 0.7) focus = 'finir davantage de maps avant de pousser la difficulté';
  else if (avgMisses >= 5) focus = 'régularité et aim pour réduire les misses';
  else if (Math.abs(avgTiming) >= 8) focus = `timing ${avgTiming < 0 ? 'early' : 'late'} : recaler les frappes`;
  else if (avgAccuracy < 95) focus = 'précision : viser des hits plus propres';
  const label = transition.newDay ? 'Nouvelle journée' : 'Nouvelle session';
  return { ...transition, focus, report: `${label} — dernière session : ${runs.length} run${runs.length > 1 ? 's' : ''}, ${finished.length} finie${finished.length > 1 ? 's' : ''}, ${avgAccuracy.toFixed(2)}% moy., ${avgMisses.toFixed(1)} miss. Priorité : ${focus}.` };
}

function sessionMemory(records, gapMinutes = 90) {
  if (!records.length) return { runs: 0, tracks: [] };
  const maxGapMs = (Number(gapMinutes) || 90) * 60000;
  const session = [records.at(-1)];
  for (let index = records.length - 2; index >= 0; index--) {
    const newerTime = new Date(session[0].timestamp).getTime();
    const candidateTime = new Date(records[index].timestamp).getTime();
    if (!Number.isFinite(newerTime) || !Number.isFinite(candidateTime) || newerTime - candidateTime >= maxGapMs) break;
    session.unshift(records[index]);
  }
  const tracks = new Map();
  for (const record of session) {
    const key = String(record.beatmapId || `${record.artist}|${record.title}|${record.difficulty}`);
    const item = tracks.get(key) || { beatmapId: record.beatmapId, map: `${record.artist} - ${record.title} [${record.difficulty}]`, attempts: 0, bestAccuracy: 0, bestMisses: null };
    item.attempts++;
    if (record.completion === 'finished') {
      item.bestAccuracy = Math.max(item.bestAccuracy, Number(record.accuracy) || 0);
      item.bestMisses = item.bestMisses === null ? Number(record.misses) : Math.min(item.bestMisses, Number(record.misses));
    }
    tracks.set(key, item);
  }
  return { runs: session.length, tracks: [...tracks.values()].slice(-20) };
}

function splitSessions(records, gapMinutes = 90) {
  const gapMs = (Number(gapMinutes) || 90) * 60000;
  const valid = records.filter(record => Number.isFinite(new Date(record.timestamp).getTime())).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const sessions = [];
  for (const record of valid) {
    const current = sessions.at(-1);
    const previous = current?.at(-1);
    if (!current || new Date(record.timestamp) - new Date(previous.timestamp) >= gapMs || localDateKey(record.timestamp) !== localDateKey(previous.timestamp)) sessions.push([record]);
    else current.push(record);
  }
  return sessions;
}

function summarizeSession(records, gapMinutes = 90) {
  if (!records.length) return null;
  const finished = records.filter(record => record.completion === 'finished');
  const scored = finished.length ? finished : records;
  const average = selector => scored.reduce((sum, record) => sum + Number(selector(record) || 0), 0) / scored.length;
  const best = finished.reduce((winner, record) => !winner || Number(record.accuracy) > Number(winner.accuracy) ? record : winner, null);
  return {
    startedAt: records[0].timestamp, endedAt: records.at(-1).timestamp,
    durationMinutes: Math.max(0, Math.round((new Date(records.at(-1).timestamp) - new Date(records[0].timestamp)) / 60000)),
    runs: records.length, finished: finished.length,
    failed: records.filter(record => record.completion === 'failed').length,
    abandoned: records.filter(record => record.completion === 'abandoned').length,
    uniqueMaps: new Set(records.map(record => record.beatmapId).filter(Boolean)).size,
    averageAccuracy: Math.round(average(record => record.accuracy) * 100) / 100,
    averageUr: Math.round(average(record => record.timing?.unstableRate) * 10) / 10,
    averageMisses: Math.round(average(record => record.misses) * 10) / 10,
    averageStars: Math.round(average(record => record.stars) * 100) / 100,
    best: best ? { beatmapId: best.beatmapId, map: `${best.artist} - ${best.title} [${best.difficulty}]`, accuracy: best.accuracy, misses: best.misses, pp: best.pp } : null,
    focus: sessionSummary(records, new Date(new Date(records.at(-1).timestamp).getTime() + (Number(gapMinutes) || 90) * 60000), gapMinutes)?.focus || '',
  };
}

function progressByDay(records, days = 30, now = new Date()) {
  const count = Math.max(1, Math.min(90, Number(days) || 30));
  const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - count + 1);
  const buckets = new Map();
  for (let index = 0; index < count; index++) {
    const date = new Date(start); date.setDate(start.getDate() + index);
    buckets.set(localDateKey(date), { date: localDateKey(date), runs: 0, finished: 0, accuracy: [], ur: [], misses: [], stars: [] });
  }
  for (const record of records) {
    const bucket = buckets.get(localDateKey(record.timestamp));
    if (!bucket) continue;
    bucket.runs++;
    if (record.completion !== 'finished') continue;
    bucket.finished++; bucket.accuracy.push(Number(record.accuracy) || 0); bucket.ur.push(Number(record.timing?.unstableRate) || 0); bucket.misses.push(Number(record.misses) || 0); bucket.stars.push(Number(record.stars) || 0);
  }
  const avg = values => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 100) / 100 : null;
  return [...buckets.values()].map(bucket => ({ date: bucket.date, runs: bucket.runs, finished: bucket.finished, completionRate: bucket.runs ? Math.round(bucket.finished / bucket.runs * 100) : null, accuracy: avg(bucket.accuracy), ur: avg(bucket.ur), misses: avg(bucket.misses), stars: avg(bucket.stars) }));
}

module.exports = { localDateKey, progressByDay, sessionMemory, sessionSummary, sessionTransition, splitSessions, summarizeSession };
