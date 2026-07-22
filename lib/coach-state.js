function clone(value) {
  return structuredClone(value);
}

function createCoachState({ initial, onChange = () => {} }) {
  let state = clone(initial);

  function get() {
    return clone(state);
  }

  function set(next) {
    state = { ...clone(next), updatedAt: Math.max(Date.now(), Number(state.updatedAt || 0) + 1) };
    const snapshot = get();
    onChange(snapshot);
    return snapshot;
  }

  function applyIfCurrent(match, patch) {
    if (match.status !== undefined && state.status !== match.status) return false;
    if (match.beatmapId !== undefined && Number(state.record?.beatmapId) !== Number(match.beatmapId)) return false;
    set({ ...state, ...clone(patch) });
    return true;
  }

  return { applyIfCurrent, get, set };
}

module.exports = { createCoachState };
