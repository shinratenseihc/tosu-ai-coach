const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const osuApi = require('./osu-api.js');
const { createAiProviders } = require('./lib/ai-providers.js');
const { buildPrompt, coachingKnowledge, personalityInstruction, removeUnscheduledBreakAdvice } = require('./lib/coaching.js');
const stats = require('./lib/stats.js');
const { createStorage } = require('./lib/storage.js');
const { createGameMonitor } = require('./lib/game-monitor.js');
const { createCoachServer } = require('./lib/server.js');
const sessions = require('./lib/sessions.js');
const { localDateKey, progressByDay, sessionMemory, sessionSummary, sessionTransition, splitSessions, summarizeSession } = sessions;
const recordFunctions = require('./lib/records.js');
const { instantSummary, makeLiveRecord, makeRecord, mapStartSummary, selectedMapSummary } = recordFunctions;

const ROOT = __dirname;
const DASHBOARD_DIR = path.join(ROOT, 'dashboard');
const POWERSHELL = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
const DEFAULT_CONFIG = { provider: 'auto', claude_first: true, language: 'auto', coach_name: 'Coach IA', personality: 'balanced', display_mode: 'timed', display_seconds: 20, overlay_accent_color: '#ff66aa', overlay_show_background: true, overlay_background_opacity: 100, overlay_show_logo: true, history_limit: 2000, session_gap_minutes: 90, pause_cooldown_minutes: 60, failure_pause_minutes: 15, failure_pause_attempts: 6, performance_pause_minutes: 30, max_report_chars: 1000, comfortable_stars: null, comfortable_stars_min: null, comfortable_stars_max: null, goals: [], weaknesses: [], current_rank: null, rank_goal: null, rank_region: '', osu_integration_enabled: false, osu_username: '', osu_client_id: '', osu_client_secret: '', osu_supporter: false, allow_online_recommendations: false, allow_knowledge_updates: false, tosu_url: 'http://127.0.0.1:24050', coach_port: 24051 };
const storage = createStorage({ rootDir: ROOT, defaultConfig: DEFAULT_CONFIG });
storage.initialize();
const STATE_PATH = storage.paths.state;
const PROFILE_HISTORY_PATH = storage.paths.profileHistory;

let state = { status: 'idle', report: '', provider: '', record: null, visibleUntil: 0, updatedAt: Date.now() };
let busy = false;
let lastFingerprint = '';
let analysisGeneration = 0;
let lastSessionNotice = '';
let gameStatus = 'unknown';
let cachedOsuProfile = null;
let dashboardLastSeenAt = 0;
let dashboardOpenTimer = null;

function config() {
  return storage.config();
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
  storage.appendLog(line);
}

const aiProviders = createAiProviders({ rootDir: ROOT, getConfig: config, log });

function history() {
  return storage.history();
}

function saveHistory(records) {
  storage.saveHistory(records);
}

function saveConfig(next) {
  storage.saveConfig(next);
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
  storage.saveProfileHistory(snapshots);
  return next;
}

function readJson(file, fallback) {
  return storage.readJson(file, fallback);
}

function saveState() {
  storage.saveState(state);
}

function displayDeadline(seconds = config().display_seconds) {
  return config().display_mode === 'always' ? Number.MAX_SAFE_INTEGER : Date.now() + (Number(seconds) || 20) * 1000;
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

function restoreLastReport() {
  const records = history();
  const latest = records.at(-1);
  if (latest) lastFingerprint = stats.recordFingerprint(latest);
  try {
    const saved = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    if (saved?.record && saved?.report) {
      state = { ...saved, visibleUntil: config().display_mode === 'always' ? Number.MAX_SAFE_INTEGER : 0, updatedAt: Date.now() };
      return;
    }
  } catch {}
  const record = records.at(-1);
  if (!record) return;
  state = { status: 'ready', report: instantSummary(record, records.at(-2)), provider: 'Dernière analyse', record, visibleUntil: config().display_mode === 'always' ? Number.MAX_SAFE_INTEGER : 0, updatedAt: Date.now() };
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
    storage.saveProfileHistory(snapshots);
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

function warmupRecommendations(items, profile = playerProfile()) {
  return recordFunctions.warmupRecommendations(items, profile);
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
  const previous = stats.bestMapResult(history(), beatmapId);
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

async function onlinePlayCountForBeatmap(beatmapId) {
  const cfg = config();
  if (!osuIntegrationReady(cfg)) return null;
  const profile = cachedOsuProfile || await osuApi.fetchUser(String(cfg.osu_client_id).trim(), String(cfg.osu_client_secret).trim(), String(cfg.osu_username).trim());
  cachedOsuProfile = profile;
  const maps = await osuApi.fetchUserMostPlayed(String(cfg.osu_client_id).trim(), String(cfg.osu_client_secret).trim(), profile.id, 100);
  return maps.find(item => Number(item.beatmapId) === Number(beatmapId))?.count ?? null;
}

function showMapSelection(data) {
  const beatmapId = Number(data.beatmap?.id || 0);
  if (!beatmapId) return;
  const records = history();
  const attempts = records.filter(record => Number(record.beatmapId) === beatmapId);
  const previous = stats.bestMapResult(records, beatmapId);
  const memory = sessionMemory(records, config().session_gap_minutes);
  const sessionTrack = memory.tracks.find(track => Number(track.beatmapId) === beatmapId);
  const latestTime = new Date(records.at(-1)?.timestamp || 0).getTime();
  const sessionIsActive = Number.isFinite(latestTime) && Date.now() - latestTime < Math.max(1, Number(config().session_gap_minutes) || 90) * 60000;
  const record = makeLiveRecord(data, previous);
  record.phase = 'selected';
  record.totalAttempts = attempts.length;
  record.sessionAttempts = sessionIsActive ? sessionTrack?.attempts || 0 : 0;
  state = { status: 'selected', report: selectedMapSummary(record, config().personality), provider: 'Map sélectionnée', record, visibleUntil: displayDeadline(), updatedAt: Date.now() };
  onlinePlayCountForBeatmap(beatmapId).then(playCount => {
    if (playCount === null || state.status !== 'selected' || Number(state.record?.beatmapId) !== beatmapId) return;
    state.record.osuPlayCount = playCount;
    state.report = selectedMapSummary(state.record, config().personality);
    state.provider = 'Compteur officiel osu!';
    state.updatedAt = Date.now();
  }).catch(error => log(`Compteur osu! indisponible pour la beatmap ${beatmapId} : ${error.message}`));
}

function promptFor(record, recent) {
  const language = resolveLanguage();
  const memory = sessionMemory([...recent, record], config().session_gap_minutes);
  return buildPrompt({ record, recent, config: config(), language, languageLabel: languageName(language), profile: playerProfile(), memory });
}

async function analyze(data, completion = 'finished') {
  if (busy) return;
  const generation = ++analysisGeneration;
  const record = makeRecord(data, completion);
  const fingerprint = stats.recordFingerprint(record);
  if (!record.beatmapId || fingerprint === lastFingerprint) return;
  lastFingerprint = fingerprint;
  busy = true;
  const records = history();
  const localPrevious = stats.previousMapResult(records, record.beatmapId);
  const liveOnlineBest = Number(state.record?.beatmapId) === Number(record.beatmapId) ? state.record?.onlineBest : null;
  const previous = liveOnlineBest && (!localPrevious || Number(liveOnlineBest.score) > Number(localPrevious.score)) ? liveOnlineBest : localPrevious;
  record.previousScore = previous ? {
    timestamp: previous.timestamp, score: previous.score, accuracy: previous.accuracy,
    combo: previous.combo, maxCombo: previous.maxCombo, misses: previous.misses, pp: previous.pp,
  } : null;
  record.offsetAdvice = stats.offsetAdvice([...records, record]);
  record.retryStreak = completion === 'finished' ? 0 : stats.retryStreak(records, record.beatmapId) + 1;
  record.fatigueAdvice = stats.fatigueAdvice([...records, record], config());
  records.push(record);
  saveHistory(records);
  state = { status: 'analyzing', report: instantSummary(record, previous), provider: '', record, visibleUntil: displayDeadline(), updatedAt: Date.now() };
  log(`Analyse: ${record.artist} - ${record.title}`);
  try {
    const result = await aiProviders.runAi(promptFor(record, records.slice(0, -1)));
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
  aiProviders.cancel();
  busy = false;
  state = { status: 'idle', report: '', provider: '', record: null, visibleUntil: 0, updatedAt: Date.now() };
  log('Analyse annulée : une nouvelle map a démarré');
}

function cancelActiveAnalysis(reason) {
  if (!busy) return false;
  analysisGeneration++;
  aiProviders.cancel();
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

function handleGameOnline() {
  if (gameStatus === 'online') return;
  gameStatus = 'online';
  state = { status: 'welcome', report: sessionWelcome(), provider: 'Nouvelle session', record: null, visibleUntil: displayDeadline(), updatedAt: Date.now() };
  log('osu! détecté par processus : nouvelle session');
  openDashboardIfNeeded();
}

function handleGameOffline(reason = 'osu! fermé') {
  if (gameStatus === 'offline') return;
  gameStatus = 'offline';
  if (dashboardOpenTimer) { clearTimeout(dashboardOpenTimer); dashboardOpenTimer = null; }
  cancelActiveAnalysis(reason);
  state = { status: 'offline', report: '', provider: '', record: null, visibleUntil: 0, updatedAt: Date.now() };
  log('osu! fermé : overlay masqué et session arrêtée');
}

const gameMonitor = createGameMonitor({
  getTosuUrl: tosuApiUrl,
  log,
  onOnline: handleGameOnline,
  onOffline: handleGameOffline,
  onMapSelected: showMapSelection,
  onMapStart: data => {
    cancelAnalysisForNewMap();
    showSessionRecap();
    showMapStart(data);
  },
  onResult: analyze,
  onAbandon: () => {
    cancelActiveAnalysis('sortie volontaire de map');
    state = { status: 'idle', report: '', provider: '', record: null, visibleUntil: 0, updatedAt: Date.now() };
    log('Sortie volontaire ignorée : aucun historique et aucune génération IA');
  },
});

const server = createCoachServer({
  dashboardDir: DASHBOARD_DIR,
  getConfig: config,
  updateConfig: input => {
    const next = updatePublicConfig(input);
    log('Profil joueur mis à jour depuis le tableau de bord');
    return next;
  },
  syncOsuProfile,
  getSessions: requestedLimit => {
    const limit = Math.max(1, Math.min(50, Number(requestedLimit) || 10));
    return splitSessions(history(), config().session_gap_minutes).slice(-limit).reverse().map(records => summarizeSession(records, config().session_gap_minutes));
  },
  getProgress: days => progressByDay(history(), days),
  getWarmup: () => warmupRecommendations(history()),
  getState: () => state,
  setState: next => { state = next; },
  getGameStatus: () => gameStatus,
  resolveLanguage,
  getHistory: history,
  instantSummary,
  analyzeCurrent: () => {
    fetch(tosuApiUrl()).then(response => response.json()).then(data => analyze(data)).catch(error => log(`Analyse manuelle: ${error.message}`));
  },
  dashboardHeartbeat: () => {
    if (Date.now() - dashboardLastSeenAt >= 12000) log('Dashboard actif : heartbeat reçu');
    dashboardLastSeenAt = Date.now();
  },
  log,
});

function main() {
  if (process.argv.includes('--test-providers')) {
    Promise.allSettled([aiProviders.runClaude('Réponds uniquement OK.'), aiProviders.runCodex('Réponds uniquement OK, sans outil.')])
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
  server.listen(port, '127.0.0.1', () => { log(`Coach API sur http://127.0.0.1:${port}`); gameMonitor.pollOsuProcess(); gameMonitor.pollTosu(); });
}

if (require.main === module) main();

module.exports = { ...stats, ...sessions, ...recordFunctions, removeUnscheduledBreakAdvice, personalityInstruction, warmupRecommendations, displayDeadline, coachingKnowledge, pickRank, osuIntegrationReady, promptFor, profileProgressSummary, restoreLastReport };
