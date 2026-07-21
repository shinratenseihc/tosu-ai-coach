const fs = require('node:fs');
const path = require('node:path');

function createStorage({ rootDir, defaultConfig, env = process.env, fsImpl = fs }) {
  const dataDir = env.TOSU_COACH_DATA_DIR || path.join(env.LOCALAPPDATA || path.join(env.USERPROFILE || rootDir, 'AppData', 'Local'), 'TosuAICoach');
  const paths = {
    dataDir,
    config: path.join(dataDir, 'config.json'),
    history: path.join(dataDir, 'history.json'),
    state: path.join(dataDir, 'last-state.json'),
    profileHistory: path.join(dataDir, 'profile-history.json'),
    logDir: path.join(dataDir, 'logs'),
    log: path.join(dataDir, 'logs', 'coach.log'),
  };
  let cachedConfig = null;
  let cachedConfigMtime = 0;

  function initialize() {
    fsImpl.mkdirSync(paths.logDir, { recursive: true });
    for (const [name, destination] of Object.entries({ 'config.json': paths.config, 'history.json': paths.history, 'last-state.json': paths.state })) {
      const source = path.join(rootDir, name);
      if (!fsImpl.existsSync(destination) && fsImpl.existsSync(source)) fsImpl.copyFileSync(source, destination);
    }
    if (!fsImpl.existsSync(paths.config)) fsImpl.writeFileSync(paths.config, JSON.stringify(defaultConfig, null, 2), 'utf8');
    if (!fsImpl.existsSync(paths.history)) fsImpl.writeFileSync(paths.history, '[]\n', 'utf8');
    if (!fsImpl.existsSync(paths.profileHistory)) fsImpl.writeFileSync(paths.profileHistory, '[]\n', 'utf8');
  }

  function config() {
    try {
      const mtime = fsImpl.statSync(paths.config).mtimeMs;
      if (!cachedConfig || mtime !== cachedConfigMtime) {
        cachedConfig = JSON.parse(fsImpl.readFileSync(paths.config, 'utf8'));
        cachedConfigMtime = mtime;
      }
      return cachedConfig;
    } catch { return { ...defaultConfig }; }
  }

  function readJson(file, fallback) {
    try { return JSON.parse(fsImpl.readFileSync(file, 'utf8')); } catch { return fallback; }
  }

  function history() { return readJson(paths.history, []); }
  function saveHistory(records) { fsImpl.writeFileSync(paths.history, JSON.stringify(records.slice(-(Number(config().history_limit) || 2000)), null, 2), 'utf8'); }
  function saveConfig(next) { fsImpl.writeFileSync(paths.config, `${JSON.stringify(next, null, 2)}\n`, 'utf8'); }
  function saveState(state) { try { fsImpl.writeFileSync(paths.state, JSON.stringify(state, null, 2), 'utf8'); } catch {} }
  function appendLog(line) { try { fsImpl.appendFileSync(paths.log, `${line}\n`, 'utf8'); } catch {} }
  function saveProfileHistory(records) { fsImpl.writeFileSync(paths.profileHistory, `${JSON.stringify(records.slice(-500), null, 2)}\n`, 'utf8'); }

  return { appendLog, config, history, initialize, paths, readJson, saveConfig, saveHistory, saveProfileHistory, saveState };
}

module.exports = { createStorage };
