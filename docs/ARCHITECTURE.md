# Architecture

```text
osu! → TOSU /json/v2 → coach-service.js → Claude CLI ou Codex CLI
                              ↓                       ↓
                     historique local          rapport court
                              ↓                       ↓
                    API locale :24051 ← overlay TOSU 9:16
```

Le service interroge TOSU toutes les 500 ms sur l’interface loopback. Aucun port n’est exposé au réseau local.

## Cycle d’une partie

1. Le service détecte `play` et conserve le dernier instantané utile.
2. Un résultat produit `finished` ou `failed`.
3. Un retour au menu sans résultat pendant 1,5 seconde produit `abandoned`.
4. La partie est enregistrée avant l’appel IA.
5. Une synthèse locale apparaît immédiatement.
6. Claude ou Codex la remplace par un coaching personnalisé.
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
