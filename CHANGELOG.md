# Historique des versions

Les changements importants de TOSU AI Coach sont documentés ici.

## 0.3.1 — 2026-07-22

### Corrigé

- Accès cross-origin limité à la lecture de l’état par l’overlay ; les actions refusent désormais les origines web externes.
- Routes d’analyse et d’aperçu limitées aux requêtes `POST`.
- Options de recommandations et de mises à jour en ligne désactivées dans le dashboard tant qu’elles ne sont pas disponibles.

### Modifié

- Vérification syntaxique automatique de tous les fichiers JavaScript du projet.
- Validation de configuration, gestion de l’état, limitation des rapports et client osu! centralisés dans des modules testables.
- Couverture de tests étendue aux règles CORS, à la configuration, au client osu! et aux transitions d’état.

## 0.3.0 — 2026-07-21

### Ajouté

- Détection de la beatmap dès sa sélection dans TOSU.
- Message immédiat avant lancement avec motivation ou taunt adapté à la personnalité.
- Compteur officiel osu! des maps les plus jouées, tentatives de session et meilleur passage connu.
- Tableau de bord local pour le profil, les sessions, la progression et la personnalisation de l’overlay.
- Intégration osu! optionnelle pour le profil, le rank, les PP et les scores publics.
- Six personnalités, dont le compagnon d’entraînement.
- Routine d’échauffement, mémoire de session et suivi de progression.
- Autoscroll des rapports longs et réglages de couleur, logo et opacité.
- CI GitHub Actions sur Node.js 20.

### Modifié

- Architecture découpée en modules spécialisés sous `lib/`.
- Sorties volontaires avec `Échap` désormais silencieuses et non enregistrées.
- Conseils de pause et d’offset rendus plus prudents.
- Documentation d’installation, des fournisseurs IA et de l’intégration osu! entièrement révisée.

### Sécurité

- Service et dashboard limités à `127.0.0.1`.
- Client Secret osu! masqué dans l’API locale.
- Codex exécuté en sandbox lecture seule et Claude sans persistance de session.

## 0.2.0 — 2026-07-20

- Première version publique du coach local TOSU avec overlay, historique et fallback Claude/Codex.
