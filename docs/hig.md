# Refonte « HIG » : sobre, efficace, façon Apple

Branche `hig`. Règle absolue : aucune logique métier, aucun endpoint, aucune migration ne change. Seuls la présentation, les tokens et les animations bougent.

## Contrat

- Police système (`system-ui`, SF sur iPhone, Roboto sur Android), Carlito retirée. Échelle : titre 34/41 gras, sous-titre 22/28, titre de carte 17/22, corps 17/22, secondaire 15/20, aide 13/18, chiffres `tabular-nums`.
- Titres en `--ink`. L'indigo ne sert qu'à l'élément actif ou principal, aux liens et au bouton principal.
- Marque adoucie (mêmes noms de tokens) : `--indigo #3f51a8`, `--indigo-mid #34428c`, `--lavender #e8ebf7`, `--lavender-line #c5cce8`.
- Fond gris très clair (`--surface #f5f5f7`), cartes blanches plates, filets fins, ombre seulement pour les feuilles et le bouton Ajouter.
- − / + et boutons-icônes : glyphe seul, aucun fond ni forme, appui `opacity 0.5` + `scale(0.92)` en 100 ms, `disabled` à 35 %. Composant unique `components/ui/QuantityControl.tsx`.
- Contrôle segmenté Maison / Liste : piste `--fill-quiet`, pastille blanche qui glisse (`translateX`, `--dur-slide`, `--ease-out-soft`), contenu qui glisse dans le sens du déplacement.
- Ambre retiré de la barre du bas et du bouton Ajouter ; il ne marque plus que la péremption proche.
- Inchangés : sélecteurs e2e et libellés accessibles, isolation foyers, hors-ligne, balayages, défilement interne, un seul `h1`, cibles 44 px, `prefers-reduced-motion`, thème clair.

## Avancement

| Tâche | Qui | Statut | Commit |
| --- | --- | --- | --- |
| Étape 1 : tokens, police, échelle | pilote | fait | 1392575 |
| W1 : `QuantityControl`, boutons-icônes sans fond (T2) | worker | fait | 214530a, 9e1ded1, 945e9dc, 1610df3 |
| W2 : contrôle segmenté et transition Maison ↔ Liste (T3) | worker | fait | f985973, 6333ed8 |
| W3 : barre du bas, titres, compteurs, bouton Ajouter (T4) | worker | fait | 9708d4e, 029da1a |
| W4 : liste d'inventaire et Courses (T5) | worker | en cours | |
| W5 : vue Maison et meubles (T6) | worker | en cours | |
| W6 : feuilles, filtres, scanner, documentation (T7) | worker | en cours | |
| Suite complète, revue, PR | pilote | à faire | |

## Décisions prises

- H1 : contrastes AA vérifiés : blanc sur indigo 7,1:1 ; indigo sur `--surface` 6,5:1, sur `--lavender` 6,0:1, sur `--fill-quiet` 6,2:1 ; gris sur `--fill-quiet` 5,8:1 ; alerte sur `--surface` 5,0:1. La valeur `#3f51a8` est gardée.
- H2 : `--fill-quiet` vaut `#e9e9ee` (et non `#efeff4`) : sur le nouveau fond `#f5f5f7`, la piste du contrôle segmenté restait invisible.
- H3 : `--line` et `--surface-group` deviennent neutres (`#e5e5ea`, `#ececf0`), sans teinte indigo.
- H4 : barre d'état (`theme_color`, `--theme-color`) au gris du fond de page `#f5f5f7` ; l'écran de lancement reste blanc.
- H5 : `--on-amber` passe à `--ink` (13:1 sur l'ambre) plutôt qu'à l'indigo.
- H6 : le logo (`design/icon/`, icônes générées) garde son indigo `#1800ad` : c'est une image validée par l'utilisateur ; `icons.spec.ts` mesure donc toujours ce bleu-là. Plus aucune trace de `#1800ad` dans le code applicatif ni dans les tokens.
- H7 : le titre d'écran est en graisse 700 (Large Title HIG) ; toutes les autres graisses restent 400 et 600.
- H8 : test e2e « police Carlito chargée » remplacé par « police du système, sans police téléchargée ».
- H9 : transition Maison ↔ Liste par l'API View Transitions : seule la zone de défilement est nommée, et seulement pendant la bascule ; sans l'API (ou mouvement réduit), changement instantané. La vue locale est mise à jour dans `flushSync`, l'URL suit comme avant.
- H10 : dans Courses, la quantité figure déjà dans le texte de la ligne : `QuantityControl` y est utilisé sans valeur entre − et + (`hideValue`).
