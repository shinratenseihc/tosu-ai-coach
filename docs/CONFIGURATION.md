# Configuration

Le fichier actif est `%LOCALAPPDATA%\TosuAICoach\config.json`, créé depuis `config.example.json`.

| Option | Défaut | Description |
|---|---:|---|
| `provider` | `auto` | `auto`, `claude` ou `codex` |
| `claude_first` | `true` | Ordre du fallback en mode `auto` |
| `language` | `auto` | Langue des réponses : `auto`, `fr`, `en`, `de`, `es`, etc. |
| `coach_name` | `Coach IA` | Nom affiché dans l’overlay et utilisé par le coach |
| `personality` | `balanced` | `balanced`, `supportive`, `sarcastic`, `competitive` ou `analyst` |
| `display_mode` | `timed` | `timed` masque le panneau après le délai ; `always` le garde visible |
| `display_seconds` | `20` | Durée d’affichage en mode temporisé, de 5 à 120 secondes |
| `overlay_accent_color` | `#ff66aa` | Couleur d’accent de l’overlay au format hexadécimal `#rrggbb` |
| `overlay_show_background` | `true` | Compatibilité : `false` équivaut à une opacité de 0 |
| `overlay_background_opacity` | `100` | Opacité du fond du panneau de 0 à 100 ; sous 50, une ombre portée garde le texte lisible |
| `overlay_show_logo` | `true` | Affiche le logo en haut de l’overlay |
| `history_limit` | `2000` | Parties conservées |
| `session_gap_minutes` | `90` | Temps sans partie avant une nouvelle session |
| `pause_cooldown_minutes` | `60` | Délai minimal entre deux conseils de pause |
| `failure_pause_minutes` | `15` | Durée minimale d’une série d’échecs avant de proposer une pause |
| `failure_pause_attempts` | `6` | Nombre minimal d’échecs consécutifs avant une pause |
| `performance_pause_minutes` | `30` | Durée minimale avant qu’une baisse de performance déclenche une pause |
| `max_report_chars` | `350` | Longueur maximale du texte affiché |
| `comfortable_stars` | `null` | Niveau d’étoiles confortable, par exemple `4.5` |
| `comfortable_stars_min` | `null` | Bas de la zone confortable, par exemple `4.5` |
| `comfortable_stars_max` | `null` | Haut de la zone confortable, par exemple `5.2` |
| `goals` | `[]` | Objectifs personnels et techniques |
| `weaknesses` | `[]` | Points faibles déclarés parmi les catégories ci-dessous |
| `current_rank` | `null` | Rank actuel facultatif |
| `rank_goal` | `null` | Objectif de rank facultatif |
| `osu_integration_enabled` | `false` | Active la connexion osu! ; voir [OSU_INTEGRATION.md](OSU_INTEGRATION.md) |
| `osu_username` | `""` | Nom d’utilisateur osu! utilisé par l’intégration optionnelle |
| `osu_client_id` | `""` | Client ID de ton application OAuth osu! personnelle |
| `osu_client_secret` | `""` | Client Secret associé ; stocké localement, jamais renvoyé par l’API |
| `osu_supporter` | `false` | Indique que les liens osu!direct peuvent être proposés |
| `allow_online_recommendations` | `false` | Consentement séparé pour chercher de nouvelles maps en ligne |
| `allow_knowledge_updates` | `false` | Consentement pour une future mise à jour en ligne de la base documentaire |
| `tosu_url` | `http://127.0.0.1:24050` | Adresse locale TOSU |
| `coach_port` | `24051` | Port local lu par l’overlay |

Redémarre le service après modification.

Exemple de profil joueur :

```json
{
  "comfortable_stars": 4.5,
  "goals": ["atteindre 97% d'accuracy", "être plus régulier sur les streams"],
  "current_rank": 180000,
  "rank_goal": 100000
}
```

Ces valeurs donnent du contexte au coach. Elles ne modifient ni osu! ni le profil en ligne et le coach ne promet jamais un gain de rank précis.

Points faibles utiles à renseigner :

- Aim : jumps, cross-screen, petits cercles, précision du curseur.
- Streams : streams longs, bursts, deathstreams, contrôle des doigts.
- Stamina : endurance des doigts et maintien de la précision.
- Speed : BPM élevés et vitesse de tapping.
- Lecture : AR élevé, AR faible, patterns complexes, densité, overlap.
- Rythme : changements de rythme, triples, doubles, alt, finger control.
- Technique : tech maps, sliders, aim control, flow aim.
- Régularité : accuracy, misses aléatoires, choke et constance mentale.
- Mods : Hidden, Hard Rock, Double Time ou Flashlight.

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
