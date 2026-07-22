# TOSU AI Coach

<p align="center">
  <img src="logo.png" alt="TOSU AI Coach" width="420">
</p>

<p align="center"><strong>Un coach osu! local, utile, drôle et sans facturation API IA séparée.</strong></p>

TOSU AI Coach observe tes parties via l’API locale de TOSU, suit ta progression et affiche dans osu! un retour court avec motivation, conseil concret ou chambrage affectueux.

Avant même de lancer une map, il peut afficher son nombre de parties officiel osu!, les tentatives de la session et ton meilleur passage connu. Après un résultat terminé ou un fail, il utilise Codex CLI ou Claude Code pour produire un coaching personnalisé. Une sortie volontaire avec `Échap` reste silencieuse et n’est pas enregistrée.

> Le coach n’utilise pas directement les API payantes OpenAI ou Anthropic. Il réutilise une CLI déjà connectée à ton compte ChatGPT ou Claude. Les quotas et conditions de ton forfait continuent de s’appliquer. L’intégration osu! optionnelle utilise, elle, les identifiants OAuth gratuits de ta propre application osu!.

## Fonctionnalités

- Détection de la map sélectionnée, du lancement, des résultats, fails et sorties volontaires.
- Compteur officiel osu! avant lancement pour les 100 maps les plus jouées, avec fallback sur l’historique local.
- Meilleure référence connue de la difficulté : score, accuracy, misses, combo et PP.
- Position temporelle des erreurs croisée avec les zones où les joueurs échouent souvent, sans inventer leur cause.
- Température communautaire humoristique à la sélection, sans afficher ni conserver les commentaires ou pseudos.
- Pote-commentateur génératif après 3 secondes sur la même map : réaction Claude/Codex courte, mise en cache pour la session et annulée immédiatement si la sélection change ou si la partie démarre.
- Coaching court sur l’aim, la speed, la lecture, le rythme et la régularité.
- Historique local, sessions, progression sur 7/30 jours et routine d’échauffement.
- Six personnalités : équilibré, compagnon d’entraînement, bienveillant, sarcastique, compétiteur et analyste.
- Overlay portrait personnalisable : couleur, logo, opacité, affichage permanent ou temporisé.
- Annulation immédiate d’une génération devenue obsolète.
- Fallback automatique entre Claude et Codex.
- Tableau de bord strictement local sur `127.0.0.1`.

## Prérequis

- Windows 10 ou 11.
- [Node.js 20 ou plus récent](https://nodejs.org/).
- [TOSU 4.25 ou plus récent](https://github.com/tosuapp/tosu/releases).
- osu!stable ou osu!lazer compatible avec TOSU.
- Codex CLI, Claude Code, ou les deux.
- Une connexion Internet pour le fournisseur IA et, si activée, l’intégration osu!.

## 1. Choisir et connecter un fournisseur IA

Le coach n’embarque aucun modèle. Une CLI doit être installée, authentifiée et capable de répondre avant l’installation du coach.

### Option A — Codex avec un compte ChatGPT

Codex est actuellement proposé avec les forfaits ChatGPT Free, Go, Plus, Pro, Business, Enterprise et Edu, avec des capacités et limites différentes. Free et Go conviennent surtout à un usage léger ; les forfaits supérieurs offrent davantage de capacité. Cette disponibilité peut évoluer : consulte toujours la [page officielle des forfaits ChatGPT](https://chatgpt.com/pricing) avant de choisir.

```powershell
npm install -g @openai/codex
codex
```

Au premier lancement, choisis la connexion avec ChatGPT et termine l’authentification dans le navigateur. Une clé API OpenAI facturée séparément est également possible dans Codex, mais elle n’est pas nécessaire pour ce projet.

Documentation officielle : [Codex CLI](https://developers.openai.com/codex/cli).

### Option B — Claude Code avec Claude Pro ou Max

Claude Code peut utiliser un abonnement Claude Pro ou Max. Il peut aussi utiliser un compte Anthropic Console avec facturation à l’usage, séparée de l’abonnement Claude.

Installation Windows recommandée par Anthropic :

```powershell
winget install Anthropic.ClaudeCode
claude
```

Au premier lancement, choisis Claude.ai pour utiliser ton forfait Pro/Max, ou Anthropic Console si tu acceptes sa facturation API. Git for Windows est recommandé mais Claude Code peut aussi utiliser PowerShell.

L’ancien paquet npm reste disponible, mais il demande désormais Node.js 22 ou plus pour une installation sans avertissement :

```powershell
npm install -g @anthropic-ai/claude-code
```

> Si la variable `ANTHROPIC_API_KEY` existe sur ton PC, Claude Code peut utiliser cette clé et facturer la Console au lieu de consommer le quota inclus dans ton abonnement. Vérifie-la si tu veux rester strictement sur Pro/Max.

Documentation officielle : [installer Claude Code](https://docs.anthropic.com/en/docs/claude-code/getting-started) et [utiliser Pro ou Max](https://support.anthropic.com/fr/articles/11145838-utilisation-de-claude-code-avec-votre-forfait-pro-ou-max).

Tu peux installer les deux. En mode `auto`, le coach essaie le fournisseur prioritaire puis bascule sur l’autre en cas de quota ou d’indisponibilité.

> Aucun MCP, plugin Codex, connecteur ChatGPT ou extension Claude n’est requis.

## 2. Télécharger et installer le coach

Télécharge le code depuis la [dernière GitHub Release](https://github.com/shinratenseihc/tosu-ai-coach/releases/latest) et décompresse l’archive, ou clone le dépôt :

```powershell
git clone https://github.com/shinratenseihc/tosu-ai-coach.git
cd tosu-ai-coach
```

Lance TOSU, puis ouvre PowerShell dans le dossier du projet :

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\install.ps1
```

L’installateur détecte TOSU, copie le counter, installe le service dans `%LOCALAPPDATA%\Programs\TosuAICoach`, conserve les données dans `%LOCALAPPDATA%\TosuAICoach` et crée un démarrage automatique Windows.

Si TOSU n’est pas détecté, l’installateur demande le dossier qui contient son répertoire `static`.

## 3. Activer l’overlay

1. Lance TOSU et osu!.
2. Dans osu!, ouvre l’éditeur TOSU avec `Shift+F2`.
3. Active `Coach IA`, place le panneau et ajuste sa taille.
4. Sélectionne une map : son contexte doit apparaître avant son lancement.
5. Termine une map pour obtenir un coaching complet.

Le bouton `Settings` de la carte Coach IA dans TOSU ouvre le tableau de bord local. Tu peux aussi visiter [http://127.0.0.1:24051/dashboard](http://127.0.0.1:24051/dashboard).

## 4. Vérifier l’installation

Depuis le dossier du projet :

```powershell
.\scripts\doctor.ps1
node coach-service.js --test-providers
```

Au moins un fournisseur doit répondre. Sinon, relance `codex` ou `claude` dans un terminal, vérifie la connexion et le quota, puis recommence.

## 5. Connexion osu! optionnelle

L’intégration osu! récupère le profil public, le rank, les PP, les meilleurs scores publics, le compteur des maps les plus jouées, les zones d’échec de la difficulté et les commentaires publics du beatmapset. Ces derniers servent uniquement à calculer une ambiance anonyme et ne sont ni affichés ni conservés. Elle ne nécessite ni abonnement osu!supporter ni accès payant.

Chaque utilisateur crée gratuitement sa propre application OAuth osu!, puis saisit son Client ID et son Client Secret dans le tableau de bord. Le secret reste local et n’est jamais renvoyé par l’API du coach.

Tutoriel complet : [Connexion osu!](docs/OSU_INTEGRATION.md).

Sans cette intégration, la détection TOSU, l’historique local et le coaching continuent de fonctionner ; seul le contexte officiel osu! manque.

## Tableau de bord et données

Le dashboard permet de configurer la personnalité, la zone d’étoiles, les objectifs, les points faibles, l’overlay, les fournisseurs et l’intégration osu!. Il affiche aussi les sessions et la progression.

Les données privées résident dans :

```text
%LOCALAPPDATA%\TosuAICoach\
├── config.json
├── history.json
├── last-state.json
├── install.json
└── logs\coach.log
```

Une mise à jour ne supprime pas la progression. Ces fichiers sont ignorés par Git.

## Documentation

- [Connexion osu!](docs/OSU_INTEGRATION.md)
- [Configuration](docs/CONFIGURATION.md)
- [Dépannage](docs/TROUBLESHOOTING.md)
- [Vie privée](docs/PRIVACY.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Base de connaissances coaching](docs/COACHING_KNOWLEDGE.md)
- [Développement et forks](docs/DEVELOPMENT.md)
- [Contribuer](CONTRIBUTING.md)
- [Sécurité](SECURITY.md)
- [Historique des versions](CHANGELOG.md)

## Mise à jour et désinstallation

Pour mettre à jour, télécharge la nouvelle version et relance `scripts\install.ps1`. Les données existantes sont conservées.

Pour désinstaller :

```powershell
.\scripts\uninstall.ps1
```

Le script propose de conserver les données utilisateur.

## À propos de ce projet

Ce projet est un outil personnel que j’utilise réellement pour mes sessions osu!. Il a été développé en grande partie avec l’aide d’assistants IA (« vibe coding »), par curiosité et pour le plaisir. Je ne prétends pas être développeur professionnel ni expert officiel osu!. Le projet est partagé tel quel afin que d’autres puissent l’essayer, l’améliorer ou s’en inspirer.

TOSU AI Coach est un projet communautaire expérimental, sans affiliation avec osu!, TOSU, OpenAI, Anthropic ou leurs équipes. Il ne promet ni coaching parfait, ni gain de rank, ni disponibilité permanente des services tiers. Retours et contributions sont bienvenus.

## Développement

```powershell
npm test
npm run check
node coach-service.js
```

Le projet n’a aucune dépendance npm en production. Licence [MIT](LICENSE).
