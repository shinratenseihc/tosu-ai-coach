const { spawn } = require('node:child_process');

function classifyTosuState(data) {
  const result = data?.resultsScreen || {};
  return {
    isResults: /result/i.test(data?.state?.name || '') || Boolean(result.playerName && (result.score || result.accuracy)),
    isPlaying: /^play$/i.test(data?.state?.name || '') && Boolean(data?.beatmap?.id),
    isSelected: /^selectPlay$/i.test(data?.state?.name || '') && Boolean(data?.beatmap?.id),
  };
}

function createGameMonitor(options) {
  const {
    getTosuUrl,
    log = () => {},
    onOnline = () => {},
    onOffline = () => {},
    onMapStart = () => {},
    onPlayUpdate = () => {},
    onMapSelected = () => {},
    onResult = () => {},
    onAbandon = () => {},
    platform = process.platform,
    spawnImpl = spawn,
    fetchImpl = fetch,
    setIntervalImpl = setInterval,
  } = options;
  let gameStatus = 'unknown';
  let wasPlaying = false;
  let wasResults = false;
  let lastPlayData = null;
  let ignoreResultsUntilPlay = true;
  let pollFailures = 0;
  let lastSelectedBeatmapId = null;
  let processCheckRunning = false;

  function resetPlayState() {
    wasPlaying = false;
    wasResults = false;
    lastPlayData = null;
    ignoreResultsUntilPlay = true;
    lastSelectedBeatmapId = null;
  }

  function setOnline() {
    if (gameStatus === 'online') return;
    gameStatus = 'online';
    resetPlayState();
    onOnline();
  }

  function setOffline(reason = 'osu! fermé') {
    if (gameStatus === 'offline') return;
    gameStatus = 'offline';
    resetPlayState();
    onOffline(reason);
  }

  function processTosuData(data) {
    pollFailures = 0;
    if (platform !== 'win32' && gameStatus !== 'online') setOnline();
    if (gameStatus !== 'online') return;
    const { isPlaying, isResults, isSelected } = classifyTosuState(data);
    if (isSelected) {
      const beatmapId = Number(data.beatmap.id);
      if (beatmapId !== lastSelectedBeatmapId) onMapSelected(data);
      lastSelectedBeatmapId = beatmapId;
    }
    if (isPlaying) {
      lastSelectedBeatmapId = null;
      ignoreResultsUntilPlay = false;
      if (!wasPlaying) onMapStart(data);
      onPlayUpdate(data);
      lastPlayData = data;
    }
    if (isResults && !wasResults && !ignoreResultsUntilPlay) {
      onResult(data, data.play?.failed ? 'failed' : 'finished');
    } else if (wasPlaying && !isPlaying && !isResults && lastPlayData) {
      onAbandon(lastPlayData);
      lastPlayData = null;
    }
    wasResults = isResults;
    wasPlaying = isPlaying;
  }

  function pollOsuProcess() {
    if (platform !== 'win32') return;
    const check = () => {
      if (processCheckRunning) return;
      processCheckRunning = true;
      const child = spawnImpl('tasklist.exe', ['/FI', 'IMAGENAME eq osu!.exe', '/FO', 'CSV', '/NH'], { windowsHide: true });
      let output = '';
      child.stdout.on('data', chunk => { output += chunk; });
      child.on('close', () => {
        processCheckRunning = false;
        if (/"osu!\.exe"/i.test(output)) setOnline();
        else setOffline('processus osu!.exe arrêté');
      });
      child.on('error', () => { processCheckRunning = false; });
    };
    check();
    setIntervalImpl(check, 2000);
  }

  function pollTosu() {
    log('Surveillance TOSU par API locale (500 ms)');
    let polling = false;
    setIntervalImpl(async () => {
      if (polling) return;
      polling = true;
      try {
        const response = await fetchImpl(getTosuUrl());
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        processTosuData(await response.json());
      } catch {
        wasResults = false;
        pollFailures++;
        if (pollFailures >= 6 && platform !== 'win32') setOffline('osu! déconnecté de TOSU');
      } finally { polling = false; }
    }, 500);
  }

  return { pollOsuProcess, pollTosu, processTosuData, setOffline, setOnline, status: () => gameStatus };
}

module.exports = { classifyTosuState, createGameMonitor };
