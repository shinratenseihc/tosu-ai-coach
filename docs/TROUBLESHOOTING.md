# Dépannage

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
