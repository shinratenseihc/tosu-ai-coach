function plainText(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/https?:\/\/\S+/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
}

function communityMood(comments = []) {
  const messages = comments.map(item => plainText(item.message)).filter(Boolean).slice(0, 30);
  if (messages.length < 3) return null;
  const saltyWords = /\b(fuck|shit|trash|garbage|worst|hate|stupid|bullshit|merde|nul(?:le)?|pourri|déteste|putain|cancer|dogshit|ass)\b/i;
  const praiseWords = /\b(love|great|amazing|best|banger|fun|good|clean|j'adore|incroyable|excellent|masterpiece|goat)\b/i;
  const painWords = /\b(hard|pain|suffer|death|impossible|brutal|difficile|souffrance|mourir|rip|help|farm)\b/i;
  const salty = messages.filter(message => saltyWords.test(message)).length;
  const praise = messages.filter(message => praiseWords.test(message)).length;
  const pain = messages.filter(message => painWords.test(message)).length;
  let kind = 'mixed';
  if (salty >= Math.max(2, Math.ceil(messages.length * 0.2))) kind = 'salty';
  else if (pain >= Math.max(2, praise)) kind = 'danger';
  else if (praise >= Math.max(2, pain)) kind = 'hype';
  const reports = {
    salty: ['Température communautaire : sel industriel. La section commentaires a perdu son permis de courtoisie.', 'Température communautaire : le débat a quitté la route et traversé trois jardins.', 'Température communautaire : plusieurs commentaires ont été écrits avec les dents serrées.', 'Température communautaire : la diplomatie est partie acheter du lait et n’est jamais revenue.'],
    danger: ['Température communautaire : les commentaires parlent comme des survivants. La map semble avoir quelques dents.', 'Température communautaire : ambiance panneau DANGER écrit au marqueur. On entre quand même.', 'Température communautaire : la foule conseille un casque, une assurance et des doigts de rechange.', 'Température communautaire : bulletin météo défavorable, avec risque localisé de disparition du combo.'],
    hype: ['Température communautaire : gros enthousiasme. La map a son fan-club, reste à voir si elle mérite son avocat.', 'Température communautaire : ça sent le banger approuvé par la foule. À toi de vérifier sans te faire plier.', 'Température communautaire : standing ovation virtuelle. Essaie de garder ton combo assez longtemps pour applaudir aussi.', 'Température communautaire : la foule est déjà debout. Pas de pression, elle voulait sûrement juste se dégourdir les jambes.'],
    mixed: ['Température communautaire : débat de comptoir certifié osu!. Certains applaudissent, d’autres cherchent encore leur combo.', 'Température communautaire : avis partagés et dignité variable. Bref, une journée normale sur osu!.', 'Température communautaire : personne n’est d’accord, ce qui constitue une forme rare d’unanimité.', 'Température communautaire : moitié fan-club, moitié cellule de crise. Terrain intéressant.'],
  };
  return { kind, sampleSize: messages.length, report: reports[kind][(messages.length + salty + pain) % reports[kind].length] };
}

module.exports = { communityMood, plainText };
