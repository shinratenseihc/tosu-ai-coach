# Base de connaissances du coach

Cette base résume les faits utilisés par le prompt. Elle est embarquée afin que le coach reste cohérent sans navigation web à chaque analyse.

## Timing et UR

- L’unstable rate mesure la dispersion des erreurs de frappe : écart-type en millisecondes multiplié par 10.
- Un UR bas signifie des frappes régulières, pas nécessairement centrées ni précises. Un joueur peut frapper régulièrement early ou late.
- Le hit error moyen sert à distinguer un biais early d’un biais late.
- Sur osu!stable, comparer un UR DT/HT avec NoMod demande une conversion liée à la vitesse ; lazer mesure désormais en temps réel.

Source : https://osu.ppy.sh/wiki/en/Gameplay/Unstable_rate

## Difficulté et lecture

- L’OD resserre les fenêtres de jugement ; une baisse d’accuracy sur une OD plus haute ne prouve pas seule une régression.
- L’AR contrôle le temps d’apparition et donc la lecture, pas directement la précision du timing.
- La difficulté en étoiles est une abstraction globale et ne décrit pas seule le type de compétence requis.

Sources :

- https://osu.ppy.sh/wiki/en/Beatmap/Overall_difficulty
- https://osu.ppy.sh/wiki/en/Beatmap/Approach_rate
- https://osu.ppy.sh/wiki/en/Beatmap_information

## Offset

- L’offset universel affecte toutes les maps et doit normalement rester à 0.
- Il ne devient une piste raisonnable que lorsqu’un biais early ou late significatif revient sur plusieurs beatmaps distinctes.
- Un problème isolé sur une seule map relève plutôt de la map, du rythme, de la lecture ou d’un offset local.

Sources :

- https://osu.ppy.sh/wiki/en/Offset
- https://osu.ppy.sh/wiki/en/Offset/Universal_offset

## Interprétation d’entraînement

- Stamina : la qualité se dégrade avec la durée d’un pattern ou de la session.
- Speed : le BPM ou la vitesse de tapping dépasse la capacité actuelle.
- Finger control : les espacements rythmiques irréguliers cassent le contrôle des doigts.
- Lecture : le joueur identifie tard ou mal les objets/patterns, même si la vitesse mécanique est disponible.
- Ces catégories sont des interprétations de coaching, pas des diagnostics médicaux.
