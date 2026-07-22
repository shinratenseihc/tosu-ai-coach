function modItems(mods) {
  if (Array.isArray(mods)) return mods;
  if (Array.isArray(mods?.array)) return mods.array;
  return [];
}

function normalizeMods(mods) {
  if (typeof mods === 'string') return mods === 'NM' ? '' : mods;
  const name = String(mods?.name || '').trim();
  if (name && name !== 'NM') return name;
  return modItems(mods).map(mod => typeof mod === 'string' ? mod : mod?.acronym).filter(Boolean).join('');
}

function modsSignature(mods) {
  const items = modItems(mods).map(mod => typeof mod === 'string' ? mod : { acronym: mod?.acronym || '', settings: mod?.settings || null });
  return `${normalizeMods(mods)}|${Number(mods?.rate) || 1}|${JSON.stringify(items)}`;
}

function selectionSignature(data) {
  return `${Number(data?.beatmap?.id) || 0}|${modsSignature(data?.play?.mods)}`;
}

module.exports = { modsSignature, normalizeMods, selectionSignature };
