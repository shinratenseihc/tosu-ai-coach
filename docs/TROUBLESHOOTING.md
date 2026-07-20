# Dépannage

## Aucun rapport IA

Le coach nécessite Codex CLI ou Claude Code installé **et connecté**. Un MCP n’est ni requis ni utilisé.

```powershell
.\scripts\doctor.ps1
node coach-service.js --test-providers
```

Si Codex échoue, lance `codex` et termine la connexion ChatGPT. Si Claude échoue, lance `claude` et termine la connexion Claude.ai ou Anthropic Console. Vérifie également la connexion Internet et le quota du forfait.

Commence par `scripts\doctor.ps1`.

## Overlay absent

1. Vérifie `http://127.0.0.1:24050`.
2. Appuie sur `Shift+F2` dans osu!.
3. Active `Coach IA`.
4. Vérifie `http://127.0.0.1:24051/state`.
5. Consulte `%LOCALAPPDATA%\TosuAICoach\logs\coach.log`.

## Ancienne partie affichée

Le dernier rapport reste visible jusqu’au suivant. Termine, fail ou abandonne une nouvelle map.

## Fournisseur indisponible

```powershell
node coach-service.js --test-providers
```

Vérifie que la CLI est installée, connectée et sous sa limite d’usage.

## Erreur `skin.ini` sur lazer

Cet endpoint peut être indisponible sur lazer. Ce n’est pas une panne du coach.

## Réinitialisation

Arrête le service, sauvegarde puis renomme `%LOCALAPPDATA%\TosuAICoach`. Le prochain lancement recrée les fichiers.
