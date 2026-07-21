# Développement et forks

```powershell
git clone <url-du-fork>
cd tosu-ai-coach
npm test
npm run check
```

Node.js 20+ suffit ; aucune dépendance npm n’est nécessaire.

Pour isoler les données :

```powershell
$env:TOSU_COACH_DATA_DIR = "$PWD\.tmp-data"
node coach-service.js
```

## Organisation

```text
coach-service.js       Service, détection et historique
lib/ai-providers.js    Exécution, fallback et annulation des fournisseurs IA
counter/               Overlay web TOSU
scripts/               Installation et diagnostic Windows
tests/                 Tests Node natifs
docs/                  Documentation thématique
```

## Règles

- Ne jamais committer clé, historique ou log.
- Ajouter un test pour toute régression de calcul.
- Garder les services sur `127.0.0.1`.
- Préserver le fallback local sans IA.
- Garder les conseils d’offset conservateurs.

## Nouveau fournisseur

Son runner doit retourner une chaîne courte, avoir un timeout et supporter l’annulation. Ne journalise jamais les identifiants. Ajoute-le à `lib/ai-providers.js`, avec tests et documentation.

## Overlay

Le counter est en HTML/CSS/JavaScript sans bundler. Teste les changements en 360×640 sur fond transparent.
