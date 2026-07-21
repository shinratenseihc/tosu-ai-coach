const { spawn, spawnSync } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const osuApi = require('./osu-api.js');

const ROOT = __dirname;
const DATA_DIR = process.env.TOSU_COACH_DATA_DIR || path.join(process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || ROOT, 'AppData', 'Local'), 'TosuAICoach');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const HISTORY_PATH = path.join(DATA_DIR, 'history.json');
const STATE_PATH = path.join(DATA_DIR, 'last-state.json');
const PROFILE_HISTORY_PATH = path.join(DATA_DIR, 'profile-history.json');
const DASHBOARD_DIR = path.join(ROOT, 'dashboard');
const LOG_DIR = path.join(DATA_DIR, 'logs');
const LOG_PATH = path.join(LOG_DIR, 'coach.log');
const POWERSHELL = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
const DEFAULT_CONFIG = { provider: 'auto', claude_first: true, language: 'auto', coach_name: 'Coach IA', personality: 'balanced', display_mode: 'timed', display_seconds: 20, overlay_accent_color: '#ff66aa', overlay_show_background: true, overlay_background_opacity: 100, overlay_show_logo: true, history_limit: 2000, session_gap_minutes: 90, pause_cooldown_minutes: 60, failure_pause_minutes: 15, failure_pause_attempts: 6, performance_pause_minutes: 30, max_report_chars: 1000, comfortable_stars: null, comfortable_stars_min: null, comfortable_stars_max: null, goals: [], weaknesses: [], current_rank: null, rank_goal: null, rank_region: '', osu_integration_enabled: false, osu_username: '', osu_client_id: '', osu_client_secret: '', osu_supporter: false, allow_online_recommendations: false, allow_knowledge_updates: false, tosu_url: 'http://127.0.0.1:24050', coach_port: 24051 };

function findExecutable(command, candidates = []) {
  for (const candidate of candidates) if (candidate && fs.existsSync(candidate)) return candidate;
  const found = spawnSync('where.exe', [command], { encoding: 'utf8', windowsHide: true });
  return found.status === 0 ? found.stdout.split(/\r?\n/).find(Boolean) || '' : '';
}

function initializeStorage() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const legacy = { 'config.json': CONFIG_PATH, 'history.json': HISTORY_PATH, 'last-state.json': STATE_PATH };
  for (const [name, destination] of Object.entries(legacy)) {
    const source = path.join(ROOT, name);
    if (!fs.existsSync(destination) && fs.existsSync(source)) fs.copyFileSync(source, destination);
  }
  if (!fs.existsSync(CONFIG_PATH)) fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
  if (!fs.existsSync(HISTORY_PATH)) fs.writeFileSync(HISTORY_PATH, '[]\n', 'utf8');
  if (!fs.existsSync(PROFILE_HISTORY_PATH)) fs.writeFileSync(PROFILE_HISTORY_PATH, '[]\n', 'utf8');
}

initializeStorage();

const CLAUDE = findExecutable('claude', [
  process.env.CLAUDE_PATH,
  path.join(process.env.USERPROFILE || '', '.local', 'bin', 'claude.exe'),
]);
const CODEX = findExecutable('codex', [
  process.env.CODEX_PATH,
  path.join(process.env.APPDATA || '', 'npm', 'codex.ps1'),
]);

let state = { status: 'idle', report: '', provider: '', record: null, visibleUntil: 0, updatedAt: Date.now() };
let wasResults = false;
let busy = false;
let lastFingerprint = '';
let wasPlaying = false;
let lastPlayData = null;
let activeAiChild = null;
let analysisGeneration = 0;
let lastSessionNotice = '';
let gameStatus = 'unknown';
let pollFailures = 0;
let cachedOsuProfile = null;
let dashboardLastSeenAt = 0;
let dashboardOpenTimer = null;
let ignoreResultsUntilPlay = true;
let processCheckRunning = false;

let cachedConfig = null;
let cachedConfigMtime = 0;

function config() {
  try {
    const mtime = fs.statSync(CONFIG_PATH).mtimeMs;
    if (!cachedConfig || mtime !== cachedConfigMtime) {
      cachedConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      cachedConfigMtime = mtime;
    }
    return cachedConfig;
  } catch { return { ...DEFAULT_CONFIG }; }
}

function tosuApiUrl() {
  return `${String(config().tosu_url || DEFAULT_CONFIG.tosu_url).replace(/\/$/, '')}/json/v2`;
}

function resolveLanguage() {
  const configured = String(config().language || 'auto').toLowerCase();
  if (configured !== 'auto') return configured.split(/[-_]/)[0];
  const detected = (Intl.DateTimeFormat().resolvedOptions().locale || process.env.LANG || 'en').toLowerCase();
  return detected.split(/[-_]/)[0];
}

function languageName(code) {
  return ({ fr: 'français', en: 'anglais', de: 'allemand', es: 'espagnol', it: 'italien', pt: 'portugais', nl: 'néerlandais', pl: 'polonais', tr: 'turc', ru: 'russe', uk: 'ukrainien', ja: 'japonais', ko: 'coréen', zh: 'chinois' })[code] || 'anglais';
}

function log(message) {
  const line = `${new Date().toISOString()} ${message}`;
  console.log(line);
  try { fs.appendFileSync(LOG_PATH, `${line}\n`, 'utf8'); } catch {}
}

function history() {
  try { return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8')); } catch { return []; }
}

function saveHistory(records) {
  const limit = Number(config().history_limit) || 2000;
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(records.slice(-limit), null, 2), 'utf8');
}

function saveConfig(next) {
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
}

function updatePublicConfig(input) {
  const current = config();
  const next = { ...current };
  const numeric = ['comfortable_stars_min', 'comfortable_stars_max', 'current_rank', 'rank_goal'];
  const lists = ['goals', 'weaknesses'];
  for (const key of numeric) {
    const value = input[key];
    next[key] = value === null || value === '' ? null : Math.max(0, Number(value) || 0);
  }
  for (const key of lists) next[key] = Array.isArray(input[key]) ? input[key].map(value => String(value).trim()).filter(Boolean).slice(0, 12) : [];
  if (['auto', 'claude', 'codex'].includes(input.provider)) next.provider = input.provider;
  if (['balanced', 'supportive', 'sarcastic', 'competitive', 'analyst', 'training_companion'].includes(input.personality)) next.personality = input.personality;
  if (['always', 'timed'].includes(input.display_mode)) next.display_mode = input.display_mode;
  if (input.display_seconds !== undefined) next.display_seconds = Math.max(5, Math.min(120, Number(input.display_seconds) || 20));
  if (typeof input.claude_first === 'boolean') next.claude_first = input.claude_first;
  if (typeof input.language === 'string' && /^[a-z]{2,8}([-_][a-z]{2,8})?$/i.test(input.language)) next.language = input.language;
  if (typeof input.rank_region === 'string') next.rank_region = input.rank_region.trim().slice(0, 40);
  if (typeof input.coach_name === 'string') next.coach_name = input.coach_name.trim().slice(0, 32) || 'Coach IA';
  if (typeof input.overlay_accent_color === 'string' && /^#[0-9a-f]{6}$/i.test(input.overlay_accent_color.trim())) next.overlay_accent_color = input.overlay_accent_color.trim().toLowerCase();
  if (input.overlay_background_opacity !== undefined) {
    next.overlay_background_opacity = Math.max(0, Math.min(100, Math.round(Number(input.overlay_background_opacity) || 0)));
    next.overlay_show_background = next.overlay_background_opacity > 0;
  }
  if (typeof input.osu_username === 'string') next.osu_username = input.osu_username.trim().slice(0, 40);
  if (typeof input.osu_client_id === 'string' && /^\d{0,20}$/.test(input.osu_client_id.trim())) next.osu_client_id = input.osu_client_id.trim();
  if (typeof input.osu_client_secret === 'string' && input.osu_client_secret.trim()) next.osu_client_secret = input.osu_client_secret.trim().slice(0, 120);
  if (input.osu_client_secret === null) next.osu_client_secret = '';
  for (const key of ['overlay_show_background', 'overlay_show_logo', 'osu_integration_enabled', 'osu_supporter', 'allow_online_recommendations', 'allow_knowledge_updates']) if (typeof input[key] === 'boolean') next[key] = input[key];
  if (next.comfortable_stars_min && next.comfortable_stars_max && next.comfortable_stars_min > next.comfortable_stars_max) {
    [next.comfortable_stars_min, next.comfortable_stars_max] = [next.comfortable_stars_max, next.comfortable_stars_min];
  }
  saveConfig(next);
  const snapshots = readJson(PROFILE_HISTORY_PATH, []);
  snapshots.push({ timestamp: new Date().toISOString(), current_rank: next.current_rank, rank_goal: next.rank_goal });
  fs.writeFileSync(PROFILE_HISTORY_PATH, `${JSON.stringify(snapshots.slice(-500), null, 2)}\n`, 'utf8');
  return next;
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function saveState() {
  try { fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8'); } catch {}
}

function displayDeadline(seconds = config().display_seconds) {
  return config().display_mode === 'always' ? Number.MAX_SAFE_INTEGER : Date.now() + (Number(seconds) || 20) * 1000;
}

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
  const average = key => scored.reduce((sum, record) => sum + Number(key(record) || 0), 0) / Math.max(1, scored.length);
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
  return {
    ...transition,
    focus,
    report: `${label} — dernière session : ${runs.length} run${runs.length > 1 ? 's' : ''}, ${finished.length} finie${finished.length > 1 ? 's' : ''}, ${avgAccuracy.toFixed(2)}% moy., ${avgMisses.toFixed(1)} miss. Priorité : ${focus}.`,
  };
}

function showSessionRecap(now = new Date()) {
  const records = history();
  const recap = sessionSummary(records, now, config().session_gap_minutes);
  if (!recap) return false;
  const noticeKey = `${recap.latest.timestamp}|${localDateKey(now)}|${recap.newDay}`;
  if (noticeKey === lastSessionNotice) return false;
  lastSessionNotice = noticeKey;
  const warmup = warmupRecommendations(records);
  const warmupText = warmup.length ? ` Échauffement : ${warmup.map(item => `${item.title} (${Number(item.stars).toFixed(2)}★)`).join(' → ')}.` : '';
  state = {
    status: 'ready',
    report: `${recap.report}${warmupText}`.slice(0, Number(config().max_report_chars) || 1000),
    provider: recap.newDay ? 'Objectif du jour' : 'Reprise de session',
    record: recap.latest,
    visibleUntil: displayDeadline(),
    updatedAt: Date.now(),
    sessionRecap: { newDay: recap.newDay, runs: recap.session.length, focus: recap.focus, warmup },
  };
  saveState();
  log(`${recap.newDay ? 'Nouvelle journée' : 'Nouvelle session'} détectée : ${recap.report}`);
  return true;
}

function recordFingerprint(record) {
  return `${record.beatmapId}|${record.score}|${record.accuracy}|${record.combo}|${record.misses}|${record.completion || 'finished'}`;
}

function restoreLastReport() {
  const records = history();
  const latest = records.at(-1);
  if (latest) lastFingerprint = recordFingerprint(latest);
  try {
    const saved = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    if (saved?.record && saved?.report) {
      state = { ...saved, visibleUntil: config().display_mode === 'always' ? Number.MAX_SAFE_INTEGER : 0, updatedAt: Date.now() };
      return;
    }
  } catch {}
  const record = records.at(-1);
  if (!record) return;
  state = {
    status: 'ready',
    report: instantSummary(record, records.at(-2)),
    provider: 'Dernière analyse',
    record,
    visibleUntil: config().display_mode === 'always' ? Number.MAX_SAFE_INTEGER : 0,
    updatedAt: Date.now(),
  };
}

function timingStats(values) {
  const clean = (values || []).filter(value => Number.isFinite(value) && Math.abs(value) < 250);
  if (!clean.length) return { average: 0, unstableRate: 0, earlyPercent: 0, latePercent: 0 };
  const average = clean.reduce((sum, value) => sum + value, 0) / clean.length;
  const variance = clean.reduce((sum, value) => sum + Math.pow(value - average, 2), 0) / clean.length;
  return {
    average: Math.round(average * 10) / 10,
    unstableRate: Math.round(Math.sqrt(variance) * 10 * 10) / 10,
    earlyPercent: Math.round(clean.filter(value => value < 0).length / clean.length * 100),
    latePercent: Math.round(clean.filter(value => value > 0).length / clean.length * 100),
  };
}

function offsetAdvice(records) {
  const unique = [];
  const seen = new Set();
  for (const record of records) {
    const key = recordFingerprint(record);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(record);
  }
  const eligible = unique.filter(record =>
    record.completion === 'finished' &&
    Number.isFinite(record.timing?.average) &&
    (Number(record.hit50) + Number(record.hit100) + Number(record.hit300)) >= 100
  ).slice(-12);
  const maps = new Set(eligible.map(record => record.beatmapId));
  if (eligible.length < 3 || maps.size < 3) return null;
  const early = eligible.filter(record => record.timing.average < 0).length;
  const late = eligible.filter(record => record.timing.average > 0).length;
  const consistency = Math.max(early, late) / eligible.length;
  const sorted = eligible.map(record => record.timing.average).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (eligible.length >= 5 && consistency >= 0.8 && Math.abs(median) >= 8) {
    const changeMs = Math.max(-20, Math.min(20, Math.round(-median)));
    return {
      type: 'universal',
      changeMs,
      sampleSize: eligible.length,
      mapCount: maps.size,
      medianHitError: Math.round(median * 10) / 10,
      instruction: `${changeMs > 0 ? 'augmente' : 'diminue'} ton offset universel de ${Math.abs(changeMs)} ms`,
    };
  }
  const consecutive = eligible.slice(-3);
  const consecutiveMaps = new Set(consecutive.map(record => record.beatmapId));
  const allEarly = consecutive.every(record => record.timing.average <= -8);
  const allLate = consecutive.every(record => record.timing.average >= 8);
  if (consecutive.length === 3 && consecutiveMaps.size === 3 && (allEarly || allLate)) {
    const recentSorted = consecutive.map(record => record.timing.average).sort((a, b) => a - b);
    const recentMedian = recentSorted[1];
    return {
      type: 'check',
      direction: allEarly ? 'early' : 'late',
      sampleSize: 3,
      mapCount: 3,
      medianHitError: Math.round(recentMedian * 10) / 10,
      instruction: `vérifie ton offset universel : tes 3 dernières maps montrent un biais ${allEarly ? 'early' : 'late'}, sans le modifier automatiquement pour l’instant`,
    };
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

function fatigueAdvice(records, options = {}) {
  const cooldownMs = (Number(options.pause_cooldown_minutes) || 60) * 60000;
  const failureWindowMs = (Number(options.failure_pause_minutes) || 15) * 60000;
  const failureAttempts = Number(options.failure_pause_attempts) || 6;
  const performanceWindowMs = (Number(options.performance_pause_minutes) || 30) * 60000;
  const recordTimes = records.map(record => new Date(record.timestamp).getTime()).filter(Number.isFinite);
  const latestTime = recordTimes.length ? Math.max(...recordTimes) : Date.now();
  const recentlyAdvised = records.some(record => record.fatigueAdvice && Number.isFinite(new Date(record.timestamp).getTime()) && latestTime - new Date(record.timestamp).getTime() < cooldownMs);
  if (recentlyAdvised) return null;

  const failures = [];
  for (const record of [...records].reverse()) {
    if (record.completion === 'finished') break;
    if (record.completion === 'failed' || record.completion === 'abandoned') failures.unshift(record);
  }
  const failureTimes = failures.map(record => new Date(record.timestamp).getTime()).filter(Number.isFinite);
  if (failures.length >= failureAttempts && failureTimes.length >= 2 && failureTimes.at(-1) - failureTimes[0] >= failureWindowMs) {
    return { reason: 'failure_streak', attempts: failures.length, minutes: Math.round((failureTimes.at(-1) - failureTimes[0]) / 60000) };
  }

  const recent = records.filter(record => record.completion === 'finished').slice(-3);
  if (recent.length < 3) return null;
  const times = recent.map(record => new Date(record.timestamp).getTime()).filter(Number.isFinite);
  if (times.length < 2 || times.at(-1) - times[0] < performanceWindowMs) return null;
  const first = recent[0];
  const last = recent[recent.length - 1];
  const accuracyDrop = Number(first.accuracy) - Number(last.accuracy);
  if (accuracyDrop < 2) return null;
  return { reason: 'performance_drop', accuracyDrop: Math.round(accuracyDrop * 100) / 100 };
}

function makeRecord(data, completion = 'finished') {
  const result = data.resultsScreen || {};
  const play = data.play || {};
  const beatmap = data.beatmap || {};
  const hits = Object.keys(result.hits || {}).length && result.accuracy ? result.hits : (play.hits || {});
  const timing = timingStats(play.hitErrorArray);
  return {
    timestamp: new Date().toISOString(),
    player: result.playerName || play.playerName || data.profile?.name || '',
    beatmapId: beatmap.id || 0,
    setId: beatmap.set || 0,
    artist: beatmap.artist || '',
    title: beatmap.title || '',
    difficulty: beatmap.version || '',
    stars: beatmap.stats?.stars?.total || beatmap.stats?.stars?.live || 0,
    aim: beatmap.stats?.stars?.aim || 0,
    speed: beatmap.stats?.stars?.speed || 0,
    reading: beatmap.stats?.stars?.reading || 0,
    bpm: beatmap.stats?.bpm?.common || 0,
    score: result.score || play.score || 0,
    accuracy: result.accuracy || play.accuracy || 0,
    combo: result.maxCombo || play.combo?.current || 0,
    maxCombo: beatmap.stats?.maxCombo || 0,
    misses: Number(hits['0'] || 0),
    hit50: Number(hits['50'] || 0),
    hit100: Number(hits['100'] || 0),
    hit300: Number(hits['300'] || 0),
    sliderBreaks: Number(hits.sliderBreaks || play.hits?.sliderBreaks || 0),
    mods: result.mods?.name || play.mods?.name || '',
    pp: result.pp?.current || play.pp?.current || 0,
    ppFc: result.pp?.fc || play.pp?.fc || 0,
    failed: completion === 'failed',
    completion,
    progressPercent: Math.max(0, Math.min(100, Math.round(
      Number(beatmap.time?.live || 0) / Math.max(1, Number(beatmap.time?.lastObject || beatmap.time?.mp3Length || 1)) * 100
    ))),
    timing,
  };
}

function previousMapResult(records, beatmapId) {
  return [...records].reverse().find(record => record.beatmapId === beatmapId && record.completion === 'finished') || null;
}

function bestMapResult(records, beatmapId) {
  return records.filter(record => record.beatmapId === beatmapId && record.completion === 'finished').reduce((best, record) => {
    if (!best || Number(record.score) > Number(best.score)) return record;
    if (Number(record.score) === Number(best.score) && Number(record.accuracy) > Number(best.accuracy)) return record;
    return best;
  }, null);
}

function makeLiveRecord(data, previous = null) {
  const record = makeRecord(data, 'playing');
  record.phase = 'playing';
  record.previousScore = previous ? {
    timestamp: previous.timestamp, score: previous.score, accuracy: previous.accuracy,
    combo: previous.combo, maxCombo: previous.maxCombo, misses: previous.misses, pp: previous.pp,
  } : null;
  return record;
}

function playerProfile() {
  const cfg = config();
  const positiveNumber = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
  const comfortableStars = positiveNumber(cfg.comfortable_stars);
  return {
    comfortableStars,
    comfortableStarsMin: positiveNumber(cfg.comfortable_stars_min) || comfortableStars,
    comfortableStarsMax: positiveNumber(cfg.comfortable_stars_max) || comfortableStars,
    goals: Array.isArray(cfg.goals) ? cfg.goals.map(String).filter(Boolean).slice(0, 5) : (cfg.goals ? [String(cfg.goals)] : []),
    weaknesses: Array.isArray(cfg.weaknesses) ? cfg.weaknesses.map(String).filter(Boolean).slice(0, 8) : (cfg.weaknesses ? [String(cfg.weaknesses)] : []),
    currentRank: cfg.current_rank || null,
    rankGoal: cfg.rank_goal || null,
    rankRegion: cfg.rank_region || null,
  };
}

function pickRank(profile, rankRegion) {
  if (!profile) return null;
  if (String(rankRegion || '').trim() && Number.isFinite(Number(profile.countryRank)) && profile.countryRank) return Number(profile.countryRank);
  return Number.isFinite(Number(profile.globalRank)) && profile.globalRank ? Number(profile.globalRank) : null;
}

function osuIntegrationReady(cfg = config()) {
  return Boolean(cfg.osu_integration_enabled && String(cfg.osu_username || '').trim() && String(cfg.osu_client_id || '').trim() && String(cfg.osu_client_secret || '').trim());
}

async function syncOsuProfile() {
  const cfg = config();
  if (!osuIntegrationReady(cfg)) throw new Error('intégration osu! non configurée : active-la et renseigne pseudo, client ID et secret');
  const snapshots = readJson(PROFILE_HISTORY_PATH, []);
  const previousOsu = [...snapshots].reverse().find(item => item.source === 'osu-sync') || null;
  const profile = await osuApi.fetchUser(String(cfg.osu_client_id).trim(), String(cfg.osu_client_secret).trim(), String(cfg.osu_username).trim());
  cachedOsuProfile = profile;
  const rank = pickRank(profile, cfg.rank_region);
  if (rank) {
    const next = { ...config(), current_rank: rank };
    saveConfig(next);
    snapshots.push({ timestamp: new Date().toISOString(), current_rank: next.current_rank, rank_goal: next.rank_goal, global_rank: profile.globalRank, country_rank: profile.countryRank, pp: profile.pp, source: 'osu-sync' });
    fs.writeFileSync(PROFILE_HISTORY_PATH, `${JSON.stringify(snapshots.slice(-500), null, 2)}\n`, 'utf8');
  }
  const progress = previousOsu ? {
    globalRankGain: Number(previousOsu.global_rank) > Number(profile.globalRank) ? Number(previousOsu.global_rank) - Number(profile.globalRank) : 0,
    countryRankGain: Number(previousOsu.country_rank) > Number(profile.countryRank) ? Number(previousOsu.country_rank) - Number(profile.countryRank) : 0,
    ppGain: Number(profile.pp) > Number(previousOsu.pp) ? Number(profile.pp) - Number(previousOsu.pp) : 0,
  } : { globalRankGain: 0, countryRankGain: 0, ppGain: 0 };
  log(`Profil osu! synchronisé : ${profile.username} (global #${profile.globalRank ?? '—'}, pays #${profile.countryRank ?? '—'})`);
  return { ...profile, appliedRank: rank, progress };
}

function profileProgressSummary(progress) {
  const parts = [];
  if (Number(progress?.ppGain) >= 0.05) parts.push(`+${Number(progress.ppGain).toFixed(1)}pp au total`);
  if (Number(progress?.globalRankGain) > 0) parts.push(`${Number(progress.globalRankGain)} place${Number(progress.globalRankGain) > 1 ? 's' : ''} gagnée${Number(progress.globalRankGain) > 1 ? 's' : ''} au classement global`);
  if (Number(progress?.countryRankGain) > 0) parts.push(`${Number(progress.countryRankGain)} place${Number(progress.countryRankGain) > 1 ? 's' : ''} gagnée${Number(progress.countryRankGain) > 1 ? 's' : ''} dans ton pays`);
  return parts.length ? ` Progression osu! confirmée : ${parts.join(' et ')}. Ça se fête.` : '';
}

function personalityInstruction(value = config().personality) {
  return ({
    balanced: 'Pote équilibré : encouragement sincère, humour léger et conseil concret.',
    supportive: 'Bienveillant : calme, rassurant et positif, sans sarcasme ni pression.',
    sarcastic: 'Sarcastique affectueux : chambrage créatif plus présent, jamais humiliant, puis conseil utile.',
    competitive: 'Compétiteur direct : énergique, exigeant, phrases courtes, objectif mesurable et aucune excuse inutile.',
    analyst: 'Analyste calme : factuel, précis, peu de blagues, priorité aux tendances et aux données fiables.',
    training_companion: 'Compagnon d’entraînement : ambiance de pote, fun et chambrage affectueux. Valorise la répétition, les bons passages et le plaisir de jouer ; peu de tracking chiffré, jamais de pression.',
  })[value] || 'Pote équilibré : encouragement sincère, humour léger et conseil concret.';
}

function coachingKnowledge() {
  return 'Une bonne partie se juge d’abord par la progression sur la même difficulté, l’accuracy, les misses, le combo, le score, les PP et le ressenti. L’UR est une statistique avancée secondaire : ne jamais le mentionner spontanément ni juger un run dessus. Le hit error moyen sert seulement à repérer un biais early/late répété. Une OD élevée resserre les hit windows. AR règle le temps de lecture, pas le timing. Ne conseiller l’offset universel que si un biais significatif revient sur plusieurs maps distinctes. Distinguer stamina, speed, finger control et lecture.';
}

function warmupRecommendations(records, profile = playerProfile()) {
  const min = Number(profile.comfortableStarsMin || profile.comfortableStars || 0);
  const max = Number(profile.comfortableStarsMax || profile.comfortableStars || 0);
  if (!min || !max) return [];
  const byMap = new Map();
  for (const record of records) {
    if (record.completion !== 'finished' || Number(record.stars) < min || Number(record.stars) > max || !record.beatmapId) continue;
    const current = byMap.get(record.beatmapId);
    const quality = Number(record.accuracy) - Number(record.misses) * 0.35;
    if (!current || quality > current.quality) byMap.set(record.beatmapId, { ...record, quality });
  }
  const candidates = [...byMap.values()];
  const targets = [min + (max - min) * 0.15, min + (max - min) * 0.5, min + (max - min) * 0.85];
  const labels = ['Mise en route', 'Contrôle', 'Activation'];
  const selected = [];
  for (let index = 0; index < targets.length; index++) {
    const available = candidates.filter(record => !selected.some(item => item.beatmapId === record.beatmapId));
    const best = available.sort((a, b) => (Math.abs(Number(a.stars) - targets[index]) - Math.abs(Number(b.stars) - targets[index])) || (b.quality - a.quality))[0];
    if (!best) continue;
    selected.push({ label: labels[index], beatmapId: best.beatmapId, setId: best.setId, artist: best.artist, title: best.title, difficulty: best.difficulty, stars: best.stars, bpm: best.bpm, accuracy: best.accuracy, misses: best.misses, url: best.setId ? `https://osu.ppy.sh/beatmapsets/${best.setId}#osu/${best.beatmapId}` : `https://osu.ppy.sh/beatmaps/${best.beatmapId}` });
  }
  return selected;
}

function mapStartSummary(record, profile = {}, personality = 'balanced') {
  const previous = record.previousScore;
  const comfortMin = Number(profile.comfortableStarsMin || profile.comfortableStars);
  const comfortMax = Number(profile.comfortableStarsMax || profile.comfortableStars);
  const level = comfortMin && comfortMax
    ? (Number(record.stars) > comfortMax ? ` Défi à +${(Number(record.stars) - comfortMax).toFixed(2)}★ au-dessus de ta zone confort : priorité à la survie et à l’apprentissage.` : Number(record.stars) < comfortMin ? ' Map sous ta zone confort : vise surtout la propreté.' : ' Map dans ta zone confort : bonne référence pour mesurer ta régularité.')
    : '';
  const motivation = ({ supportive: 'Respire, installe ton rythme et construis le run.', sarcastic: 'La map croit encore que ton ancien score suffit. C’est mignon.', competitive: 'Cible verrouillée. Va chercher mieux.', analyst: 'Référence chargée : cherche un gain propre, pas un miracle.', training_companion: 'On joue, on répète, on apprend — et si la map se fait humilier au passage, tant mieux.', balanced: 'La cible est posée : à toi de lui faire prendre sa retraite.' })[personality] || 'La cible est posée : à toi de lui faire prendre sa retraite.';
  if (!previous) return `Première référence sur cette difficulté. Finis proprement pour poser une base à battre. ${motivation}${level}`;
  return `Meilleur score : ${Number(previous.accuracy).toFixed(2)}% • ${previous.misses} miss • ${previous.combo}${previous.maxCombo ? `/${previous.maxCombo}` : ''}x${previous.pp ? ` • ${Number(previous.pp).toFixed(1)}pp` : ''}. ${motivation}${level}`;
}

async function onlineBestForBeatmap(beatmapId) {
  const cfg = config();
  if (!osuIntegrationReady(cfg)) return null;
  const profile = cachedOsuProfile || await osuApi.fetchUser(String(cfg.osu_client_id).trim(), String(cfg.osu_client_secret).trim(), String(cfg.osu_username).trim());
  cachedOsuProfile = profile;
  const scores = await osuApi.fetchUserBeatmapScores(String(cfg.osu_client_id).trim(), String(cfg.osu_client_secret).trim(), profile.id, beatmapId);
  return scores[0] || null;
}

function showMapStart(data) {
  const beatmapId = data.beatmap?.id || 0;
  if (!beatmapId) return;
  const previous = bestMapResult(history(), beatmapId);
  const record = makeLiveRecord(data, previous);
  state = { status: 'playing', report: mapStartSummary(record, playerProfile(), config().personality), provider: previous ? 'Meilleur score connu' : 'Nouvelle référence', record, visibleUntil: displayDeadline(), updatedAt: Date.now() };
  onlineBestForBeatmap(beatmapId).then(onlineBest => {
    if (!onlineBest || state.status !== 'playing' || Number(state.record?.beatmapId) !== Number(beatmapId)) return;
    const localBest = state.record.previousScore;
    const best = !localBest || onlineBest.score > Number(localBest.score || 0) ? onlineBest : localBest;
    state.record.previousScore = best;
    state.record.onlineBest = onlineBest;
    state.report = mapStartSummary(state.record, playerProfile(), config().personality);
    state.provider = 'Meilleur score osu!';
    state.updatedAt = Date.now();
  }).catch(error => log(`Score osu! indisponible pour la beatmap ${beatmapId} : ${error.message}`));
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

function summarizeSession(records) {
  if (!records.length) return null;
  const finished = records.filter(record => record.completion === 'finished');
  const scored = finished.length ? finished : records;
  const average = selector => scored.reduce((sum, record) => sum + Number(selector(record) || 0), 0) / scored.length;
  const maps = new Set(records.map(record => record.beatmapId).filter(Boolean));
  const best = finished.reduce((winner, record) => !winner || Number(record.accuracy) > Number(winner.accuracy) ? record : winner, null);
  return {
    startedAt: records[0].timestamp,
    endedAt: records.at(-1).timestamp,
    durationMinutes: Math.max(0, Math.round((new Date(records.at(-1).timestamp) - new Date(records[0].timestamp)) / 60000)),
    runs: records.length,
    finished: finished.length,
    failed: records.filter(record => record.completion === 'failed').length,
    abandoned: records.filter(record => record.completion === 'abandoned').length,
    uniqueMaps: maps.size,
    averageAccuracy: Math.round(average(record => record.accuracy) * 100) / 100,
    averageUr: Math.round(average(record => record.timing?.unstableRate) * 10) / 10,
    averageMisses: Math.round(average(record => record.misses) * 10) / 10,
    averageStars: Math.round(average(record => record.stars) * 100) / 100,
    best: best ? { beatmapId: best.beatmapId, map: `${best.artist} - ${best.title} [${best.difficulty}]`, accuracy: best.accuracy, misses: best.misses, pp: best.pp } : null,
    focus: sessionSummary(records, new Date(new Date(records.at(-1).timestamp).getTime() + (Number(config().session_gap_minutes) || 90) * 60000), config().session_gap_minutes)?.focus || '',
  };
}

function progressByDay(records, days = 30, now = new Date()) {
  const count = Math.max(1, Math.min(90, Number(days) || 30));
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - count + 1);
  const buckets = new Map();
  for (let index = 0; index < count; index++) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    buckets.set(localDateKey(date), { date: localDateKey(date), runs: 0, finished: 0, accuracy: [], ur: [], misses: [], stars: [] });
  }
  for (const record of records) {
    const bucket = buckets.get(localDateKey(record.timestamp));
    if (!bucket) continue;
    bucket.runs++;
    if (record.completion !== 'finished') continue;
    bucket.finished++;
    bucket.accuracy.push(Number(record.accuracy) || 0);
    bucket.ur.push(Number(record.timing?.unstableRate) || 0);
    bucket.misses.push(Number(record.misses) || 0);
    bucket.stars.push(Number(record.stars) || 0);
  }
  const avg = values => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 100) / 100 : null;
  return [...buckets.values()].map(bucket => ({ date: bucket.date, runs: bucket.runs, finished: bucket.finished, completionRate: bucket.runs ? Math.round(bucket.finished / bucket.runs * 100) : null, accuracy: avg(bucket.accuracy), ur: avg(bucket.ur), misses: avg(bucket.misses), stars: avg(bucket.stars) }));
}

function instantSummary(record, previous) {
  if (record.completion !== 'finished') {
    if (record.progressPercent >= 90) return `À ${record.progressPercent}%, quitter c’est presque une performance artistique : je comprends, ce score aurait fait trop peur au classement. On garde la leçon et on revient le chercher.`;
    if (record.retryStreak >= 5) return `${record.retryStreak}e tentative sur cette map : à ce stade ce n’est plus de l’entêtement, c’est une relation toxique. Change de map quelques runs pour casser la boucle.`;
    const jokes = record.completion === 'failed'
      ? ['La barre de vie a posé sa démission sans préavis.', 'Le retry vient officiellement de devenir ton meilleur ami.', 'La map t’a rendu à l’accueil avec accusé de réception.', 'On avait demandé un FC, pas une démonstration de gravité.', 'Ton curseur était présent, son avocat beaucoup moins.', 'Le rythme t’a vu arriver et a changé les serrures.']
      : ['Retraite stratégique validée, personne ne dira ragequit devant les témoins.', 'Tu as quitté la map avant qu’elle puisse déposer plainte.', 'Cette tentative rejoint discrètement le programme de protection des runs.', 'Le bouton Échap vient de gagner un point de performance.', 'On appellera ça une reconnaissance du terrain très, très prudente.', 'La map continue sans toi, elle devrait s’en remettre.'];
    return `${jokes[Math.floor(Date.now() / 1000) % jokes.length]} Tu as atteint ${record.progressPercent}% : on garde les données utiles et on prépare la revanche.`;
  }
  const parts = [];
  parts.push(`${record.accuracy.toFixed(2)}% • ${record.misses} miss${record.misses === 1 ? '' : 'es'} • ${record.combo}/${record.maxCombo}x`);
  if (record.timing.average < -8) parts.push(`timing plutôt early (${record.timing.average} ms)`);
  else if (record.timing.average > 8) parts.push(`timing plutôt late (+${record.timing.average} ms)`);
  else {
    const timingLines = ['tes frappes sont plutôt bien calées', 'le timing tient la route sur cette partie', 'pas de gros décalage de timing à signaler', 'tes clics restent dans une zone assez propre', 'le métronome intérieur fait son boulot'];
    parts.push(timingLines[Math.floor(Date.now() / 1000) % timingLines.length]);
  }
  if (previous) {
    const delta = record.accuracy - previous.accuracy;
    const scoreDelta = Number(record.score) - Number(previous.score || 0);
    const ppDelta = Number(record.pp) - Number(previous.pp || 0);
    const missDelta = Number(previous.misses || 0) - Number(record.misses || 0);
    if (ppDelta >= 0.05) parts.push(`+${ppDelta.toFixed(1)}pp sur ta référence : oui, ça se fête !`);
    else if (scoreDelta > 0) parts.push(`nouveau meilleur score : +${scoreDelta.toLocaleString('fr-FR')} points, la répétition paie !`);
    else if (delta > 0) parts.push(`+${delta.toFixed(2)}% d’acc : progrès validé, on prend !`);
    else if (missDelta > 0) parts.push(`${missDelta} miss${missDelta > 1 ? 'es' : ''} de moins : le run devient plus solide.`);
    else {
      const learningLines = ['Cette tentative n’a pas tout donné, mais elle a laissé des indices utiles.', 'On n’encadre pas encore le replay, mais on sait déjà quoi régler ensuite.', 'Le résultat pique un peu ; les données, elles, sont exploitables.', 'Ce run n’entre pas au musée, mais il nous donne une piste claire.', 'Pas besoin de dramatiser : on récupère l’info et on repart plus malin.'];
      parts.push(learningLines[Math.floor(Date.now() / 1000) % learningLines.length]);
    }
  }
  return parts.join(' — ');
}

function promptFor(record, recent) {
  const language = resolveLanguage();
  const withoutUr = item => ({ ...item, timing: item.timing ? { average: item.timing.average, earlyPercent: item.timing.earlyPercent, latePercent: item.timing.latePercent } : null });
  const cleanRecent = recent.slice(-10).map(({ fatigueAdvice, ...item }) => withoutUr(item));
  const coachRecord = withoutUr(record);
  const memory = sessionMemory([...recent, record], config().session_gap_minutes);
  return `Tu t'appelles ${config().coach_name || 'Coach IA'} et tu coaches osu!. Réponds en ${languageName(language)} (${language}). Personnalité : ${personalityInstruction()}. Base technique vérifiée : ${coachingKnowledge()} Commence par ce qui était bon ou en progrès, même si le run n'est pas parfait. Compare surtout avec la meilleure référence de la même beatmap : score, accuracy, misses, combo et PP. Célèbre même un petit gain de PP ou de classement : la répétition est normale et utile. Ne parle jamais d'UR sauf si l'utilisateur le demande explicitement. Utilise la session pour éviter les répétitions. Adapte-toi aux étoiles confortables, objectifs, points faibles et rank cible. Ne promets aucun gain futur de rank. INTERDICTION de suggérer pause, repos, eau ou mouvement si fatigueAdvice est null. Donne 1 ou 2 conseils concrets, avec un ton aussi fun que sérieux. Si offsetAdvice.type="check", demande seulement de vérifier l'offset. Si type="universal", cite le changement prudent exact. Sinon, ne parle pas d'offset. Sans markdown, maximum ${Number(config().max_report_chars) || 1000} caractères. Profil: ${JSON.stringify(playerProfile())}. Partie: ${JSON.stringify(coachRecord)}. Session: ${JSON.stringify(memory)}. Historique: ${JSON.stringify(cleanRecent)}. Fatigue: ${JSON.stringify(record.fatigueAdvice || null)}`;
}

function removeUnscheduledBreakAdvice(text) {
  const breakPattern = /\b(pause|repos(?:e|er|ez)?|boi(?:s|re|vez)|eau|hydrat\w*|étir\w*|boug\w*|poignet\w*)\b/i;
  const kept = String(text).match(/[^.!?]+[.!?]?/g)?.map(sentence => sentence.trim()).filter(sentence => !breakPattern.test(sentence)) || [];
  return kept.join(' ').trim();
}

function runProcess(executable, args, timeoutMs = 60000, stdinText = '') {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: ROOT, windowsHide: true });
    activeAiChild = child;
    child.stdin.end(stdinText);
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', code => {
      clearTimeout(timer);
      if (activeAiChild === child) activeAiChild = null;
      if (code !== 0) return reject(new Error(stderr.trim() || `code ${code}`));
      const maxChars = Number(config().max_report_chars) || 1000;
      const compact = stdout.trim().replace(/\s+/g, ' ');
      const answer = compact.length <= maxChars ? compact : `${compact.slice(0, Math.max(1, maxChars - 1)).replace(/\s+\S*$/, '')}…`;
      if (!answer) return reject(new Error('réponse vide'));
      resolve(answer);
    });
  });
}

function runClaude(prompt) {
  if (!CLAUDE) return Promise.reject(new Error('Claude CLI introuvable'));
  return runProcess(CLAUDE, ['-p', '--no-session-persistence', '--permission-mode', 'dontAsk', '--effort', 'low', prompt]);
}

function runCodex(prompt) {
  if (!CODEX) return Promise.reject(new Error('Codex CLI introuvable'));
  const args = ['exec', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only', '-C', ROOT];
  if (/\.ps1$/i.test(CODEX)) return runProcess(POWERSHELL, ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', CODEX, ...args], 60000, prompt);
  return runProcess(CODEX, args, 60000, prompt);
}

async function runAi(prompt) {
  const cfg = config();
  if (cfg.provider === 'claude') return { provider: 'Claude', text: await runClaude(prompt) };
  if (cfg.provider === 'codex') return { provider: 'Codex', text: await runCodex(prompt) };
  const order = cfg.claude_first === false ? [['Codex', runCodex], ['Claude', runClaude]] : [['Claude', runClaude], ['Codex', runCodex]];
  let lastError;
  for (const [name, runner] of order) {
    try { return { provider: name, text: await runner(prompt) }; }
    catch (error) { lastError = error; log(`${name} indisponible: ${error.message}`); }
  }
  throw lastError;
}

async function analyze(data, completion = 'finished') {
  if (busy) return;
  const generation = ++analysisGeneration;
  const record = makeRecord(data, completion);
  const fingerprint = recordFingerprint(record);
  if (!record.beatmapId || fingerprint === lastFingerprint) return;
  lastFingerprint = fingerprint;
  busy = true;
  const records = history();
  const localPrevious = previousMapResult(records, record.beatmapId);
  const liveOnlineBest = Number(state.record?.beatmapId) === Number(record.beatmapId) ? state.record?.onlineBest : null;
  const previous = liveOnlineBest && (!localPrevious || Number(liveOnlineBest.score) > Number(localPrevious.score)) ? liveOnlineBest : localPrevious;
  record.previousScore = previous ? {
    timestamp: previous.timestamp, score: previous.score, accuracy: previous.accuracy,
    combo: previous.combo, maxCombo: previous.maxCombo, misses: previous.misses, pp: previous.pp,
  } : null;
  record.offsetAdvice = offsetAdvice([...records, record]);
  record.retryStreak = completion === 'finished' ? 0 : retryStreak(records, record.beatmapId) + 1;
  record.fatigueAdvice = fatigueAdvice([...records, record], config());
  records.push(record);
  saveHistory(records);
  state = { status: 'analyzing', report: instantSummary(record, previous), provider: '', record, visibleUntil: displayDeadline(), updatedAt: Date.now() };
  log(`Analyse: ${record.artist} - ${record.title}`);
  try {
    const result = await runAi(promptFor(record, records.slice(0, -1)));
    if (generation !== analysisGeneration) return;
    const filtered = record.fatigueAdvice ? result.text : removeUnscheduledBreakAdvice(result.text);
    state = { ...state, status: 'ready', report: filtered || instantSummary(record, previous), provider: result.provider, visibleUntil: displayDeadline(), updatedAt: Date.now() };
    saveState();
    if (completion === 'finished' && osuIntegrationReady()) {
      setTimeout(() => syncOsuProfile().then(profile => {
        if (generation !== analysisGeneration || Number(state.record?.beatmapId) !== Number(record.beatmapId)) return;
        const celebration = profileProgressSummary(profile.progress);
        if (!celebration) return;
        state = { ...state, report: `${state.report}${celebration}`.slice(0, Number(config().max_report_chars) || 1000), visibleUntil: displayDeadline(), updatedAt: Date.now() };
        saveState();
      }).catch(error => log(`Sync osu! après partie impossible : ${error.message}`)), 15000);
    }
  } catch (error) {
    if (generation !== analysisGeneration) return;
    log(`IA indisponible: ${error.message}`);
    state = { ...state, status: 'ready', provider: 'Analyse locale', visibleUntil: displayDeadline(), updatedAt: Date.now() };
    saveState();
  } finally { if (generation === analysisGeneration) busy = false; }
}

function cancelAnalysisForNewMap() {
  if (!busy) return;
  analysisGeneration++;
  if (activeAiChild) activeAiChild.kill();
  activeAiChild = null;
  busy = false;
  state = { status: 'idle', report: '', provider: '', record: null, visibleUntil: 0, updatedAt: Date.now() };
  log('Analyse annulée : une nouvelle map a démarré');
}

function cancelActiveAnalysis(reason) {
  if (!busy) return false;
  analysisGeneration++;
  if (activeAiChild) activeAiChild.kill();
  activeAiChild = null;
  busy = false;
  log(`Analyse annulée : ${reason}`);
  return true;
}

function launchDashboard() {
  const url = `http://127.0.0.1:${Number(config().coach_port) || DEFAULT_CONFIG.coach_port}/dashboard`;
  const child = spawn(POWERSHELL, ['-NoLogo', '-NoProfile', '-Command', `Start-Process '${url}'`], { windowsHide: true, detached: true, stdio: 'ignore' });
  child.unref();
}

function openDashboardIfNeeded() {
  if (dashboardOpenTimer) clearTimeout(dashboardOpenTimer);
  dashboardOpenTimer = setTimeout(() => {
    dashboardOpenTimer = null;
    if (gameStatus !== 'online') return;
    if (Date.now() - dashboardLastSeenAt < 12000) {
      log('Dashboard déjà ouvert : aucun nouvel onglet');
      return;
    }
    launchDashboard();
    log('Dashboard ouvert automatiquement dans le navigateur');
  }, 6000);
}

function sessionWelcome() {
  const lines = {
    training_companion: 'Nouvelle session en approche : les doigts se réveillent, les maps commencent déjà à négocier leur survie.',
    sarcastic: 'osu! redémarre. Les maps avaient pourtant demandé une ordonnance d’éloignement.',
    competitive: 'Nouvelle session détectée. Échauffement propre, puis on va chercher du progrès.',
    supportive: 'Nouvelle session : prends une map confortable, retrouve tes sensations et construis tranquillement.',
    analyst: 'Nouvelle session détectée : commence par une référence confortable avant de monter en difficulté.',
    balanced: 'Nouvelle session qui se prépare : une map tranquille pour chauffer les doigts, puis on voit qui humilie qui.',
  };
  return lines[config().personality] || lines.balanced;
}

function setGameOnline() {
  if (gameStatus === 'online') return;
  gameStatus = 'online';
  wasPlaying = false;
  wasResults = false;
  lastPlayData = null;
  ignoreResultsUntilPlay = true;
  state = { status: 'welcome', report: sessionWelcome(), provider: 'Nouvelle session', record: null, visibleUntil: displayDeadline(), updatedAt: Date.now() };
  log('osu! détecté par processus : nouvelle session');
  openDashboardIfNeeded();
}

function setGameOffline(reason = 'osu! fermé') {
  if (gameStatus === 'offline') return;
  gameStatus = 'offline';
  if (dashboardOpenTimer) { clearTimeout(dashboardOpenTimer); dashboardOpenTimer = null; }
  cancelActiveAnalysis(reason);
  wasPlaying = false;
  wasResults = false;
  lastPlayData = null;
  ignoreResultsUntilPlay = true;
  state = { status: 'offline', report: '', provider: '', record: null, visibleUntil: 0, updatedAt: Date.now() };
  log('osu! fermé : overlay masqué et session arrêtée');
}

function pollOsuProcess() {
  if (process.platform !== 'win32') return;
  const check = () => {
    if (processCheckRunning) return;
    processCheckRunning = true;
    const child = spawn('tasklist.exe', ['/FI', 'IMAGENAME eq osu!.exe', '/FO', 'CSV', '/NH'], { windowsHide: true });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.on('close', () => {
      processCheckRunning = false;
      if (/"osu!\.exe"/i.test(output)) setGameOnline();
      else setGameOffline('processus osu!.exe arrêté');
    });
    child.on('error', () => { processCheckRunning = false; });
  };
  check();
  setInterval(check, 2000);
}

function pollTosu() {
  log('Surveillance TOSU par API locale (500 ms)');
  let polling = false;
  setInterval(async () => {
    if (polling) return;
    polling = true;
    try {
      const response = await fetch(tosuApiUrl());
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      pollFailures = 0;
      if (process.platform !== 'win32' && gameStatus !== 'online') setGameOnline();
      if (gameStatus !== 'online') return;
      const result = data.resultsScreen || {};
      const isResults = /result/i.test(data.state?.name || '') || Boolean(result.playerName && (result.score || result.accuracy));
      const isPlaying = /^play$/i.test(data.state?.name || '') && Boolean(data.beatmap?.id);
      if (isPlaying) {
        ignoreResultsUntilPlay = false;
        if (!wasPlaying) {
          cancelAnalysisForNewMap();
          showSessionRecap();
          showMapStart(data);
        }
        lastPlayData = data;
      }
      if (isResults && !wasResults && !ignoreResultsUntilPlay) {
        analyze(data, data.play?.failed ? 'failed' : 'finished');
      } else if (wasPlaying && !isPlaying && !isResults && lastPlayData) {
        cancelActiveAnalysis('sortie volontaire de map');
        lastPlayData = null;
        state = { status: 'idle', report: '', provider: '', record: null, visibleUntil: 0, updatedAt: Date.now() };
        log('Sortie volontaire ignorée : aucun historique et aucune génération IA');
      }
      wasResults = isResults;
      wasPlaying = isPlaying;
    } catch {
      wasResults = false;
      pollFailures++;
      if (pollFailures >= 6 && process.platform !== 'win32') setGameOffline('osu! déconnecté de TOSU');
    } finally {
      polling = false;
    }
  }, 500);
}

function readRequestJson(req, maxBytes = 65536) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (Buffer.byteLength(body) > maxBytes) reject(new Error('Requête trop volumineuse'));
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('JSON invalide')); }
    });
    req.on('error', reject);
  });
}

function serveDashboard(pathname, res) {
  const files = { '/': 'index.html', '/dashboard': 'index.html', '/dashboard/': 'index.html', '/dashboard/app.js': 'app.js', '/dashboard/personality-options.js': 'personality-options.js', '/dashboard/styles.css': 'styles.css' };
  const name = files[pathname];
  if (!name) return false;
  const file = path.join(DASHBOARD_DIR, name);
  if (!fs.existsSync(file)) return false;
  res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript; charset=utf-8' : name.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8');
  res.end(fs.readFileSync(file));
  return true;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const requestUrl = new URL(req.url, 'http://127.0.0.1');
  const pathname = requestUrl.pathname;
  if (req.method === 'GET' && serveDashboard(pathname, res)) return;
  if (pathname === '/api/dashboard/heartbeat' && req.method === 'POST') {
    if (Date.now() - dashboardLastSeenAt >= 12000) log('Dashboard actif : heartbeat reçu');
    dashboardLastSeenAt = Date.now();
    return res.end(JSON.stringify({ ok: true }));
  }
  if (pathname === '/api/config' && req.method === 'GET') {
    const { osu_client_secret, ...publicConfig } = config();
    return res.end(JSON.stringify({ ...publicConfig, osu_client_secret: '', osu_client_secret_set: Boolean(String(osu_client_secret || '').trim()) }));
  }
  if (pathname === '/api/config' && req.method === 'POST') {
    try {
      const next = updatePublicConfig(await readRequestJson(req));
      log('Profil joueur mis à jour depuis le tableau de bord');
      const { osu_client_secret, ...publicNext } = next;
      return res.end(JSON.stringify({ ok: true, config: { ...publicNext, osu_client_secret: '', osu_client_secret_set: Boolean(String(osu_client_secret || '').trim()) } }));
    } catch (error) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: error.message }));
    }
  }
  if (pathname === '/api/osu/sync' && req.method === 'POST') {
    try {
      const profile = await syncOsuProfile();
      return res.end(JSON.stringify({ ok: true, profile }));
    } catch (error) {
      res.statusCode = 502;
      return res.end(JSON.stringify({ error: error.message }));
    }
  }
  if (pathname === '/api/sessions' && req.method === 'GET') {
    const limit = Math.max(1, Math.min(50, Number(requestUrl.searchParams.get('limit')) || 10));
    const sessions = splitSessions(history(), config().session_gap_minutes).slice(-limit).reverse().map(summarizeSession);
    return res.end(JSON.stringify(sessions));
  }
  if (pathname === '/api/progress' && req.method === 'GET') return res.end(JSON.stringify(progressByDay(history(), requestUrl.searchParams.get('days'))));
  if (pathname === '/api/warmup' && req.method === 'GET') return res.end(JSON.stringify(warmupRecommendations(history())));
  if (pathname === '/state') {
    const cfg = config();
    const rawOpacity = Number(cfg.overlay_background_opacity);
    const backgroundOpacity = cfg.overlay_show_background === false ? 0 : Math.max(0, Math.min(100, Number.isFinite(rawOpacity) ? Math.round(rawOpacity) : 100));
    return res.end(JSON.stringify({ ...state, language: resolveLanguage(), coachName: cfg.coach_name || 'Coach IA', gameStatus, displayMode: cfg.display_mode || 'timed', displaySeconds: Number(cfg.display_seconds) || 20, overlay: { accentColor: /^#[0-9a-f]{6}$/i.test(String(cfg.overlay_accent_color || '')) ? String(cfg.overlay_accent_color).toLowerCase() : '#ff66aa', backgroundOpacity, showBackground: backgroundOpacity > 0, showLogo: cfg.overlay_show_logo !== false } }));
  }
  if (pathname === '/history') return res.end(JSON.stringify(history()));
  if (pathname === '/preview') {
    if (!state.record) {
      const records = history();
      const record = records.at(-1);
      if (!record) {
        res.statusCode = 409;
        return res.end(JSON.stringify({ error: 'Aucun rapport disponible' }));
      }
      state = {
        status: 'ready',
        report: instantSummary(record, records.at(-2)),
        provider: 'Aperçu local',
        record,
        visibleUntil: 0,
        updatedAt: Date.now(),
      };
    }
    state = { ...state, visibleUntil: Date.now() + 60000, updatedAt: Date.now() };
    log('Aperçu du dernier rapport pendant 60 secondes');
    return res.end(JSON.stringify({ visible: true, visibleUntil: state.visibleUntil }));
  }
  if (pathname === '/analyze-current') {
    fetch(tosuApiUrl())
      .then(response => response.json())
      .then(data => analyze(data))
      .catch(error => log(`Analyse manuelle: ${error.message}`));
    res.statusCode = 202;
    return res.end(JSON.stringify({ accepted: true }));
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'not found' }));
});

server.on('error', error => { log(`Serveur: ${error.message}`); process.exitCode = 1; });

function main() {
  if (process.argv.includes('--test-providers')) {
    Promise.allSettled([runClaude('Réponds uniquement OK.'), runCodex('Réponds uniquement OK, sans outil.')])
      .then(results => {
        console.log(JSON.stringify({
          claude: results[0].status === 'fulfilled' && results[0].value.trim() === 'OK',
          codex: results[1].status === 'fulfilled' && results[1].value.trim() === 'OK',
          errors: results.map(result => result.status === 'rejected' ? result.reason.message : null),
        }));
        process.exit(results.every(result => result.status === 'fulfilled') ? 0 : 1);
      });
    return;
  }
  restoreLastReport();
  showSessionRecap();
  if (osuIntegrationReady()) syncOsuProfile().catch(error => log(`Sync osu! au démarrage impossible : ${error.message}`));
  const port = Number(config().coach_port) || DEFAULT_CONFIG.coach_port;
  server.listen(port, '127.0.0.1', () => { log(`Coach API sur http://127.0.0.1:${port}`); pollOsuProcess(); pollTosu(); });
}

if (require.main === module) main();

module.exports = { timingStats, recordFingerprint, offsetAdvice, instantSummary, makeRecord, retryStreak, fatigueAdvice, sessionTransition, sessionSummary, previousMapResult, bestMapResult, makeLiveRecord, mapStartSummary, removeUnscheduledBreakAdvice, sessionMemory, splitSessions, summarizeSession, progressByDay, personalityInstruction, warmupRecommendations, displayDeadline, coachingKnowledge, pickRank, osuIntegrationReady, promptFor, profileProgressSummary };
