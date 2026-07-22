# Connexion osu! (optionnelle)

Cette intégration permet au coach de récupérer ton profil public osu! (rank global, rank pays, pp), tes meilleurs scores publics sur la difficulté jouée, le compteur officiel de tes maps les plus jouées, les zones d’échec observées sur la map et une tendance anonyme des commentaires communautaires. Elle met aussi à jour automatiquement ton « rank actuel » dans le profil joueur.

Elle est entièrement optionnelle. Sans elle, tout le reste du coach fonctionne normalement.

Elle est gratuite et ne nécessite pas d’abonnement osu!supporter. Un compte osu! capable de créer une application OAuth suffit.

## Comment ça marche

Tu crées ta propre application OAuth sur ton compte osu!, puis tu donnes son identifiant et son secret au coach. Le service les stocke uniquement dans ta configuration locale (`%LOCALAPPDATA%\TosuAICoach\config.json`), jamais dans le dépôt, et les utilise pour lire des données publiques via l'API osu! v2.

Aucune donnée n'est envoyée ailleurs que vers `osu.ppy.sh`. Le secret n'est jamais réaffiché par le tableau de bord une fois enregistré.

Les commentaires sont traités temporairement pour produire une ambiance générale et humoristique. Le coach n’affiche et ne conserve ni texte brut, ni pseudo, ni donnée personnelle. Ce contenu utilisateur est toujours considéré comme non fiable et ne peut pas donner d’instructions au coach.

## Étape 1 — Créer ton application osu!

1. Connecte-toi sur [osu.ppy.sh](https://osu.ppy.sh) et ouvre les **paramètres du compte** : [https://osu.ppy.sh/home/account/edit](https://osu.ppy.sh/home/account/edit).
2. Descends jusqu'à la section **OAuth**.
3. Clique sur **Nouvelle application OAuth** (« New OAuth Application »).
4. Nom de l'application : ce que tu veux, par exemple `TOSU AI Coach`.
5. URL de redirection : mets `http://localhost` — elle est obligatoire dans le formulaire mais n'est pas utilisée par cette intégration.
6. Valide. osu! affiche alors ton **Client ID** (un nombre) et ton **Client Secret** (une longue chaîne).

## Étape 2 — Renseigner le coach

1. Ouvre le tableau de bord : [http://127.0.0.1:24051/dashboard](http://127.0.0.1:24051/dashboard), onglet **Profil joueur**.
2. Dans **Intégrations optionnelles** :
   - renseigne ton **nom d'utilisateur osu!** ;
   - colle le **Client ID** ;
   - colle le **Client Secret** ;
   - coche **Activer l'intégration osu!**.
3. Clique sur **Enregistrer le profil**.
4. Clique sur **Tester et synchroniser le rank**. Si tout est bon, ton pseudo, ton rank global et ton rank pays s'affichent.

Le rank est ensuite resynchronisé à chaque démarrage du service.

## Compteur de parties avant lancement

Quand une map est sélectionnée, le coach interroge la liste publique des 100 beatmaps les plus jouées du profil :

- si la difficulté est présente, son compteur officiel osu! est affiché ;
- la réponse est gardée en cache pendant 5 minutes pour rester rapide ;
- si la map n’est pas dans ce top 100 ou si l’API est indisponible, le coach indique explicitement le nombre enregistré dans son historique local.

Ce compteur osu! et les tentatives de la session sont deux informations différentes. Une simple sélection de map n’ajoute aucune tentative.

## Quel rank est utilisé ?

- Si le champ **Classement / région** de ton profil est renseigné (par exemple `Suisse`), c'est ton **rank pays** qui met à jour le « rank actuel ».
- Sinon, c'est ton **rank global**.

## Sécurité

- Le secret n'apparaît jamais dans les réponses de l'API locale du coach : il rentre, il ne ressort pas.
- Ne partage jamais ton Client Secret et ne le colle jamais dans un fichier versionné.
- Tu peux révoquer l'application à tout moment depuis la même page OAuth de ton compte osu! : le coach perdra simplement l'accès et affichera une erreur claire à la prochaine synchronisation.
- L’application utilise le flux OAuth `client_credentials` et le scope public. L’URL de redirection demandée par osu! n’est pas utilisée par le coach.

## Dépannage

- **« identifiants OAuth osu! refusés »** : Client ID ou secret incorrect. Recopie-les depuis la page OAuth d'osu!, ou régénère le secret.
- **« utilisateur osu! introuvable »** : vérifie l'orthographe exacte du pseudo.
- **Erreur réseau ou timeout** : osu! est peut-être temporairement indisponible ; réessaie plus tard, le coach n'est pas bloqué pour autant.
