const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

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

function publicConfig(config) {
  const { osu_client_secret, ...safe } = config;
  return { ...safe, osu_client_secret: '', osu_client_secret_set: Boolean(String(osu_client_secret || '').trim()) };
}

function isTrustedLocalOrigin(req, configuredPort) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    const hostPort = new URL(`http://${req.headers.host || `127.0.0.1:${configuredPort}`}`).port;
    const expectedPort = hostPort || String(configuredPort || 80);
    return parsed.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(parsed.hostname) && (parsed.port || '80') === expectedPort;
  } catch { return false; }
}

function createCoachServer(options) {
  const {
    dashboardDir, getConfig, updateConfig, syncOsuProfile, getSessions, getProgress, getWarmup,
    getState, setState, getGameStatus, resolveLanguage, getHistory, instantSummary,
    analyzeCurrent, dashboardHeartbeat, log = () => {}, httpImpl = http, fsImpl = fs,
  } = options;

  function serveDashboard(pathname, res) {
    const files = { '/': 'index.html', '/dashboard': 'index.html', '/dashboard/': 'index.html', '/dashboard/app.js': 'app.js', '/dashboard/personality-options.js': 'personality-options.js', '/dashboard/styles.css': 'styles.css' };
    const name = files[pathname];
    if (!name) return false;
    const file = path.join(dashboardDir, name);
    if (!fsImpl.existsSync(file)) return false;
    res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript; charset=utf-8' : name.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8');
    res.end(fsImpl.readFileSync(file));
    return true;
  }

  const server = httpImpl.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const requestUrl = new URL(req.url, 'http://127.0.0.1');
    const pathname = requestUrl.pathname;
    if (pathname === '/state' && req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.statusCode = 204;
      return res.end();
    }
    const actionPaths = new Set(['/api/config', '/api/osu/sync', '/analyze-current', '/preview', '/api/dashboard/heartbeat']);
    if (actionPaths.has(pathname) && !(pathname === '/api/config' && req.method === 'GET')) {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        return res.end(JSON.stringify({ error: 'méthode non autorisée' }));
      }
      if (!isTrustedLocalOrigin(req, Number(getConfig().coach_port) || 24051)) {
        res.statusCode = 403;
        return res.end(JSON.stringify({ error: 'origine non autorisée' }));
      }
    }
    if (req.method === 'GET' && serveDashboard(pathname, res)) return;
    if (pathname === '/api/dashboard/heartbeat' && req.method === 'POST') {
      dashboardHeartbeat();
      return res.end(JSON.stringify({ ok: true }));
    }
    if (pathname === '/api/config' && req.method === 'GET') return res.end(JSON.stringify(publicConfig(getConfig())));
    if (pathname === '/api/config' && req.method === 'POST') {
      try { return res.end(JSON.stringify({ ok: true, config: publicConfig(updateConfig(await readRequestJson(req))) })); }
      catch (error) { res.statusCode = 400; return res.end(JSON.stringify({ error: error.message })); }
    }
    if (pathname === '/api/osu/sync' && req.method === 'POST') {
      try { return res.end(JSON.stringify({ ok: true, profile: await syncOsuProfile() })); }
      catch (error) { res.statusCode = 502; return res.end(JSON.stringify({ error: error.message })); }
    }
    if (pathname === '/api/sessions' && req.method === 'GET') return res.end(JSON.stringify(getSessions(requestUrl.searchParams.get('limit'))));
    if (pathname === '/api/progress' && req.method === 'GET') return res.end(JSON.stringify(getProgress(requestUrl.searchParams.get('days'))));
    if (pathname === '/api/warmup' && req.method === 'GET') return res.end(JSON.stringify(getWarmup()));
    if (pathname === '/state' && req.method === 'GET') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      const cfg = getConfig();
      const rawOpacity = Number(cfg.overlay_background_opacity);
      const backgroundOpacity = cfg.overlay_show_background === false ? 0 : Math.max(0, Math.min(100, Number.isFinite(rawOpacity) ? Math.round(rawOpacity) : 100));
      return res.end(JSON.stringify({ ...getState(), language: resolveLanguage(), coachName: cfg.coach_name || 'Coach IA', gameStatus: getGameStatus(), displayMode: cfg.display_mode || 'timed', displaySeconds: Number(cfg.display_seconds) || 20, overlay: { accentColor: /^#[0-9a-f]{6}$/i.test(String(cfg.overlay_accent_color || '')) ? String(cfg.overlay_accent_color).toLowerCase() : '#ff66aa', backgroundOpacity, showBackground: backgroundOpacity > 0, showLogo: cfg.overlay_show_logo !== false } }));
    }
    if (pathname === '/history') return res.end(JSON.stringify(getHistory()));
    if (pathname === '/preview' && req.method === 'POST') {
      let state = getState();
      if (!state.record) {
        const records = getHistory();
        const record = records.at(-1);
        if (!record) { res.statusCode = 409; return res.end(JSON.stringify({ error: 'Aucun rapport disponible' })); }
        state = { status: 'ready', report: instantSummary(record, records.at(-2)), provider: 'Aperçu local', record, visibleUntil: 0, updatedAt: Date.now() };
      }
      state = { ...state, visibleUntil: Date.now() + 60000, updatedAt: Date.now() };
      setState(state);
      log('Aperçu du dernier rapport pendant 60 secondes');
      return res.end(JSON.stringify({ visible: true, visibleUntil: state.visibleUntil }));
    }
    if (pathname === '/analyze-current' && req.method === 'POST') {
      analyzeCurrent();
      res.statusCode = 202;
      return res.end(JSON.stringify({ accepted: true }));
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'not found' }));
  });
  server.on('error', error => { log(`Serveur: ${error.message}`); process.exitCode = 1; });
  return server;
}

module.exports = { createCoachServer, isTrustedLocalOrigin, publicConfig, readRequestJson };
