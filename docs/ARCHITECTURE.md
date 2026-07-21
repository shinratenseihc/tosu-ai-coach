# Architecture

```text
osu! → TOSU /json/v2 → coach-service.js → lib/ai-providers.js → Claude CLI ou Codex CLI
                              ↓                       ↓
                     historique local          rapport court
                              ↓                       ↓
                    API locale :24051 ← overlay TOSU 9:16
```

`lib/coaching.js` construit le contexte envoyé au fournisseur IA, retire l’UR du prompt et filtre les conseils de pause non autorisés.

`lib/stats.js` centralise les calculs purs de timing, d’offset, de fatigue, de tentatives et de meilleures références par beatmap.

Le service interroge TOSU toutes les 500 ms sur l’interface loopback. Sous Windows, il contrôle aussi toutes les 2 secondes la présence réelle de `osu!.exe` afin de distinguer un jeu fermé d’un état TOSU résiduel. Aucun port n’est exposé au réseau local.

## Cycle d’une partie

1. Le service détecte `play` et conserve le dernier instantané utile.
2. Un résultat produit `finished` ou `failed`.
3. Une sortie volontaire avant l’écran de résultats est ignorée : aucun historique et aucun appel IA.
4. Après un redémarrage du jeu, les anciens résultats encore exposés par TOSU sont ignorés jusqu’au lancement d’une nouvelle map.
5. La partie est enregistrée avant l’appel IA.
6. Une synthèse locale apparaît immédiatement.
7. Claude ou Codex la remplace par un coaching personnalisé.
7. Une nouvelle map tue le processus IA et invalide sa réponse.

## Stockage

Les données résident dans `%LOCALAPPDATA%\TosuAICoach`. `TOSU_COACH_DATA_DIR` permet un dossier isolé pour les tests.

## Offset

Une recommandation universelle exige 5 parties terminées uniques sur 3 beatmaps, au moins 100 objets jugés par partie, un biais cohérent à 80 % et une erreur médiane d’au moins 8 ms. Elle est plafonnée à ±20 ms. Fails et abandons sont exclus.

## Sécurité

- Services liés à `127.0.0.1`.
- Aucun token stocké.
- Sous-processus IA sans persistance conversationnelle.
- Codex en sandbox lecture seule.
