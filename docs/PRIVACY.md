# Vie privée

Le projet est local-first. Il enregistre dans `%LOCALAPPDATA%\TosuAICoach` les statistiques TOSU, la beatmap, le nom exposé par TOSU, l’historique de timing, les rapports et les logs techniques.

Pour un conseil, la CLI reçoit la partie courante et jusqu’à dix entrées récentes. Elle utilise la session de l’utilisateur ; le projet ne reçoit ni ne stocke ses identifiants ChatGPT, Claude ou Anthropic Console. Les conditions du fournisseur restent applicables.

Si l’intégration osu! est activée, le Client ID et le Client Secret de l’application personnelle sont stockés dans `config.json`. Ils servent uniquement à obtenir un token public auprès de `osu.ppy.sh`. Le secret est masqué dans les réponses de l’API locale et n’est jamais envoyé au fournisseur IA.

Avant de joindre un historique, un état ou un log à une issue, retire les données que tu ne souhaites pas publier. Ces fichiers sont ignorés par Git.
