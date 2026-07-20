const { spawn, spawnSync } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const DATA_DIR = process.env.TOSU_COACH_DATA_DIR || path.join(process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || ROOT, 'AppData', 'Local'), 'TosuAICoach');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const HISTORY_PATH = path.join(DATA_DIR, 'history.json');
const STATE_PATH = path.join(DATA_DIR, 'last-state.json');
const LOG_DIR = path.join(DATA_DIR, 'logs');
const LOG_PATH = path.join(LOG_DIR, 'coach.log');
const POWERSHELL = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
const DEFAULT_CONFIG = { provider: 'auto', claude_first: true, language: 'auto', history_limit: 2000, tosu_url: 'http://127.0.0.1:24050', coach_port: 24051 };

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
let exitCandidate = null;
let activeAiChild = null;
let analysisGeneration = 0;

function config() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
  catch { return { ...DEFAULT_CONFIG }; }
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

function saveState() {
  try { fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8'); } catch {}
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
      state = { ...saved, visibleUntil: Number.MAX_SAFE_INTEGER, updatedAt: Date.now() };
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
    visibleUntil: Number.MAX_SAFE_INTEGER,
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
  if (eligible.length < 5 || maps.size < 3) return null;
  const early = eligible.filter(record => record.timing.average < 0).length;
  const late = eligible.filter(record => record.timing.average > 0).length;
  if (Math.max(early, late) / eligible.length < 0.8) return null;
  const sorted = eligible.map(record => record.timing.average).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (Math.abs(median) < 8) return null;
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

function instantSummary(record, previous) {
  if (record.completion !== 'finished') {
    const jokes = record.completion === 'failed'
      ? ['La barre de vie a posé sa démission sans préavis.', 'Le retry vient officiellement de devenir ton meilleur ami.', 'La map t’a rendu à l’accueil avec accusé de réception.', 'On avait demandé un FC, pas une démonstration de gravité.', 'Ton curseur était présent, son avocat beaucoup moins.', 'Le rythme t’a vu arriver et a changé les serrures.']
      : ['Retraite stratégique validée, personne ne dira ragequit devant les témoins.', 'Tu as quitté la map avant qu’elle puisse déposer plainte.', 'Cette tentative rejoint discrètement le programme de protection des runs.', 'Le bouton Échap vient de gagner un point de performance.', 'On appellera ça une reconnaissance du terrain très, très prudente.', 'La map continue sans toi, elle devrait s’en remettre.'];
    return `${jokes[Math.floor(Date.now() / 1000) % jokes.length]} Tu as atteint ${record.progressPercent}% : on garde les données utiles et on prépare la revanche.`;
  }
  const parts = [];
  parts.push(`${record.accuracy.toFixed(2)}% • ${record.misses} miss${record.misses === 1 ? '' : 'es'} • ${record.combo}/${record.maxCombo}x`);
  if (record.timing.average < -8) parts.push(`timing plutôt early (${record.timing.average} ms)`);
  else if (record.timing.average > 8) parts.push(`timing plutôt late (+${record.timing.average} ms)`);
  else parts.push('timing bien centré');
  if (previous) {
    const delta = record.accuracy - previous.accuracy;
    if (delta > 0) parts.push(`+${delta.toFixed(2)}% d’acc : petit progrès, mais progrès quand même, on prend !`);
    else parts.push('Pas la game du siècle, mais elle nous montre exactement quoi travailler ensuite.');
  }
  return parts.join(' — ');
}

function promptFor(record, recent) {
  const language = resolveLanguage();
  return `Tu es le pote-coach osu! du joueur. Réponds obligatoirement en ${languageName(language)} (${language}), même si les données sont dans une autre langue. Tu parles comme un bon ami : naturel, énergique, un peu cynique, avec de la déconne et du chambrage affectueux, jamais méchant ni humiliant. Une mauvaise partie n'est jamais un échec : c'est une source d'information. Commence TOUJOURS par saluer un progrès, même minuscule, ou à défaut un élément utile appris pendant cette partie. Compare intelligemment avec l'historique, surtout la même beatmap si disponible, sans inventer de progrès absent des données. Si completion vaut "failed" ou "abandoned", constate qu'il n'a pas fini et invente un chambrage original lié à la map, au score ou aux statistiques. Varie les thèmes et les formulations : n'utilise pas systématiquement "skill issue", le sapin, le bouton retry ou la barre de vie. Ne traite pas l'accuracy partielle comme un score final. Ensuite donne 1 ou 2 conseils très concrets pour la prochaine tentative. Si offsetAdvice existe, mentionne exactement le changement d'offset universel proposé et précise que c'est un essai prudent ; sinon, ne parle jamais de modifier l'offset. Évite le ton tableau Excel, les banalités et les diagnostics médicaux. Réponse sans markdown, 500 caractères maximum. Distingue aim, speed, reading, timing et endurance seulement si les données le justifient. Partie: ${JSON.stringify(record)}. Historique récent: ${JSON.stringify(recent.slice(-10))}`;
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
      const answer = stdout.trim().replace(/\s+/g, ' ').slice(0, 500);
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
  const previous = records.length ? records[records.length - 1] : null;
  record.offsetAdvice = offsetAdvice([...records, record]);
  records.push(record);
  saveHistory(records);
  const visibleMs = (Number(config().display_seconds) || 45) * 1000;
  state = { status: 'analyzing', report: instantSummary(record, previous), provider: '', record, visibleUntil: Date.now() + visibleMs, updatedAt: Date.now() };
  log(`Analyse: ${record.artist} - ${record.title}`);
  try {
    const result = await runAi(promptFor(record, records.slice(0, -1)));
    if (generation !== analysisGeneration) return;
    state = { ...state, status: 'ready', report: result.text, provider: result.provider, visibleUntil: Date.now() + visibleMs, updatedAt: Date.now() };
    saveState();
  } catch (error) {
    if (generation !== analysisGeneration) return;
    log(`IA indisponible: ${error.message}`);
    state = { ...state, status: 'ready', provider: 'Analyse locale', visibleUntil: Date.now() + visibleMs, updatedAt: Date.now() };
    saveState();
  } finally { if (generation === analysisGeneration) busy = false; }
}

function cancelAnalysisForNewMap() {
  if (!busy) return;
  analysisGeneration++;
  if (activeAiChild) activeAiChild.kill();
  activeAiChild = null;
  busy = false;
  state = { ...state, status: 'ready', provider: 'Coach en pause', report: 'Nouvelle map lancée : analyse précédente annulée. Je garde mon souffle pour le prochain écran de résultats.', updatedAt: Date.now() };
  log('Analyse annulée : une nouvelle map a démarré');
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
      const result = data.resultsScreen || {};
      const isResults = /result/i.test(data.state?.name || '') || Boolean(result.playerName && (result.score || result.accuracy));
      const isPlaying = /^play$/i.test(data.state?.name || '') && Boolean(data.beatmap?.id);
      if (isPlaying) {
        if (!wasPlaying) cancelAnalysisForNewMap();
        lastPlayData = data;
        exitCandidate = null;
      }
      if (isResults && !wasResults) {
        exitCandidate = null;
        analyze(data, data.play?.failed ? 'failed' : 'finished');
      } else if (wasPlaying && !isPlaying && !isResults && lastPlayData) {
        exitCandidate = { data: lastPlayData, at: Date.now() };
      } else if (exitCandidate && !isPlaying && !isResults && Date.now() - exitCandidate.at >= 1500) {
        const candidate = exitCandidate;
        exitCandidate = null;
        analyze(candidate.data, candidate.data.play?.failed ? 'failed' : 'abandoned');
      }
      wasResults = isResults;
      wasPlaying = isPlaying;
    } catch {
      wasResults = false;
    } finally {
      polling = false;
    }
  }, 500);
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.url === '/state') return res.end(JSON.stringify({ ...state, language: resolveLanguage() }));
  if (req.url === '/history') return res.end(JSON.stringify(history()));
  if (req.url === '/preview') {
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
  if (req.url === '/analyze-current') {
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
  const port = Number(config().coach_port) || DEFAULT_CONFIG.coach_port;
  server.listen(port, '127.0.0.1', () => { log(`Coach API sur http://127.0.0.1:${port}`); pollTosu(); });
}

if (require.main === module) main();

module.exports = { timingStats, recordFingerprint, offsetAdvice, instantSummary, makeRecord };
