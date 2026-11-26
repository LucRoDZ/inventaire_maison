# Audit de finition de l'interface

25 novembre 2026 · branche `feat/foyers-et-meubles` · passe faite avec le skill [`unslop`](https://github.com/heydamir/unslop) de Damir Sokolovsky (licence CC BY 4.0), sur l'état final des parties A et B.

**Cadre.** L'identité Indigo Ambre (`tokens.css`, `CLAUDE.md`, cahier des charges : deux fonds, un seul accent ambre, aucune couleur en dur, aucun dégradé, zones de 44 px, textes en français) prime sur toute proposition du skill. Aucune image générée, aucun service payant, pas de vidéo.

**Méthode.** Captures de tous les écrans à 360 × 740 et 390 × 844 avant et après (`docs/audit-finition/avant/`, `docs/audit-finition/apres/`, produites par `e2e/playwright.captures.config.ts`), relevé des signes de `references/signs.md`, balayage du code (`transition-all`, animations en boucle, valeurs arbitraires, ombres et rayons hors tokens, italique, emoji).

**Verdict.** Finition légère (« polish mode » du skill) : l'application a déjà une direction propre, sans dégradé, sans lueur, sans emoji, avec une seule famille d'icônes. Les corrections portent sur les écrans ajoutés par la branche et sur quelques textes.

## Direction (reprise de l'existant)

- **Produit** : l'inventaire de la maison d'une famille, scanné au téléphone.
- **Caractère** : posé, domestique, précis.
- **Monde** : le placard, le frigo, l'étagère ; l'indigo des traits et l'ambre de la lumière d'un frigo qu'on ouvre.
- **Moments** : les meubles dessinés de la Vue Maison et leur porte qui s'ouvre ; rien d'autre ne porte de couleur riche.
- **Signature** : la lumière ambre « c'est ici » (anneau de recherche, lumière du meuble ouvert, onglet actif).

## Signes relevés et corrections

| Signe | Emplacement | Correction |
| --- | --- | --- |
| Noms d'icônes en anglais affichés (« warehouse », « wine ») | Plus > Meubles et étagères, liste « Icône » | Noms français (`components/ui/icon-labels.ts`) |
| Nom accessible anglais des boutons d'icône (« cup-soda ») | Administration > Catégories, sélecteur d'icônes | Même table : un lecteur d'écran dit « Gobelet », « Œuf »… |
| Vocabulaire mêlé « lieu » / « meuble » | Écran des meubles (champs, bouton, régions) | « Nom du meuble », « Icône du meuble », « Enregistrer le meuble », régions « Meuble … » |
| Cartes sans titre : la carte s'ouvre sur un libellé de champ | Écran des meubles | Titre de carte (nom du meuble) et compte de produits ou « Vide » |
| Faute d'élision « Nombre de étagères », aide redondante « étagères, 8 au plus » | Feuille de création | « Nombre d'étagères » (« de tiroirs », « de rangées »), aide « 8 au plus » |
| Accord « ses 1 compte » | Administration > Foyers | « son compte » / « ses n comptes » |
| Titre de section qui répète le titre d'écran (« Comptes » sous « Comptes ») | Administration > Comptes | « Tous les comptes » |
| « Ses 1 produit seront rangés » | Boîte de suppression d'un meuble | « Son produit sera rangé… » au singulier |
| Libellé qui englobe une liste déroulante (nom accessible pollué par les options) | Comptes : listes « Foyer » et « Nouveau foyer de … » | Étiquette liée par `htmlFor` |

## Passes

1. **Espacements** : échelle 4 px respectée (relevé : aucune valeur arbitraire hors marges de zone sûre `env(safe-area-inset-*)`) ; les nouveaux écrans reprennent les paddings des cartes existantes (16 px) et les écarts de 8 et 16 px.
2. **Couleurs** : uniquement les tokens (contrôle `check-colors` vert) ; ambre réservé à l'action d'ajout, à la sélection et aux pastilles ; le texte d'erreur sous un champ est en `alert` (contraste 5,4 pour 1) accompagné d'un mot.
3. **Icônes** : un seul jeu (Lucide), même trait ; tailles 18 px dans un bouton texte, 20 px en entrée de menu, 22 px pour les boutons-icônes de barre ; icônes des types de meuble dans une pastille lavande.
4. **Textes** : corrections ci-dessus ; aucun point d'exclamation, aucun texte provisoire ni anglais, messages d'erreur en phrases françaises (« Pas de connexion : ajouter ou supprimer un meuble demande le réseau. Réessayez une fois en ligne. »).
5. **Typographie** : Carlito, échelle du cahier ; les champs de saisie restent à 16 px (pas de zoom iOS).
6. **Mise en page** : la grille de l'accueil reste sur 2 colonnes et défile ; la tuile d'ajout ferme la grille avec le motif « vide » du cahier (pointillés `lavender-line`).
7. **Détails** : rayons imbriqués vérifiés (sélecteur segmenté 12 px − 4 px = 8 px) ; états de focus visibles (anneau `indigo-mid`) sur les cartes radio de la feuille de création.
8. **Visuels** : aucun ajout ; les dessins de meubles restent les seules illustrations.
9. **Mouvement** : feuilles et boîtes qui montent du bas en 240 ms et fond qui s'assombrit en 200 ms, courbe de décélération `cubic-bezier(0.2, 0, 0, 1)`, jamais linéaire ; transitions Tailwind de 150 ms sur `opacity` et `transform` seulement ; tout est coupé par `prefers-reduced-motion` (règle globale) et rien ne retarde une action (le focus est placé avant l'animation). L'appui sur une carte entrouvre sa porte en 120 ms, transition CSS donc interruptible ; l'ajout et le scan affichent leur confirmation (« Ajouté : … ») dès la réponse du serveur. Aucun confetti.

## Propositions refusées (contraires au cahier des charges)

- **Étiquettes en minuscules sans interlettrage** : le cahier impose l'étiquette de section « 700, 12/16, majuscules, interlettrage 0,12 em ». Gardée.
- **Graisses 400 à 600 seulement** : le cahier fixe les titres en 700. Gardé.
- **Fond neutre gris et accent rare** : deux fonds imposés, blanc et indigo (carte « Ma maison », boutons principaux). Gardé.
- **Durées de 150 à 300 ms pour tout** : l'ouverture de la porte d'un meuble (600 ms) et la lumière (260 ms après 200 ms) sont fixées par le cahier (Phase 1.5). Gardées, coupées en mouvement réduit.
- **Supprimer le champ « Icône du meuble »** (l'icône d'un meuble n'est affichée nulle part) : la route `PATCH /locations` l'accepte et le cahier la cite ; le champ est gardé, traduit. À reconsidérer avec Lucas.

## Captures

`docs/audit-finition/avant/` et `docs/audit-finition/apres/`, fichiers `360-…` et `390-…` : connexion, scanner, fiche d'ajout, accueil (Maison, feuille de création, Liste), meuble ouvert, fiche produit, Plus, Compte, Meubles et étagères, boîte de suppression, Administration, Foyers, Comptes, Catégories, Correspondances.

---

# Deuxième passe : interface propre (26 novembre 2026)

Branche `fix/interface-propre`, après les points 1 à 4 (en-tête allégé, filtres dans un seul panneau, défilement dans une zone interne, menus des meubles, écran « Meubles et étagères » plus léger). Même skill [`unslop`](https://github.com/heydamir/unslop) (Damir Sokolovsky, CC BY 4.0), même cadre : l'identité Indigo Ambre prime, aucune image générée, aucun service payant.

**Méthode.** Captures de chaque écran de la « grande maison » des e2e (8 meubles, 60 produits) à 360 × 740, 390 × 844 et 1440 × 800, haut d'écran et après défilement (`e2e/captures/interface.spec.ts`), avant et après. Elles sont publiées sur la branche `captures/interface-propre` pour ne pas alourdir `main`. Balayage du code : valeurs arbitraires, `transition-all`, animations en boucle, `hover:scale`, points d'exclamation, emoji, couleurs en dur (`scripts/check-colors.mjs`).

**Verdict.** Finition légère : aucun dégradé, aucune lueur, aucun emoji, une seule famille d'icônes (Lucide), aucune couleur en dur. Les corrections portent sur la mise en page des cartes, les durées de mouvement et la cohérence des libellés.

## Passes

1. **Espacements** : en-tête fixe sur la grille de 4 px (12 en haut, rangées de 44 px séparées de 8, 8 en bas), soit 176 px à 360 × 740. Zone qui défile avec une marge de 16 px sur les côtés (les ombres des cartes ne sont plus rognées). Cartes de l'accueil : même hauteur par rangée (la grille étire, hauteur minimale de 208 px pour la tuile d'ajout), nombre d'articles poussé en bas (`mt-auto`), nom limité à deux lignes. Une seule valeur arbitraire restante : la pastille « bientôt périmé » à 100 px du haut, posée au pied du dessin.
2. **Couleurs** : rien à corriger. Un seul accent ambre : bouton d'ajout, pastille « bientôt périmé », pastille du nombre de filtres, onglet actif. Filet de 1 px (`--line`) sous l'en-tête seulement quand la zone a quitté le haut, sans ombre ni dégradé.
3. **Icônes** : « ⋯ » (`Ellipsis`) pour le menu des meubles, à la même taille (22 px) que le bouton Filtres ; icônes du menu en `indigo-mid`, 20 px ; grille d'icônes des meubles en 24 px. Plus de liste déroulante de 40 icônes.
4. **Textes** : libellé « Vide » sur une carte de meuble vide, comme sur les étagères du meuble ouvert et dans « Meubles et étagères » (au lieu de « 0 article ») ; rappel des filtres sans préfixe (« Frigo · Boissons ») et bouton « Effacer » ; compteur « 60 articles · 120 unités » en texte d'aide en tête de la Liste ; messages de confirmation qui nomment l'objet (« Frigo est maintenant en position 1 sur 8. », « Étagère 2 supprimée : ses produits sont sur le plateau « Non rangé ». »). Aucun point d'exclamation, aucun texte provisoire trouvé.
5. **Typographie** : Carlito partout, rien à corriger. Titres d'écran sur deux lignes au plus (`line-clamp-2`) au lieu d'être coupés.
6. **Mise en page** : grille de l'accueil sur 2 colonnes au téléphone, 3 en tablette, 4 sur grand écran (cadre élargi à 768 px à partir de 1024 px de large, barre du bas comprise). Tuile « Ajouter un meuble » toujours en dernier, de la taille d'une carte. Nom de meuble aligné à gauche, nombre d'articles en bas à gauche et bouton « ⋯ » dans le coin bas droit : le bouton ne chevauche plus le dessin des meubles larges (cave, buffet).
7. **Détails** : états vides, chargement (« Chargement… », `role="status"`), erreur (encadré « Un instant », `role="alert"`) et hors ligne (encadré « Pas de connexion ») identiques sur tous les écrans. Rayons inchangés (cartes 16 px, champs et boutons 12 px). Focus visible sur la zone qui défile (anneau intérieur, pour ne pas être rogné).
8. **Visuels** : aucun ajout. Les dessins de meubles restent le seul moment illustré.
9. **Mouvement** : appui sur une carte (porte entrouverte, lumière) passé de 120 à 150 ms ; tiroirs du congélateur de 320 à 300 ms ; flèche des sections de la Liste et chevron des lignes de « Meubles et étagères » en 200 ms avec décélération ; filet de l'en-tête et survol des lignes du menu en 150 à 200 ms. Jamais linéaire, toujours coupé par `prefers-reduced-motion`, aucun mouvement ne retarde une action (le focus est posé avant l'animation des feuilles).

## Propositions refusées (cahier des charges ou identité)

- Étiquettes de section en majuscules interlettrées, titres en 700, deux fonds blanc et indigo : imposés par le cahier (comme lors de la première passe).
- Porte du meuble ouvert en 600 ms et lumière en 260 ms après 200 ms : fixées par la Phase 1.5 ; elles ne retardent aucune action et sont coupées en mouvement réduit.

## Phase 3 : nouveaux écrans (26/11/2026)

Audit `unslop` (mode polissage, identité Indigo Ambre prioritaire) sur Courses, Statistiques, compteurs de l'inventaire et fiche article.

- Aucun dégradé, aucune lueur, aucun emoji, aucune couleur en dur (`check-colors`), une seule famille d'icônes (Lucide), chiffres en `tabular-nums`, mouvements nommés (`transition-colors`), aucune boucle d'animation.
- Corrigé : l'étiquette « Proposée » du choix de catégorie était en capitales espacées (contraire à U1), elle passe en casse normale ; la légende du taux de gaspillage perd son point final.
- Rien d'autre à changer : l'ambre reste réservé à l'état actif, aux pastilles et aux dates proches.

## Phase 4 : écrans touchés (27/11/2026)

Audit `unslop` (mode polissage) sur le scanner plein écran, la fiche du bas, « À synchroniser », les glissements, les squelettes, les états vides illustrés et le thème sombre.

- Aucun dégradé, aucune lueur, aucun emoji, aucune capitale espacée, aucune couleur en dur (`check-colors`) ; les illustrations n'utilisent que les jetons `illustration-*`, avec l'ambre comme seule touche.
- Seule boucle d'animation : le squelette de chargement (état vivant), coupé par `prefers-reduced-motion`.
- Corrigé : une seule courbe d'accélération ; l'apparition des images reprend celle des feuilles (`cubic-bezier(0.2, 0, 0, 1)`).
