# TOSU AI Coach

Un coach osu! local qui transforme chaque fin de partie — réussite, fail ou abandon — en retour utile, suivi de progression et chambrage entre potes. Le but n’est pas d’afficher un tableau Excel de plus : le coach célèbre les petits progrès, tire une leçon des mauvaises games et propose une prochaine action concrète.

Il fonctionne avec **Claude CLI et/ou Codex CLI, sans clé API développeur**. Il réutilise la session déjà connectée à l’outil choisi : aucune clé à créer, aucun secret à copier et aucune facturation API séparée.

> « Sans API » signifie ici sans clé API ni intégration développeur à configurer. Claude CLI ou Codex CLI doit être installé et connecté avec un abonnement compatible ; leurs conditions et limites d’usage continuent de s’appliquer.

## Fonctionnalités

- Analyse automatique via l’API locale TOSU.
- Détection des maps terminées, fails et abandons.
- Conseils courts sur le timing, l’aim, la speed ou la lecture.
- Ton de pote : humour, cynisme et chambrage affectueux.
- Valorisation des progrès sans inventer de performance.
- Historique local et suivi entre les sessions.
- Recommandation prudente d’offset avec suffisamment de données cohérentes.
- Annulation de la génération si une nouvelle map commence.
- Bascule automatique entre Claude et Codex.
- Réponse dans la langue de Windows, avec possibilité de forcer une langue.
- Overlay portrait 9:16 permanent.
- Logo officiel TOSU AI Coach intégré à l’overlay.
- Données privées dans `%LOCALAPPDATA%\TosuAICoach`.

## Prérequis

- Windows 10 ou 11.
- [Node.js](https://nodejs.org/) 20 ou plus récent.
- [TOSU](https://github.com/tosuapp/tosu) 4.25 ou plus récent.
- osu!lazer ou osu!stable compatible avec TOSU.
- Claude CLI ou Codex CLI installé et connecté.

## Installation rapide

Dans PowerShell, depuis le dossier du projet :

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\install.ps1
```

L’installateur détecte TOSU lorsqu’il tourne, copie le counter, initialise les données et crée un raccourci de démarrage Windows.

Ensuite :

1. Lance TOSU et osu!.
2. Appuie sur `Shift+F2` dans osu!.
3. Active `Coach IA` et place le panneau.
4. Termine ou abandonne une map.

## Données utilisateur

```text
%LOCALAPPDATA%\TosuAICoach\
├── config.json
├── history.json
├── last-state.json
├── install.json
└── logs\
    └── coach.log
```

Ces fichiers sont créés automatiquement et ne doivent jamais être commités. Une mise à jour du programme ne supprime pas la progression.

## Fournisseurs IA

Dans `%LOCALAPPDATA%\TosuAICoach\config.json` :

```json
{
  "provider": "auto",
  "claude_first": true,
  "language": "auto"
}
```

- `auto` essaie les deux fournisseurs dans l’ordre choisi.
- `claude` utilise uniquement Claude CLI.
- `codex` utilise uniquement Codex CLI.
- `language: auto` suit la langue de Windows ; une valeur comme `fr`, `en`, `de` ou `ja` force la langue des réponses.

Les exécutables sont détectés automatiquement. `CLAUDE_PATH` et `CODEX_PATH` permettent de forcer un chemin.

## Documentation

- [Configuration](docs/CONFIGURATION.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Développement et forks](docs/DEVELOPMENT.md)
- [Dépannage](docs/TROUBLESHOOTING.md)
- [Vie privée](docs/PRIVACY.md)
- [Contribuer](CONTRIBUTING.md)
- [Sécurité](SECURITY.md)

## Développement

```powershell
npm test
npm run check
node coach-service.js
```

Le projet n’a aucune dépendance npm en production.

## Statut et licence

Le projet est jeune : les formats peuvent évoluer avant la version 1.0. Contributions et retours sont bienvenus. Licence [MIT](LICENSE).
