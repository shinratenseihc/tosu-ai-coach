const { timingStats } = require('./stats.js');
const { normalizeMods } = require('./mods.js');

function makeRecord(data, completion = 'finished', now = new Date()) {
  const result = data.resultsScreen || {};
  const play = data.play || {};
  const beatmap = data.beatmap || {};
  const hits = Object.keys(result.hits || {}).length && result.accuracy ? result.hits : (play.hits || {});
  return {
    timestamp: new Date(now).toISOString(), player: result.playerName || play.playerName || data.profile?.name || '',
    beatmapId: beatmap.id || 0, setId: beatmap.set || 0, artist: beatmap.artist || '', title: beatmap.title || '', difficulty: beatmap.version || '',
    stars: beatmap.stats?.stars?.total || beatmap.stats?.stars?.live || 0, aim: beatmap.stats?.stars?.aim || 0, speed: beatmap.stats?.stars?.speed || 0, reading: beatmap.stats?.stars?.reading || 0,
    bpm: beatmap.stats?.bpm?.common || 0, score: result.score || play.score || 0, accuracy: result.accuracy || play.accuracy || 0,
    combo: result.maxCombo || play.combo?.current || 0, maxCombo: beatmap.stats?.maxCombo || 0,
    misses: Number(hits['0'] || 0), hit50: Number(hits['50'] || 0), hit100: Number(hits['100'] || 0), hit300: Number(hits['300'] || 0),
    sliderBreaks: Number(hits.sliderBreaks || play.hits?.sliderBreaks || 0), mods: normalizeMods(result.mods) || normalizeMods(play.mods),
    pp: result.pp?.current || play.pp?.current || 0, ppFc: result.pp?.fc || play.pp?.fc || 0,
    failed: completion === 'failed', completion,
    progressPercent: Math.max(0, Math.min(100, Math.round(Number(beatmap.time?.live || 0) / Math.max(1, Number(beatmap.time?.lastObject || beatmap.time?.mp3Length || 1)) * 100))),
    timing: timingStats(play.hitErrorArray),
  };
}

function makeLiveRecord(data, previous = null) {
  const record = makeRecord(data, 'playing');
  record.phase = 'playing';
  record.previousScore = previous ? { timestamp: previous.timestamp, score: previous.score, accuracy: previous.accuracy, combo: previous.combo, maxCombo: previous.maxCombo, misses: previous.misses, pp: previous.pp } : null;
  return record;
}

function warmupRecommendations(records, profile = {}) {
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
    if (best) selected.push({ label: labels[index], beatmapId: best.beatmapId, setId: best.setId, artist: best.artist, title: best.title, difficulty: best.difficulty, stars: best.stars, bpm: best.bpm, accuracy: best.accuracy, misses: best.misses, url: best.setId ? `https://osu.ppy.sh/beatmapsets/${best.setId}#osu/${best.beatmapId}` : `https://osu.ppy.sh/beatmaps/${best.beatmapId}` });
  }
  return selected;
}

function mapStartSummary(record, profile = {}, personality = 'balanced') {
  const previous = record.previousScore;
  const comfortMin = Number(profile.comfortableStarsMin || profile.comfortableStars);
  const comfortMax = Number(profile.comfortableStarsMax || profile.comfortableStars);
  const level = comfortMin && comfortMax ? (Number(record.stars) > comfortMax ? ` Défi à +${(Number(record.stars) - comfortMax).toFixed(2)}★ au-dessus de ta zone confort : priorité à la survie et à l’apprentissage.` : Number(record.stars) < comfortMin ? ' Map sous ta zone confort : vise surtout la propreté.' : ' Map dans ta zone confort : bonne référence pour mesurer ta régularité.') : '';
  const motivation = ({ supportive: 'Respire, installe ton rythme et construis le run.', sarcastic: 'La map croit encore que ton ancien score suffit. C’est mignon.', competitive: 'Cible verrouillée. Va chercher mieux.', analyst: 'Référence chargée : cherche un gain propre, pas un miracle.', training_companion: 'On joue, on répète, on apprend — et si la map se fait humilier au passage, tant mieux.', balanced: 'La cible est posée : à toi de lui faire prendre sa retraite.' })[personality] || 'La cible est posée : à toi de lui faire prendre sa retraite.';
  if (!previous) return `Première référence sur cette difficulté. Finis proprement pour poser une base à battre. ${motivation}${level}`;
  return `Meilleur score : ${Number(previous.accuracy).toFixed(2)}% • ${previous.misses} miss • ${previous.combo}${previous.maxCombo ? `/${previous.maxCombo}` : ''}x${previous.pp ? ` • ${Number(previous.pp).toFixed(1)}pp` : ''}. ${motivation}${level}`;
}

function selectedMapSummary(record, personality = 'balanced') {
  const localTotal = Number(record.totalAttempts) || 0;
  const onlineTotal = Number.isFinite(Number(record.osuPlayCount)) ? Number(record.osuPlayCount) : null;
  const total = onlineTotal ?? localTotal;
  const session = Number(record.sessionAttempts) || 0;
  const taunt = ({
    supportive: 'Tu connais le terrain : pose ton rythme et fais-toi confiance.',
    sarcastic: 'Elle t’a reconnu aussi. Essaie de lui laisser un meilleur souvenir cette fois.',
    competitive: 'La cible est connue. Maintenant, impose-lui un nouveau score.',
    analyst: 'Données chargées. Cherche une amélioration propre et mesurable.',
    training_companion: 'On remet une pièce dans la machine : répétition, apprentissage, puis humiliation de la map.',
    balanced: 'La revanche est servie. À toi de décider qui repart vexé.',
  })[personality] || 'La revanche est servie. À toi de décider qui repart vexé.';
  if (!total) {
    const firstPlayLines = {
      supportive: [
        'Nouvelle map pour le coach. Prends le temps de la découvrir, le premier run sert surtout à comprendre le terrain.',
        'Aucune référence pour l’instant. Joue-la à ton rythme et on verra ce qu’elle raconte.',
        'Découverte en cours : pas de score à défendre, juste une première base à construire tranquillement.',
      ],
      sarcastic: [
        'Dossier vide sur cette map. Elle n’a encore aucune idée de ce qui lui arrive, profite de l’effet de surprise.',
        'Première donnée à récolter. Essaie de laisser autre chose qu’un rapport d’accident.',
        'Map inconnue au bataillon. On entre, on observe, et on improvise avec un sérieux très relatif.',
      ],
      competitive: [
        'Aucune référence sur cette difficulté. Premier objectif : finir et poser un score à battre.',
        'Terrain inconnu. Construis une première base propre, on attaquera les chiffres ensuite.',
        'Premier passage enregistré par le coach. Lis la map, termine-la, puis on parlera optimisation.',
      ],
      analyst: [
        'Pas encore de données sur cette difficulté. Ce run servira de référence initiale.',
        'Échantillon vide. Priorité au repérage des patterns et à une première mesure complète.',
        'Nouvelle difficulté détectée : établis une base avant toute conclusion sur la performance.',
      ],
      training_companion: [
        'Nouvelle map dans notre collection. On visite, on clique des cercles et on fait semblant d’avoir un plan.',
        'Le coach n’a aucun dossier sur celle-ci. Parfait : aucune preuve de nos futures bêtises.',
        'Terrain inconnu. On part en reconnaissance avec du courage, deux touches et une confiance probablement excessive.',
        'Première balade ici. Si ça se passe bien, talent ; sinon, étude scientifique très sérieuse.',
      ],
      balanced: [
        'Nouvelle difficulté pour le coach. Premier passage : découvre la map et pose une base utile.',
        'Pas encore de référence ici. On explore d’abord, on réglera les comptes plus tard.',
        'Terrain inconnu. Finis un premier run et on aura enfin quelque chose de concret à analyser.',
        'Le dossier de cette map est encore vide. À toi d’écrire la première ligne.',
      ],
    };
    const lines = firstPlayLines[personality] || firstPlayLines.balanced;
    const seed = Number(record.beatmapId || 0) + Math.floor(new Date(record.timestamp || 0).getTime() / 1000);
    return lines[Math.abs(seed) % lines.length];
  }
  const attempts = `${total} partie${total > 1 ? 's' : ''} au total${onlineTotal !== null ? ' selon osu!' : ` enregistrée${total > 1 ? 's' : ''} par le coach`}`;
  const sessionText = session ? `, dont ${session} dans cette session` : '';
  const best = record.previousScore ? ` Meilleur passage : ${Number(record.previousScore.accuracy).toFixed(2)}% • ${record.previousScore.misses} miss.` : '';
  return `Déjà jouée : ${attempts}${sessionText}.${best} ${taunt}`;
}

function instantSummary(record, previous, now = Date.now()) {
  if (record.completion !== 'finished') {
    if (record.progressPercent >= 90) return `À ${record.progressPercent}%, quitter c’est presque une performance artistique : je comprends, ce score aurait fait trop peur au classement. On garde la leçon et on revient le chercher.`;
    if (record.retryStreak >= 5) return `${record.retryStreak}e tentative sur cette map : à ce stade ce n’est plus de l’entêtement, c’est une relation toxique. Change de map quelques runs pour casser la boucle.`;
    const jokes = record.completion === 'failed'
      ? ['La barre de vie a posé sa démission sans préavis.', 'Le retry vient officiellement de devenir ton meilleur ami.', 'La map t’a rendu à l’accueil avec accusé de réception.', 'On avait demandé un FC, pas une démonstration de gravité.', 'Ton curseur était présent, son avocat beaucoup moins.', 'Le rythme t’a vu arriver et a changé les serrures.']
      : ['Retraite stratégique validée, personne ne dira ragequit devant les témoins.', 'Tu as quitté la map avant qu’elle puisse déposer plainte.', 'Cette tentative rejoint discrètement le programme de protection des runs.', 'Le bouton Échap vient de gagner un point de performance.', 'On appellera ça une reconnaissance du terrain très, très prudente.', 'La map continue sans toi, elle devrait s’en remettre.'];
    return `${jokes[Math.floor(now / 1000) % jokes.length]} Tu as atteint ${record.progressPercent}% : on garde les données utiles et on prépare la revanche.`;
  }
  const parts = [`${record.accuracy.toFixed(2)}% • ${record.misses} miss${record.misses === 1 ? '' : 'es'} • ${record.combo}/${record.maxCombo}x`];
  if (record.timing.average < -8) parts.push(`timing plutôt early (${record.timing.average} ms)`);
  else if (record.timing.average > 8) parts.push(`timing plutôt late (+${record.timing.average} ms)`);
  else {
    const timingLines = ['tes frappes sont plutôt bien calées', 'le timing tient la route sur cette partie', 'pas de gros décalage de timing à signaler', 'tes clics restent dans une zone assez propre', 'le métronome intérieur fait son boulot'];
    parts.push(timingLines[Math.floor(now / 1000) % timingLines.length]);
  }
  if (previous) {
    const accuracyDelta = record.accuracy - previous.accuracy;
    const scoreDelta = Number(record.score) - Number(previous.score || 0);
    const ppDelta = Number(record.pp) - Number(previous.pp || 0);
    const missDelta = Number(previous.misses || 0) - Number(record.misses || 0);
    if (ppDelta >= 0.05) parts.push(`+${ppDelta.toFixed(1)}pp sur ta référence : oui, ça se fête !`);
    else if (scoreDelta > 0) parts.push(`nouveau meilleur score : +${scoreDelta.toLocaleString('fr-FR')} points, la répétition paie !`);
    else if (accuracyDelta > 0) parts.push(`+${accuracyDelta.toFixed(2)}% d’acc : progrès validé, on prend !`);
    else if (missDelta > 0) parts.push(`${missDelta} miss${missDelta > 1 ? 'es' : ''} de moins : le run devient plus solide.`);
    else {
      const learningLines = ['Cette tentative n’a pas tout donné, mais elle a laissé des indices utiles.', 'On n’encadre pas encore le replay, mais on sait déjà quoi régler ensuite.', 'Le résultat pique un peu ; les données, elles, sont exploitables.', 'Ce run n’entre pas au musée, mais il nous donne une piste claire.', 'Pas besoin de dramatiser : on récupère l’info et on repart plus malin.'];
      parts.push(learningLines[Math.floor(now / 1000) % learningLines.length]);
    }
  }
  return parts.join(' — ');
}

module.exports = { instantSummary, makeLiveRecord, makeRecord, mapStartSummary, selectedMapSummary, warmupRecommendations };
