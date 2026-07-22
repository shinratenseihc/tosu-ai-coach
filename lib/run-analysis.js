function hitCounts(data = {}) {
  const hits = data.play?.hits || {};
  return { misses: Number(hits['0'] || 0), sliderBreaks: Number(hits.sliderBreaks || 0), hit50: Number(hits['50'] || 0), hit100: Number(hits['100'] || 0) };
}

function mapProgress(data = {}) {
  const timeMs = Number(data.beatmap?.time?.live || 0);
  const first = Number(data.beatmap?.time?.firstObject || 0);
  const last = Number(data.beatmap?.time?.lastObject || data.beatmap?.time?.mp3Length || 0);
  const progress = last > first ? (timeMs - first) / (last - first) : 0;
  return { timeMs, progress: Math.max(0, Math.min(1, progress)) };
}

function createRunTracker() {
  let previous = null;
  let incidents = [];
  function start(data) { previous = hitCounts(data); incidents = []; }
  function update(data) {
    const current = hitCounts(data);
    if (!previous) { previous = current; return; }
    const delta = {};
    for (const key of Object.keys(current)) {
      const increase = Math.max(0, current[key] - previous[key]);
      if (increase) delta[key] = increase;
    }
    if (Object.keys(delta).length) incidents.push({ ...mapProgress(data), ...delta });
    previous = current;
  }
  function finish(data) { update(data); const result = incidents; previous = null; incidents = []; return result; }
  function reset() { previous = null; incidents = []; }
  return { finish, reset, start, update };
}

function difficultyAt(profile, progress) {
  const values = Array.isArray(profile) ? profile.map(Number).filter(Number.isFinite) : [];
  if (!values.length || !values.some(value => value > 0)) return null;
  const index = Math.max(0, Math.min(values.length - 1, Math.floor(progress * values.length)));
  const value = values[index];
  const percentile = Math.round(values.filter(candidate => candidate <= value).length / values.length * 100);
  return { bucket: index, percentile, level: percentile >= 75 ? 'high' : percentile >= 40 ? 'medium' : 'low' };
}

function summarizeRunIncidents(incidents, difficultyProfile = null) {
  if (!Array.isArray(incidents) || !incidents.length) return null;
  const important = incidents.filter(item => Number(item.misses || 0) + Number(item.sliderBreaks || 0) > 0);
  const selected = important.length ? important : incidents;
  const locations = selected.slice(0, 12).map(item => {
    const difficulty = difficultyAt(difficultyProfile, item.progress);
    return { timeMs: item.timeMs, progressPercent: Math.round(item.progress * 100), misses: Number(item.misses || 0), sliderBreaks: Number(item.sliderBreaks || 0), hit50: Number(item.hit50 || 0), hit100: Number(item.hit100 || 0), observedDifficulty: difficulty?.level || 'unknown', difficultyPercentile: difficulty?.percentile ?? null };
  });
  const known = locations.filter(item => item.difficultyPercentile !== null);
  const high = known.filter(item => item.observedDifficulty === 'high').length;
  const low = known.filter(item => item.observedDifficulty === 'low').length;
  let interpretation = 'positions_only';
  if (known.length && high === known.length) interpretation = 'errors_on_observed_peaks';
  else if (known.length && low === known.length) interpretation = 'errors_outside_observed_peaks';
  else if (known.length) interpretation = 'mixed_sections';
  return { source: known.length ? 'tosu_live_and_osu_fail_profile' : 'tosu_live_only', confidence: known.length ? 'medium' : 'low', interpretation, locations, caveat: 'Le profil indique où les joueurs échouent souvent; il ne prouve pas à lui seul la cause technique d’une erreur.' };
}

module.exports = { createRunTracker, difficultyAt, hitCounts, mapProgress, summarizeRunIncidents };
