const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_POWERSHELL = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';

function findExecutable(command, candidates = [], dependencies = {}) {
  const fsImpl = dependencies.fsImpl || fs;
  const spawnSyncImpl = dependencies.spawnSyncImpl || spawnSync;
  for (const candidate of candidates) if (candidate && fsImpl.existsSync(candidate)) return candidate;
  const found = spawnSyncImpl('where.exe', [command], { encoding: 'utf8', windowsHide: true });
  return found.status === 0 ? found.stdout.split(/\r?\n/).find(Boolean) || '' : '';
}

function compactAnswer(stdout, maxChars = 1000) {
  const compact = String(stdout || '').trim().replace(/\s+/g, ' ');
  if (!compact) throw new Error('réponse vide');
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, Math.max(1, maxChars - 1)).replace(/\s+\S*$/, '')}…`;
}

function createAiProviders(options) {
  const { rootDir, getConfig, log = () => {}, env = process.env, spawnImpl = spawn, spawnSyncImpl = spawnSync, fsImpl = fs, powershell = DEFAULT_POWERSHELL, runners = {} } = options;
  const claudePath = findExecutable('claude', [env.CLAUDE_PATH, path.join(env.USERPROFILE || '', '.local', 'bin', 'claude.exe')], { fsImpl, spawnSyncImpl });
  const codexPath = findExecutable('codex', [env.CODEX_PATH, path.join(env.APPDATA || '', 'npm', 'codex.ps1')], { fsImpl, spawnSyncImpl });
  let activeChild = null;

  function runProcess(executable, args, timeoutMs = 60000, stdinText = '') {
    return new Promise((resolve, reject) => {
      const child = spawnImpl(executable, args, { cwd: rootDir, windowsHide: true });
      activeChild = child;
      child.stdin.end(stdinText);
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => child.kill(), timeoutMs);
      child.stdout.on('data', chunk => { stdout += chunk.toString(); });
      child.stderr.on('data', chunk => { stderr += chunk.toString(); });
      child.on('error', reject);
      child.on('close', code => {
        clearTimeout(timer);
        if (activeChild === child) activeChild = null;
        if (code !== 0) return reject(new Error(stderr.trim() || `code ${code}`));
        try { resolve(compactAnswer(stdout, Number(getConfig().max_report_chars) || 1000)); }
        catch (error) { reject(error); }
      });
    });
  }

  function runClaude(prompt) {
    if (!claudePath) return Promise.reject(new Error('Claude CLI introuvable'));
    return runProcess(claudePath, ['-p', '--no-session-persistence', '--permission-mode', 'dontAsk', '--effort', 'low', prompt]);
  }

  function runCodex(prompt) {
    if (!codexPath) return Promise.reject(new Error('Codex CLI introuvable'));
    const args = ['exec', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only', '-C', rootDir];
    if (/\.ps1$/i.test(codexPath)) return runProcess(powershell, ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', codexPath, ...args], 60000, prompt);
    return runProcess(codexPath, args, 60000, prompt);
  }

  const providerRunners = { Claude: runners.Claude || runClaude, Codex: runners.Codex || runCodex };

  async function runAi(prompt) {
    const config = getConfig();
    if (config.provider === 'claude') return { provider: 'Claude', text: await providerRunners.Claude(prompt) };
    if (config.provider === 'codex') return { provider: 'Codex', text: await providerRunners.Codex(prompt) };
    const order = config.claude_first === false ? ['Codex', 'Claude'] : ['Claude', 'Codex'];
    let lastError;
    for (const name of order) {
      try { return { provider: name, text: await providerRunners[name](prompt) }; }
      catch (error) { lastError = error; log(`${name} indisponible: ${error.message}`); }
    }
    throw lastError;
  }

  function cancel() {
    if (!activeChild) return false;
    activeChild.kill();
    activeChild = null;
    return true;
  }

  return { runAi, runClaude: providerRunners.Claude, runCodex: providerRunners.Codex, cancel, paths: { claude: claudePath, codex: codexPath } };
}

module.exports = { createAiProviders, findExecutable, compactAnswer };
