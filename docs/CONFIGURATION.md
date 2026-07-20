# Configuration

Le fichier actif est `%LOCALAPPDATA%\TosuAICoach\config.json`, créé depuis `config.example.json`.

| Option | Défaut | Description |
|---|---:|---|
| `provider` | `auto` | `auto`, `claude` ou `codex` |
| `claude_first` | `true` | Ordre du fallback en mode `auto` |
| `language` | `auto` | Langue des réponses : `auto`, `fr`, `en`, `de`, `es`, etc. |
| `history_limit` | `2000` | Parties conservées |
| `tosu_url` | `http://127.0.0.1:24050` | Adresse locale TOSU |
| `coach_port` | `24051` | Port local lu par l’overlay |

Redémarre le service après modification.

## CLI

La détection utilise les variables d’environnement, les emplacements habituels puis `where.exe` :

```powershell
$env:CLAUDE_PATH = 'C:\chemin\claude.exe'
$env:CODEX_PATH = 'C:\chemin\codex.ps1'
```

## API locale

- `GET /state` : état et dernier rapport.
- `GET /history` : historique local.
- `GET /preview` : réaffiche le dernier rapport.
- `GET /analyze-current` : analyse l’état TOSU courant.
