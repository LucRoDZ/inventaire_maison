# Vue Maison : portes dynamiques et lumière

Document de cadrage pour Claude Code. Il est **autonome** : tout ce qu'il faut pour réaliser la phase est ici, y compris ce qui vient du prototype.

## 0. Contexte du prototype (à lire d'abord)

Lucas a fait réaliser un prototype visuel dans un outil de maquettage (React + CSS, une seule page, données fictives). **Tu n'y as pas accès et tu n'en as pas besoin** : ses idées utiles sont décrites ici (sections 3 et annexes A à C), déjà adaptées aux règles du projet. Ne cherche pas le prototype et ne le recopie pas : il enfreint plusieurs règles du dépôt (dégradés, couleurs en dur, polices importées, photos externes, navigation propre).

Ce que le prototype montre, en une phrase : des meubles de cuisine vus de face dont **la porte pivote en 3D quand on les ouvre**, avec **une lumière ambre qui s'allume à l'intérieur**, des étagères en verre, des tiroirs de congélateur et des produits empilés selon leur quantité.

Audit statique du dépôt (main, commit 27b2564). La suite de tests n'a pas été exécutée pour rédiger ce document.

## 1. Périmètre

**Ce qui change** : le dessin et l'animation des meubles de la Vue Maison (cartes de l'écran Inventaire et meuble ouvert).

**Ce qui ne change pas** :
- la navigation du bas (Scanner, Inventaire, À classer, Plus) et toutes les pages hors Vue Maison ;
- la bascule Maison / Liste, la vue Liste, la fiche produit, le panneau produit (`ProductSheet`), le scanner, l'ajout, l'administration ;
- l'API, la base de données et les types partagés (aucune migration) ;
- le glisser-déposer `@dnd-kit` et ses annonces vocales ;
- les filtres de recherche et de catégorie (`HomeFilters`).

Le prototype propose aussi sa propre barre de navigation, un écran de recherche, un flux de scan animé, une fiche produit et une liste. Rien de cela n'est repris : l'application a déjà ces écrans, branchés sur les vraies données.

## 2. Audit de l'existant

### Ce qui est déjà en place
- `components/home/HomeView.tsx` : en-tête indigo « Ma maison », filtres, grille 2 colonnes (4 sur ordinateur) de `FurnitureCard`.
- `components/home/FurnitureCard.tsx` : un `Link` vers `/inventaire/[id]`, un dessin SVG statique par type de meuble (viewBox 120 × 140, classe `h-28 w-full`), nombre d'articles, pastille ambre « n bientôt périmés », anneau ambre quand la recherche trouve un résultat.
- `components/home/furniture/{Fridge,Freezer,Pantry,Cellar}.tsx` : SVG fixes, sans animation. Le frigo n'a qu'une petite barre ambre en guise de lumière.
- `app/(app)/inventaire/[lieu]/page.tsx` : meuble ouvert, avec `DndProvider`, filtres, `OpenFurniture`, `ProductSheet`.
- `components/home/OpenFurniture.tsx` : étagères empilées puis plateau « Non rangé ». L'ouverture est un simple zoom de 250 ms (`.open-furniture` dans `app/globals.css`).
- `components/home/ShelfRow.tsx` : une section par étagère (`aria-label` = nom), vignettes en défilement horizontal (`overflow-x-auto`), planche indigo (`bg-indigo h-2`), montants si `kind = rack`, contour pointillé si vide.
- `components/home/ProductTile.tsx` : vignette 80 × 80, photo ou pictogramme de catégorie, pastille ambre de quantité, atténuée si hors filtre.
- `components/home/dnd/DraggableTile.tsx` et `DroppableShelf.tsx` : le survol d'une étagère ajoute `ring-amber ring-4`.
- Styles : Tailwind v4, `@theme inline` dans `app/globals.css` alimenté par `tokens.css`. Règle `prefers-reduced-motion` globale (durées à 0,01 ms).
- Garde-fous existants : audit axe à 360 px, zones tactiles de 44 px, détection d'emoji et de texte ambre (`e2e/tests/a11y.spec.ts`).

### Écart avec le cahier des charges
Le cahier des charges (section Vue Maison) dit déjà : « un toucher le fait s'ouvrir (zoom de 250 ms, **porte du frigo qui pivote**) » et décrit le frigo « porte ouverte, intérieur éclairé en ambre ». Le zoom est fait ; **la porte qui pivote ne l'est pas**. Cette phase comble donc un manque du cahier des charges, elle ne change pas le périmètre.

### Constats à connaître
1. **Étagères = données.** Le frigo du seed a « Étagère 1 à 3 » et « Bac à légumes », tous de type `plain` (quatre étagères au plus par meuble depuis le correctif « meuble sans défilement ») ; le congélateur a « Tiroir 1 à 3 ». Aucun champ ne distingue un balconnet d'un bac, et l'admin peut tout renommer. Le dessin ne doit donc jamais dépendre des noms.
2. **Pas de dégradé dans le projet.** Le cahier des charges interdit les dégradés ; aucun `gradient` dans `apps/web`.
3. **Pas de couleur en dur.** `tokens.css` impose les variables.
4. **Deux fonds seulement** (blanc, et indigo pour les cartes de chiffres et l'en-tête de la Vue Maison). L'intérieur des meubles est en lavande.
5. **Fragilité des tests e2e.** Le parcours critique cherche `getByRole('link', { name: /^Frigo/ })`. La pastille « bientôt périmés » est placée avant le nom dans le DOM : quand elle apparaît, le nom du lien ne commence plus par « Frigo ». Le test d'audit évite déjà ce piège en utilisant le Garde-manger. À ne pas aggraver.
6. **Nom accessible en double (probable).** Le SVG a `role="img"` et `aria-label="Frigo"` à l'intérieur d'un lien qui contient déjà le texte « Frigo ». Le dessin est décoratif et doit passer en `aria-hidden="true"`.

## 3. Le concept, en détail

### Principe
Un meuble est un vrai meuble vu de face. **Sa porte s'ouvre quand on y entre, et la lumière ambre signifie toujours « c'est ici ».** Le mouvement est une transition d'entrée, jamais un bouton à actionner : pas de bouton « Ouvrir / Fermer » (le retour se fait par le lien « Maison » existant).

### Palette et matière
- Corps du meuble : blanc et lavande ; traits `lavender-line` ; poignées `grey`.
- Profondeur par les ombres (`--shadow-card`) et un reflet (bande blanche translucide inclinée), jamais par des dégradés ni du bois.
- Lumière : ambre. Le halo est une **ellipse ambre floutée** (`filter: blur`, opacité animée de 0 à 0,85), pas un dégradé radial. Aucune autre couleur ne sert à « allumer ».
- Aucune couleur écrite dans le CSS : variables de `tokens.css`, opacités par `color-mix()`.

### Écran Maison : les cartes
- La carte reste un `Link` (mêmes nom accessible et cible tactile).
- Meuble fermé : porte(s) blanche(s) avec poignée et reflet, posées sur le dessin SVG existant.
- **Appui (`:active`)** : la porte pivote d'environ 20° et le halo apparaît, en 120 ms. C'est un retour tactile, pas un délai : la navigation part immédiatement.
- **Carte trouvée par la recherche** : l'anneau ambre actuel est conservé (les tests s'appuient dessus) et on y ajoute la porte entrouverte (12°) avec le halo. Les cartes sans résultat restent fermées.
- La pastille « bientôt périmés » et le compteur d'articles ne bougent pas.

### Meuble ouvert : comportement par type
Le type vient de `location.kind`, déjà dans les données.

**Frigo**
- Corps lavande, bord de 7 px `lavender-line`, rayon 13 px, ombre intérieure. **La porte, articulée à gauche, pivote de 0 à −78° et reste ouverte sur le côté.**
- La lumière intérieure s'allume en haut (halo, 260 ms, 200 ms de retard).
- Chaque étagère est une planche de verre : bord translucide blanc, fine ombre portée.
- Toutes les étagères du frigo s'affichent de la même manière, quel que soit leur nom (décision B).

**Congélateur**
- Porte frontale blanche, poignée longue, pivot à gauche (−86°). Givre : liseré blanc pointillé sur les bords, décoratif.
- Chaque étagère est dessinée comme un **tiroir** : face blanche, poignée centrale en haut, nom et nombre d'articles. À l'arrivée, les tiroirs coulissent l'un après l'autre (translation de 12 px et opacité, 60 ms de décalage).
- Le contenu des tiroirs reste visible en permanence (décision C) : un tiroir fermé serait une cible de dépôt invisible pour le glisser-déposer.

**Garde-manger et cave**
- Deux portes battantes : gauche −88°, droite +88°.
- Un spot ambre (halo) au-dessus de chaque étagère.
- Les étagères de type `rack` gardent leurs montants. On peut y ajouter des alvéoles rondes derrière les vignettes (décor).
- Intérieur lavande (pas indigo).

**Autre** : même dessin que le garde-manger.

### Produits
- La vignette actuelle (80 × 80, photo ou pictogramme, pastille ambre de quantité) est conservée, avec son `aria-label` « nom, quantité n » (les tests l'utilisent).
- Effet de pile décoratif derrière la vignette : jusqu'à 4 cartes derrière (quantité 5 et plus), décalées de 3 px vers le haut et la droite. Éléments `aria-hidden`, aucune zone cliquable supplémentaire.
- Les photos sont les miniatures 400 px WebP de l'API.

### Glisser-déposer
- `@dnd-kit` inchangé (appui long 250 ms, souris 8 px, clavier).
- Pendant le survol, l'étagère cible s'entoure d'un halo ambre en plus de l'anneau actuel. Le nom accessible de l'étagère ne change pas.

### Mouvement
| Élément | Propriétés animées | Durée | Courbe |
|---|---|---|---|
| Porte du meuble ouvert | `transform` | 600 ms | `cubic-bezier(0.2, 0.72, 0.2, 1)` |
| Lumière | `opacity` | 260 ms, retard 200 ms | ease-out |
| Tiroirs | `transform`, `opacity` | 320 ms, décalage 60 ms | ease-out |
| Appui sur une carte | `transform`, `opacity` | 120 ms | ease-out |

- Uniquement `transform` et `opacity` (le flou est fixe, on n'anime que l'opacité).
- Pas d'animation en boucle.
- `prefers-reduced-motion` : la règle globale ramène les durées à 0,01 ms ; avec `animation-fill-mode: both`, les portes apparaissent directement dans leur état final (ouvert), lumière allumée.
- Le zoom de 250 ms de `.open-furniture` est remplacé par cette séquence, pas additionné.

### Accessibilité
- Portes, halos, givre, reflets : décor, `aria-hidden="true"`, `pointer-events: none`, aucun nouvel élément focusable. **Un bouton dans un bouton est interdit.**
- Les SVG des cartes passent en `aria-hidden`.
- La lumière ne porte jamais seule une information : le résultat de recherche a son anneau, les péremptions ont leur pastille et leur texte.
- Cibles tactiles de 44 px minimum.
- La vue Liste reste l'alternative accessible, inchangée.

## 4. Ce qu'on reprend, ce qu'on laisse

| Élément du prototype | Décision |
|---|---|
| Porte(s) qui pivotent, charnière, reflet | **Repris**, en CSS à variables |
| Lumière intérieure ambre | **Repris**, halo flouté sans dégradé |
| Étagères en verre translucide | **Repris** (frigo, congélateur) |
| Pile de vignettes selon la quantité | **Repris**, décoratif |
| Tiroirs du congélateur | **Repris** : coulissent à l'arrivée, contenu toujours visible |
| Halo ambre sur l'étagère cible | **Repris** |
| Barre de navigation, écran de recherche, flux de scan, fiche produit, liste | Laissé : ces écrans existent déjà |
| Bouton « Ouvrir / Fermer » sur chaque meuble | Laissé |
| Navigation retardée de 680 ms après l'appui | Laissé |
| Travées (onglets) de la cave, bocaux et conserves fixes | Laissé : les étagères sont des données |
| Bac à légumes et balconnet dessinés à part | Laissé (décision B) |
| Photos externes et produits codés en dur | Laissé |
| Dégradés, couleurs en dur, import de police | Laissé |
| Intérieur de la cave en indigo | Laissé (lavande à la place) |

## 5. Décisions à trancher

**A. Halo : flou ou dégradé ?** Recommandé et appliqué dans ce document : ellipse floutée, qui respecte « pas de dégradé » sans modifier le cahier des charges. Alternative : autoriser un seul dégradé radial pour la lumière, ce qui impose de modifier le cahier des charges et `CLAUDE.md`.

**B. Porte du frigo et bacs à légumes.** Recommandé : aucune distinction, toutes les étagères du frigo se dessinent pareil. Alternative : un champ « zone » sur les étagères (étagère, tiroir, porte, bac) avec migration et écran d'administration ; plus fidèle, mais ça touche l'API et la base. À décider après usage réel.

**C. Tiroirs fermés ou ouverts.** Recommandé : toujours ouverts (contenu visible).

**D. Largeur de la porte ouverte.** Dans le prototype, le corps du frigo n'occupe que 73 % de la largeur et le reste à gauche est réservé à la porte vue de biais. À 360 px, cela laisse environ 240 px aux étagères (deux vignettes et demie avant défilement). À valider par des captures à 360 et 430 px ; si c'est trop étroit, réserver 18 à 20 % seulement.

## 6. Tâches proposées (nouvelle phase « 1.5 : portes », avant la Phase 2)

Une branche `phase-1-5-portes`, une PR, un commit par tâche, critère « Fin » vérifié avant de cocher.

1. **Styles de base.** Créer `apps/web/app/furniture.css` à partir de l'annexe A, l'importer dans `globals.css` après `tokens.css`. *Fin : aucune valeur hexadécimale ni `rgb(a)` ni dégradé dans le fichier (test qui échoue sinon, par recherche de motifs).*
2. **Coque de meuble.** Composant commun (corps, porte(s), lumière) paramétré par `kind`, structure de l'annexe B, tout en `aria-hidden` sauf le contenu. *Fin : tests de rendu pour les cinq types ; aucun élément focusable ajouté.*
3. **Cartes de l'écran Maison.** Portes superposées aux SVG avec les rectangles du tableau de l'annexe A, retour à l'appui, état « résultat de recherche », SVG en `aria-hidden`. *Fin : le lien garde son nom accessible ; `getByRole('link', { name: /^Frigo/ })` passe.*
4. **Meuble ouvert.** `OpenFurniture` dans la coque, séquence d'ouverture à l'arrivée. *Fin : l'ordre des `h3` et les `data-shelf-kind` sont inchangés (tests existants verts).*
5. **Étagères.** Planche de verre (frigo, congélateur) ou planche indigo existante (autres) dans `ShelfRow`, halo de survol dans `DroppableShelf`. *Fin : tests de glisser-déposer existants verts.*
6. **Vignettes.** Pile décorative dans `DraggableTile` (autour du bouton, pas dedans) ; marges pour que le défilement horizontal ne rogne pas les cartes. *Fin : `aria-label` et taille 80 × 80 du bouton inchangés.*
7. **Congélateur.** Étagères dessinées en tiroirs selon `location.kind`. *Fin : tests sur un congélateur de trois tiroirs.*
8. **Mouvement réduit.** Vérifier l'état final sans transition. *Fin : test avec `prefers-reduced-motion`.*
9. **Tests de bout en bout et accessibilité.** Étendre le parcours critique ; audit axe à 360 px sur « Inventaire, vue Maison » et « Meuble ouvert » ; captures chromium-mobile et webkit-mobile à 360 et 430 px, examinées. *Fin : e2e verts sur les deux navigateurs, zéro violation axe, pas de défilement horizontal de la page.*
10. **Mesures.** Poids du bundle et fluidité avant/après sur WebKit (`perspective` et `preserve-3d` y sont plus fragiles). *Fin : rapport chiffré dans la PR ; aucune nouvelle dépendance.*
11. **Documentation.** Mettre à jour la section Vue Maison du cahier des charges (porte réalisée, halo flouté) et `CLAUDE.md` si besoin. *Fin : texte cohérent avec le code.*

## 7. À ne pas casser (sélecteurs et comportements testés)
- Lien de carte : `getByRole('link', { name: /^Frigo/ })`.
- Étagères : `getByRole('region', { name: 'Étagère 1' })`, titres `h3` dans l'ordre reçu, plateau « Non rangé » en dernier, attribut `data-shelf-kind`.
- Vignettes : bouton nommé « nom, quantité n ».
- Panneau produit : bouton « Déplacer vers… » ; annonces vocales du glisser-déposer.
- Audit axe à 360 px, zones tactiles de 44 px, aucun emoji, aucun texte ambre sur blanc, aucun défilement horizontal de la page.
- Bascule : `getByRole('button', { name: 'Maison', exact: true })` et `'Liste'`.

---

## Annexe A : feuille de style de départ (`apps/web/app/furniture.css`)

Valeurs reprises du prototype et déjà converties en variables de `tokens.css`. C'est un **point de départ à valider par captures**, pas une vérité : ajuste les dimensions à l'écran.

```css
/* Portes et lumière de la Vue Maison.
   Aucune couleur en dur, aucun dégradé : uniquement les variables de tokens.css. */

.fx-scene {
  --fx-ease: cubic-bezier(0.2, 0.72, 0.2, 1);
  --fx-door-ms: 600ms;
  --fx-shade: color-mix(in srgb, var(--ink) 15%, transparent);
  --fx-gloss: color-mix(in srgb, var(--white) 75%, transparent);
  --fx-glass: color-mix(in srgb, var(--lavender) 72%, transparent);
  --fx-inner: color-mix(in srgb, var(--indigo) 15%, transparent);
  position: relative;
  perspective: 1100px; /* 600px pour les petites cartes de l'écran Maison */
}

/* Corps du meuble ouvert. Le contenu réel (étagères) est dedans, au-dessus de la lumière. */
.fx-body {
  position: relative;
  overflow: hidden;
  background: var(--lavender);
  border: 7px solid var(--lavender-line);
  border-radius: 13px;
  box-shadow:
    inset 0 0 20px var(--fx-inner),
    var(--shadow-card);
}
.fx-body > * {
  position: relative;
  z-index: 1;
}

/* Lumière : une ellipse ambre floutée, on n'anime que l'opacité. */
.fx-light {
  position: absolute;
  z-index: 0;
  top: -40px;
  left: 15%;
  width: 70%;
  height: 110px;
  border-radius: 50%;
  background: var(--amber);
  filter: blur(32px);
  opacity: 0;
  pointer-events: none;
  animation: fx-light-on 260ms ease-out 200ms both;
}
@keyframes fx-light-on {
  from { opacity: 0; }
  to { opacity: 0.85; }
}

/* Porte : décor pur. --fx-angle vaut -78deg (frigo), -86deg (congélateur), -88deg / 88deg (battants). */
.fx-door {
  position: absolute;
  z-index: 4;
  top: 0;
  bottom: 0;
  pointer-events: none;
  transform-style: preserve-3d;
  animation: fx-swing var(--fx-door-ms) var(--fx-ease) both;
}
.fx-door[data-hinge='left'] { transform-origin: left center; }
.fx-door[data-hinge='right'] { transform-origin: right center; }
@keyframes fx-swing {
  from { transform: rotateY(0deg); }
  to { transform: rotateY(var(--fx-angle, -78deg)); }
}
.fx-door-face {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: var(--white);
  border: 5px solid var(--lavender-line);
  border-radius: 12px;
  box-shadow: 8px 6px 12px var(--fx-shade);
  backface-visibility: hidden;
}
.fx-door-back {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: var(--lavender);
  border: 5px solid var(--lavender-line);
  border-radius: 12px;
  transform: rotateY(180deg);
  backface-visibility: hidden;
}
.fx-gloss {
  position: absolute;
  inset: 0 auto 0 14px;
  width: 16px;
  background: var(--fx-gloss);
  transform: skewX(-6deg);
}
.fx-handle {
  position: absolute;
  top: 35px;
  right: 15px;
  width: 7px;
  height: 112px;
  background: var(--grey);
  border: 2px solid var(--white);
  border-radius: 5px;
  box-shadow: 0 2px 5px var(--fx-shade);
}

/* Planche de verre (frigo, congélateur). */
.fx-glass-edge {
  height: 7px;
  background: var(--fx-glass);
  border: 1px solid var(--white);
  border-bottom-color: var(--lavender-line);
  border-radius: 4px;
  box-shadow: 0 3px 5px var(--fx-inner);
}

/* Tiroir (congélateur) : l'étagère devient un tiroir. --i = son rang (0, 1, 2…). */
.fx-drawer {
  position: relative;
  padding: 12px;
  background: var(--white);
  border: 2px solid var(--lavender-line);
  border-radius: 12px;
  box-shadow: 0 5px 7px var(--fx-shade);
  animation: fx-drawer-in 320ms ease-out both;
  animation-delay: calc(var(--i, 0) * 60ms);
}
.fx-drawer::before {
  content: '';
  display: block;
  width: 50%;
  height: 7px;
  margin: 0 auto 8px;
  background: var(--grey);
  border-radius: 5px;
}
@keyframes fx-drawer-in {
  from { opacity: 0; transform: translateX(12px); }
  to { opacity: 1; transform: none; }
}
.fx-frost {
  position: absolute;
  inset: 0;
  border: 3px dotted var(--white);
  border-radius: 11px;
  opacity: 0.8;
  pointer-events: none;
}

/* Pile de vignettes : le conteneur laisse 12 px en haut et à droite pour les cartes qui dépassent.
   Chaque carte derrière porte --i = 1, 2, 3 ou 4 (quantité − 1, plafonné à 4). */
.fx-pile {
  position: relative;
  padding: 12px 12px 0 0;
}
.fx-pile-card {
  position: absolute;
  top: 12px;
  left: 0;
  width: 80px;
  height: 80px;
  background: var(--white);
  border: 1px solid var(--lavender-line);
  border-radius: 12px;
  box-shadow: 1px 2px 3px var(--fx-shade);
  transform: translate(calc(var(--i) * 3px), calc(var(--i) * -3px));
  pointer-events: none;
}
.fx-pile > button,
.fx-pile > .fx-tile {
  position: relative;
  z-index: 1;
}

/* Étagère cible pendant un glisser-déposer (s'ajoute à l'anneau ambre existant). */
.fx-over {
  background: color-mix(in srgb, var(--amber) 22%, transparent);
  box-shadow: 0 0 20px color-mix(in srgb, var(--amber) 80%, transparent);
}

/* Cartes de l'écran Maison. --fx-sign vaut -1 (porte gauche) ou 1 (porte droite). */
.fx-card-stage {
  position: relative;
  height: 7rem;
  aspect-ratio: 120 / 140;
  margin-inline: auto;
  perspective: 600px;
}
.fx-card-stage > svg {
  width: 100%;
  height: 100%;
}
.fx-card-door {
  position: absolute;
  transform-origin: left center;
  transition: transform 120ms ease-out;
  pointer-events: none;
}
.fx-card-door[data-hinge='right'] { transform-origin: right center; }
.fx-card-light {
  position: absolute;
  top: -10px;
  left: 20%;
  width: 60%;
  height: 40px;
  border-radius: 50%;
  background: var(--amber);
  filter: blur(14px);
  opacity: 0;
  transition: opacity 120ms ease-out;
  pointer-events: none;
}
.fx-card:active .fx-card-door {
  transform: rotateY(calc(var(--fx-sign, -1) * 20deg));
}
.fx-card[data-match='true'] .fx-card-door {
  transform: rotateY(calc(var(--fx-sign, -1) * 12deg));
}
.fx-card:active .fx-card-light,
.fx-card[data-match='true'] .fx-card-light {
  opacity: 0.85;
}
```

Notes d'intégration :
- `:active` ne s'applique pas toujours sur iOS sans écouteur tactile : si la porte ne réagit pas dans Safari, ajouter `ontouchstart` vide sur le lien ou un état React `pressed` sur `pointerdown`.
- `filter: blur` et `backdrop-filter` coûtent sur les téléphones modestes : ne flouter que le halo, jamais plusieurs à la fois à l'écran, et vérifier sur WebKit (tâche 10).
- La coque porte déjà `perspective` ; ne la mettre qu'une fois par scène, pas sur chaque porte.

### Rectangles des portes sur les cartes (en pourcentage du cadre `.fx-card-stage`)

Calculés à partir des SVG existants (viewBox 120 × 140). La porte est un `<span class="fx-card-door">` positionné en pourcentages à l'intérieur de `.fx-card-stage`, avec les mêmes arrondis que le corps du SVG.

| Meuble | left | top | width | height | Remarque |
|---|---|---|---|---|---|
| Frigo | 21,7 % | 4,3 % | 56,7 % | 91,4 % | une porte, charnière à gauche |
| Congélateur | 13,3 % | 10 % | 73,3 % | 82,9 % | une porte, charnière à gauche |
| Garde-manger et autre | 11,7 % | 5,7 % | 76,7 % | 88,6 % | deux portes de 50 % chacune, charnières aux deux bords |
| Cave | 8,3 % | 8,6 % | 83,3 % | 82,9 % | deux portes de 50 % chacune |

## Annexe B : structure des composants

### Coque d'un meuble ouvert

```tsx
// Le décor est séparé du contenu : seul le contenu est lu et focusable.
<div className="fx-scene" data-kind={location.kind}>
  <span
    className="fx-door"
    data-hinge="left"
    style={{ '--fx-angle': '-78deg', left: 0, width: '100%' } as React.CSSProperties}
    aria-hidden="true"
  >
    <span className="fx-door-face"><span className="fx-gloss" /><span className="fx-handle" /></span>
    <span className="fx-door-back" />
  </span>
  <div className="fx-body">
    <span className="fx-light" aria-hidden="true" />
    {/* le contenu existant : étagères et plateau « Non rangé » (OpenFurniture) */}
  </div>
</div>
```

- Deux portes (garde-manger, cave, autre) : deux `.fx-door`, `data-hinge="left"` avec `--fx-angle: -88deg` et `width: 50%`, `data-hinge="right"` avec `--fx-angle: 88deg`, `width: 50%`, `left: 50%`.
- Congélateur : une porte, `--fx-angle: -86deg`.
- La porte étant `pointer-events: none` et `aria-hidden`, elle ne gêne ni le toucher ni le glisser-déposer.
- Dans le prototype, le corps du frigo est aligné à droite (73 % de la largeur, 8 px de marge) et la porte, de même largeur et articulée sur son bord gauche, pivote vers le spectateur : la perspective la projette dans la bande vide à gauche. Si tu reproduis ce principe, vérifie le rendu par capture (décision D).

### Carte de l'écran Maison

```tsx
<Link href=… className="fx-card …" data-match={highlighted ? 'true' : undefined}>
  <div className="fx-card-stage">
    <Drawing className="…" /> {/* le SVG existant, passé en aria-hidden */}
    <span className="fx-card-light" aria-hidden="true" />
    <span className="fx-card-door" data-hinge="left" aria-hidden="true"
      style={{ left: '21.7%', top: '4.3%', width: '56.7%', height: '91.4%' }}>
      <span className="fx-door-face"><span className="fx-gloss" /><span className="fx-handle" /></span>
    </span>
  </div>
  {/* nom, nombre d'articles, pastille : inchangés */}
</Link>
```

### Étagère de congélateur (tiroir)

```tsx
<section aria-label={shelf.name} className="fx-drawer" style={{ '--i': index } as React.CSSProperties}>
  <span className="fx-frost" aria-hidden="true" />
  {/* le h3 du nom, les vignettes et la planche existants */}
</section>
```

### Vignette empilée

```tsx
<div className="fx-pile">
  {Array.from({ length: Math.min(tile.quantity, 5) - 1 }).map((_, k) => (
    <span key={k} className="fx-pile-card" aria-hidden="true" style={{ '--i': k + 1 } as React.CSSProperties} />
  ))}
  <ProductTile … /> {/* inchangé */}
</div>
```
Le conteneur `ul` des vignettes (`overflow-x-auto`) rogne tout ce qui dépasse : les 12 px de marge de `.fx-pile` sont nécessaires.

## Annexe C : description du prototype

Pour que tu saches ce que la maquette montrait, sans l'avoir sous les yeux. Dimensions en pixels sur un écran de 390 px de large.

**Écran Maison.** Cartes à fond blanc, rayon 16 px, ombre légère, hauteur minimale 190 px. Une « scène » de 116 px de haut en haut de chaque carte montre l'intérieur du meuble (fond très clair, bord de 3 px `lavender-line`, ombre intérieure) caché par la ou les portes. À l'ouverture : le frigo et le congélateur ont une porte articulée à gauche (rotation de −76°) ; le garde-manger et la cave ont deux portes (−82° et +82°). Un halo ambre apparaît en haut du meuble quand il s'ouvre. Intérieurs dessinés : frigo avec trois étagères et quelques petits blocs indigo moyen (14 × 18 px) ; congélateur avec trois tiroirs blancs ; garde-manger avec deux étagères ; cave avec huit alvéoles rondes (cercles indigo cerclés de `lavender-line`, 2 rangées de 4). Pastille de compteur en haut à gauche (fond indigo, texte blanc, bordure blanche de 2 px, avec un point ambre si alerte). Libellé « Ouvrir » en bas à droite de la carte (indigo, 12 px gras).

**Frigo ouvert.** Scène de 506 px de haut avec une perspective de 1100 px. Corps à droite (73 % de la largeur, 8 px de marge), 496 px de haut, bord de 7 px `lavender-line`, rayon 13 px. Intérieur : 54 px de marge en haut pour la lumière, étagères de 94 px minimum séparées de 4 px, chacune avec sa planche de verre de 7 px en bas ; un bac à légumes de 82 px au bas (décor dans le prototype, supprimé ici). Porte : même largeur que le corps, articulée à gauche, rotation −78° en 620 ms ; son verso lavande porte deux balconnets (décor, supprimés ici). Lumière : halo de 70 % de la largeur sur 150 px de haut, apparaît en 260 ms après 220 ms.

**Étagère sélectionnée (glisser-déposer).** Fond ambre à 22 %, anneau intérieur ambre de 2 px et halo de 20 px ; les autres étagères tombent à 35 % d'opacité (non repris : le filtre de recherche s'en charge).

**Pile de produits.** Vignette de 44 × 43 px dans le prototype (80 × 80 ici), jusqu'à 5 cartes décalées de 3 px derrière, pastille de quantité en bas à droite (cercle indigo de 20 px, bordure blanche).

**Congélateur ouvert.** Meuble lavande, bord de 4 px, rayon 18 px, 475 px de haut. Porte frontale qui pivote de −86° en 620 ms. Trois tiroirs de 116 px (face blanche, poignée centrale de 7 px, nom en indigo gras 15 px et nombre d'articles en gris 11 px) ; un tiroir ouvert passe à 155 px, glisse de 8 px et prend un bord ambre. Liseré de givre blanc pointillé sur les bords. Dans notre version, tous les tiroirs restent ouverts (décision C).

**Cave et placard ouverts.** Deux portes battantes de 50,5 % chacune, −88° et +88°, en 620 ms. Trois spots ambre (70 × 100 px) en haut, qui s'allument avec un retard de 200 ms. Le prototype peint l'intérieur en indigo avec un bandeau ambre « TRAVÉE n » et une grille de bouteilles ; **non repris** (intérieur lavande, étagères issues des données).

**Mouvement réduit.** Dans le prototype, la porte du frigo se contente de s'entrouvrir de 12° et le produit qui vole vers l'étagère s'arrête à sa position finale. Chez nous : état final immédiat, sans transition.

**Annotations de durée affichées dans la maquette.** Tiroir 320 ms ease-out, trajet d'un produit 400 ms ease-in-out (flux de scan, non repris), mouvement réduit : fondu de 200 ms.