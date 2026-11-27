# Cahier des charges — Inventaire de garde-manger familial

14 novembre 2026 · Lucas

## Vision et périmètre

Une application web familiale (PWA, utilisable depuis le téléphone) qui tient l'inventaire de la maison — garde-manger, frigo, cave, congélateur — en scannant les codes-barres. Elle tourne sur le VPS OVH, sous un nom de domaine existant, et chaque brique (front, back, base de données) est dans un conteneur Docker.

**Objectifs**

- Ajouter un produit en moins de 5 secondes : scan, quantité, valider.
- Un produit inconnu n'est décrit qu'une seule fois ; tous les scans suivants le reconnaissent.
- Parcourir le stock comme on ouvre un meuble : cave, frigo, congélateur et garde-manger dessinés avec leurs étagères, et une vue Liste par catégorie.
- Un stock partagé par toute la famille, avec un compte par personne ; plusieurs familles (foyers) peuvent partager l'instance sans jamais voir les données les unes des autres.
- Installer l'application sur l'écran d'accueil du téléphone, avec une invitation à le faire tant qu'elle ne l'est pas.

**Principes**

- Simple avant tout : c'est un outil familial, pas un produit SaaS. Pas d'inscription publique, pas d'e-mail, pas de fonctionnalité qui demande de la maintenance.
- Mobile d'abord : l'écran de scan est l'écran principal.
- Aucune dépendance payante : Open Food Facts est gratuit et sans clé.
- Les données restent sur le VPS.

## Utilisateurs et authentification

Chaque compte appartient à exactement un **foyer** : les comptes d'un foyer voient et modifient le même stock, et chaque action garde le nom de son auteur. Deux foyers ne voient jamais rien l'un de l'autre (inventaire, catalogue, catégories, photos, historique). Un utilisateur seul forme un foyer d'une personne. Le foyer est invisible pour les membres : aucun écran ni aucune réponse de l'API qui leur est destinée ne le nomme.

- **Compte** : pseudo (unique sur toute l'instance, insensible à la casse) + mot de passe. Pas d'e-mail, pas de connexion tierce.
- **Pas d'inscription publique.** Le premier compte admin est créé au premier démarrage, avec le foyer « Famille » (variables d'environnement), ou par la commande `npm run household:create -- --name "…" --admin "pseudo"`. Foyers et comptes se créent ensuite uniquement dans la console d'administration, avec un mot de passe temporaire.
- **Rôles** : `admin` (l'administrateur de l'instance : foyers, comptes, et catégories et correspondances de n'importe quel foyer choisi explicitement ; il appartient lui aussi à un foyer et ne lit jamais l'inventaire d'un autre) et `membre` (l'inventaire de son foyer, ses meubles et étagères, son mot de passe). Chacun peut changer son propre mot de passe ; l'admin peut réinitialiser, désactiver ou changer de foyer un compte (ses sessions sont alors coupées). Une route réservée à l'admin répond 404 à un membre.
- **Mots de passe** : hachés avec argon2id, 8 caractères minimum, jamais journalisés.
- **Session** : cookie `httpOnly`, `Secure`, `SameSite=Lax`, valable 30 jours glissants pour ne pas se reconnecter à chaque scan. Les sessions sont stockées en base afin de pouvoir les révoquer.
- **Anti-force-brute** : 5 échecs de connexion en 15 minutes bloquent le couple pseudo + adresse IP pendant 15 minutes.
- **Fait à la main** : pas de NextAuth, Auth0 ni Keycloak. Une table `users`, une table `sessions`, quelques routes.

## Fonctionnalités du MVP

Le MVP couvre sept écrans. Les quantités sont des entiers (nombre d'unités, pas de grammes) ; un article qui tombe à 0 disparaît de l'inventaire mais reste dans le catalogue.

### 1. Scanner (écran d'accueil)

- Caméra arrière en plein écran, détection automatique EAN-13, EAN-8, UPC-A et UPC-E.
- Retour sonore et vibration à la détection ; bouton lampe torche quand le navigateur le permet.
- Saisie manuelle du code-barres en secours.
- Bascule **Ajouter / Retirer** : en mode Retirer, un scan décrémente le stock de 1.
- Bouton « Ajouter et scanner le suivant » pour enchaîner les articles d'un sac de courses. Un lien « Ajouter sans code-barres » ouvre une recherche dans le catalogue par nom, pour les fruits, légumes et produits de boucherie.

### 2. Fiche d'ajout (produit connu)

Photo, nom, marque, catégorie, **quantité** (stepper, 1 par défaut), **lieu** (prérempli avec le lieu habituel du produit), étagère facultative (sinon le plateau « Non rangé » du meuble), date limite facultative. Si le produit est déjà en stock dans ce lieu avec la même date, la quantité s'additionne.

### 3. Formulaire produit inconnu

S'ouvre quand le code-barres n'est ni dans la base locale ni sur Open Food Facts, ou quand la fiche Open Food Facts est trop pauvre (pas de nom). Champs : nom (obligatoire), marque, catégorie (obligatoire), lieu habituel, photo (prise avec la caméra, facultative). À la validation, le produit entre au catalogue : le prochain scan le reconnaît sans rien demander.

### 4. Inventaire : vues Maison et Liste

Deux vues, avec une bascule en haut de l'écran : **Maison** (par défaut, voir la section Vue Maison) et **Liste**.

La vue Liste :

- Onglets par lieu (Tout, Garde-manger, Frigo, Cave, Congélateur), puis sections repliables par catégorie.
- Cartes avec photo, nom, marque, quantité et boutons − / +.
- Recherche par nom ou marque, filtre par catégorie, tri par nom, date d'ajout ou date limite.
- Pastille de date limite : ambre avec la mention « J-3 » à 3 jours ou moins, rouge avec la mention « Périmé » si elle est dépassée.
- Compteurs en en-tête : nombre d'articles et d'unités par lieu.

### 5. Fiche produit

Modifier nom, catégorie, photo et lieu habituel ; voir le stock par lieu et l'historique des mouvements (qui, quand, combien). Une modification de catégorie s'applique à tout le stock du produit.

### 6. À classer (supprimé)

L'écran a été retiré le 16 novembre 2026 : la catégorie proposée par Open Food Facts se confirme ou se change dans la fiche d'ajout, au moment du scan (voir `TASKS.md` P1.47 et P1.48).

### 7. Administration (rôle admin)

Console de l'instance : **Foyers** (liste avec leurs comptes et leur nombre de meubles, création, renommage, suppression d'un foyer sans compte après avoir retapé son nom), **Comptes** (tous les comptes avec leur foyer ; création dans un foyer existant ou dans un nouveau foyer créé dans la même transaction ; changement de foyer, désactivation, réinitialisation du mot de passe ; le dernier admin ne peut être ni désactivé, ni rétrogradé), **Catégories** et **Correspondances Open Food Facts** d'un foyer choisi en haut de l'écran. Les meubles et leurs étagères se gèrent dans **Plus > Meubles et étagères**, ouvert à tous les comptes pour leur propre foyer.

### Catégories et lieux par défaut

Les valeurs ci-dessous forment le modèle copié dans chaque nouveau foyer (au premier démarrage pour « Famille », puis à chaque création de foyer) ; chaque foyer les modifie ensuite sans toucher aux autres.

| Catégories | Lieux |
| --- | --- |
| Boissons, Alcools et vins, Viandes, Poissons et fruits de mer, Produits laitiers et œufs, Fruits et légumes, Pâtes, riz et féculents, Conserves, Épicerie sucrée, Biscuits et snacks, Condiments et sauces, Surgelés, Petit-déjeuner, Hygiène et entretien, Autre | Garde-manger, Frigo, Cave, Congélateur |

### Photos

L'image Open Food Facts est téléchargée une fois, redimensionnée (400 px de large, WebP) et stockée sur le VPS : l'inventaire ne dépend pas d'un service externe pour s'afficher. Sans image Open Food Facts, un pictogramme de la catégorie sert de vignette.

## Vue Maison : cave, frigo, congélateur, garde-manger

L'inventaire s'ouvre sur la maison : les meubles du foyer dessinés, chacun avec ses étagères et ses produits posés dessus (quatre dans le modèle : garde-manger, frigo, congélateur, cave). Un bouton en haut bascule vers la vue Liste (par lieu et par catégorie, décrite plus haut). La maison est la vue par défaut.

**Meubles modulables.** Chaque compte ajoute et supprime les meubles de son foyer (12 au plus), par exemple trois frigos, deux congélateurs et une cave. Un meuble a un type (garde-manger, frigo, congélateur, cave ou placard), un nom unique dans le foyer sans tenir compte de la casse, et de 1 à 8 étagères, tiroirs ou rangées : au nombre par défaut, celles du modèle ; sinon « Étagère n », « Tiroir n » ou « Rangée n ». Supprimer un meuble qui contient des produits demande de choisir le meuble qui les reçoit, dans son plateau « Non rangé » (quantités additionnées, mouvements `move` écrits) ; la boîte de confirmation nomme le meuble et la conséquence, sans annulation différée. Le journal garde le nom du meuble et de l'étagère de chaque mouvement : l'historique reste lisible après une suppression.

> Schéma non inclus dans cet export (maquette · vue Maison, 4 meubles). La description textuelle autour fait foi.

| Meuble | Dessin | Étagères par défaut |
| --- | --- | --- |
| Garde-manger | Placard à deux portes battantes ; ouvert : étagères indigo, un spot ambre au-dessus de chacune | 4 étagères |
| Frigo | Frigo à une porte ; ouvert : porte restée sur le côté, intérieur éclairé en ambre, étagères en verre | 4 étagères, 2 bacs à légumes, balconnet de porte |
| Congélateur | Meuble à une porte ; ouvert : un tiroir par étagère (face blanche, poignée en haut), sans lumière | 3 tiroirs |
| Cave | Meuble à deux portes battantes ; ouvert : rangées de casier à montants et une étagère pour les caisses, un spot ambre au-dessus de chacune | 3 rangées de casier, 1 étagère « Caisses et packs » |

Un meuble est un vrai meuble vu de face : sa porte s'ouvre quand on y entre, et la lumière ambre signifie toujours « c'est ici ». Le dessin dépend du type du meuble et du type de l'étagère, jamais de leur nom : toutes les étagères du frigo se dessinent de la même manière, bacs à légumes et balconnet compris, et chaque étagère du congélateur est un tiroir.

Les étagères sont des données, pas du dessin : l'admin peut les renommer, les réordonner, en ajouter ou en retirer. Chaque étagère a un type, casier (bouteilles couchées) ou étagère (produits posés), qui décide de son dessin. La cave a ainsi trois rangées de casier pour le vin et une étagère « Caisses et packs » pour les packs de soda et d'eau. Un produit peut de toute façon aller dans n'importe quel meuble : la catégorie ne contraint pas le lieu. Tout produit non placé sur une étagère va dans un plateau « Non rangé » propre à chaque meuble.

**Comportement**

1. **Écran Maison** : les meubles en grille (2 colonnes sur téléphone, la page défile quand ils sont nombreux ; 4 en ligne sur ordinateur), dessinés fermés : porte(s) blanche(s) avec poignée et reflet, le nom toujours visible sous la carte. Chaque meuble affiche son nombre d'articles et une pastille ambre « n bientôt périmés » quand c'est le cas. À l'appui, la porte s'entrouvre (20°, 120 ms) et un halo ambre apparaît : c'est un retour tactile, la navigation part immédiatement. Une dernière tuile « Ajouter un meuble » ouvre la feuille de création (type en cartes, nom proposé comme « Frigo 2 », nombre d'étagères) ; après la création, le focus va sur la nouvelle carte. Sans meuble, un message et un seul bouton « Ajouter votre premier meuble ».
2. **Ouvrir un meuble** : un toucher l'ouvre et il occupe l'écran. Ses portes pivotent en 600 ms puis restent ouvertes sur le côté, sans recouvrir les étagères : une porte articulée à gauche pour le frigo et le congélateur, deux battants pour le garde-manger, la cave et tout autre meuble. Ouverte, chaque porte est une lamelle de 20 px accolée au bord du corps et aussi haute que lui ; le corps prend toute la largeur utile. Hors congélateur, une fine barre de lumière ambre s'allume sur le bord haut intérieur (260 ms, après 200 ms, opacité 0,6 au plus) et les tiroirs du congélateur coulissent l'un après l'autre (320 ms, 60 ms de décalage), puis restent ouverts : leur contenu est toujours visible. Il n'y a pas de bouton « Ouvrir » ou « Fermer » : le retour se fait par le lien « Maison ». Le cadre du meuble épouse son contenu et ne dépasse jamais l'espace disponible ; toutes ses étagères ont la même hauteur (120 px au plus, partagée sur téléphone), le plateau « Non rangé » fait 56 px quand il est vide. Les étagères sont empilées : en haut les vignettes, en bas le nom de l'étagère puis sa planche ; chaque produit est une vignette carrée avec sa photo, ou le pictogramme de sa catégorie, et une pastille ambre de quantité ; une pile décorative derrière la vignette grandit avec la quantité (jusqu'à 4 cartes à partir de 5 unités). Une étagère trop pleine défile horizontalement, sans barre de défilement visible.
3. **Toucher un produit** : un panneau remonte du bas avec la photo, le nom, la quantité (− / +), la date limite, un bouton **Déplacer vers…** (autre étagère ou autre meuble) et un lien vers la fiche produit.
4. **Glisser-déposer** : appui long puis glisser une vignette vers une autre étagère. L'étagère survolée s'entoure d'un anneau et d'un halo ambre. Pendant le glissement, une barre de meubles reste visible en haut pour déposer dans un autre meuble. Le bouton **Déplacer vers…** reste l'alternative sans glisser.
5. **Recherche et filtres** : une recherche et des puces de catégorie en haut. Les produits qui ne correspondent pas s'estompent et les meubles qui en contiennent un s'entourent d'ambre, porte entrouverte (12°) et lumière allumée ; les autres restent fermés.
6. **Étagère vide** : mention « Vide » centrée et un bouton + qui ouvre le scanner avec ce meuble et cette étagère déjà choisis ; contour pointillé couleur `lavender-line` autour de cette zone, jamais dans un tiroir. Un tiroir vide n'affiche pas « 0 article ».
7. **Scanner depuis un meuble** : le meuble et l'étagère ouverts deviennent les valeurs par défaut de la fiche d'ajout.
8. **Déplacer** un produit écrit un mouvement `move` dans le journal.

**Mise en œuvre**

- Sur l'écran Maison, chaque meuble est un dessin SVG recouvert de ses portes. Ouvert, le meuble est une coque HTML commune (corps, porte ou portes, lumière) paramétrée par le type du meuble, qui contient les étagères et le plateau « Non rangé » ; les vignettes sont des boutons HTML. Les styles sont dans `apps/web/app/furniture.css`.
- La profondeur vient d'ombres légères et d'un reflet, jamais d'un dégradé. Hors l'ombre de carte du corps et la lueur de la lumière, les ombres du meuble sont sans flou : une ombre floutée coûte cher à chaque image dès que quelque chose bouge ou défile. La lumière est une barre ambre de 4 px et sa lueur (`box-shadow`), sans `filter`, dont seule l'opacité est animée ; aucune ne couvre un texte. Aucune couleur écrite en dur : variables de `tokens.css` et `color-mix()`.
- La perspective est écrite dans la transformation de chaque porte (`perspective()`), et le verso de la porte apparaît par opacité : ni `perspective` héritée d'un parent, ni `preserve-3d`, ni `backface-visibility`, que WebKit ne rend pas partout de la même façon.
- Portes, lumière, reflets, piles et dessins SVG sont du décor : `aria-hidden`, `pointer-events: none`, aucun élément focusable. La lumière ne porte jamais seule une information (le résultat de recherche a son anneau, les péremptions ont leur pastille). La vue Liste reste l'alternative accessible.
- Glisser-déposer avec `@dnd-kit/core`, accessible au clavier ; animations et transitions CSS sur `transform` et `opacity` uniquement, jamais en boucle. Avec `prefers-reduced-motion`, le meuble apparaît directement ouvert, lumière allumée, sans transition ni retard.
- Les vignettes utilisent les miniatures WebP locales de 400 px.
- Les dessins n'emploient que les couleurs Indigo Ambre ci-dessous ; ce sont les seules illustrations de l'application.

## PWA et fenêtre d'installation

L'application s'installe depuis le navigateur sur l'écran d'accueil, s'ouvre en plein écran comme une application native et propose elle-même l'installation tant qu'elle n'est pas installée.

**Manifeste** (`/manifest.webmanifest`)

| Champ | Valeur |
| --- | --- |
| `name`, `short_name` | Nom de l'application à définir ; nom court de 12 caractères maximum |
| `start_url`, `scope` | `/` |
| `display`, `orientation` | `standalone`, `portrait` |
| `lang` | `fr` |
| `theme_color`, `background_color` | `#ffffff`, `#ffffff` (barre d’état blanche) |
| `icons` | 192 px, 512 px et 512 px `maskable` (fond indigo, motif blanc avec un point ambre), plus une `apple-touch-icon` de 180 px |

**Service worker**

- Précache la coquille (JS, CSS, polices, icônes) ; appels `/api` en réseau seul, photos comprises : aucune donnée d'un foyer n'est gardée par le service worker, si bien qu'un autre foyer sur le même téléphone ne voit jamais rien en cache. Les photos sont gardées par le navigateur (`Cache-Control: private, no-cache` et ETag : le serveur vérifie le foyer à chaque affichage). Les caches sont vidés à la connexion et à la déconnexion.
- Hors connexion : la coquille s'ouvre et un encadré « Pas de connexion » explique que l'ajout et le retrait sont indisponibles et que l'inventaire ne s'affiche pas.
- Cache versionné, **mise à jour silencieuse** : l'application ne demande jamais rien pour se mettre à jour (aucun message, aucun bouton).
  - Le service worker d'une nouvelle version prend la main tout seul (`skipWaiting`, `clientsClaim`) et supprime le précache de la version précédente.
  - L'application cherche une mise à jour au lancement et à chaque retour au premier plan (`visibilitychange`).
  - La page ouverte passe à la nouvelle version à la navigation suivante d'un écran à l'autre, ou au prochain lancement ; jamais pendant une action : caméra du scanner active, texte saisi non enregistré, glisser-déposer en cours, feuille ou panneau ouvert.
  - Garde-fou : si une page ouverte avant un déploiement demande un fichier JavaScript qui n'existe plus (erreur de chargement de bloc), elle se recharge une seule fois, sans message (drapeau en `sessionStorage`, au plus un rechargement toutes les 5 minutes).

**Fenêtre d'installation**

- Elle s'affiche après la connexion, **seulement si l'application n'est pas installée** (ni `display-mode: standalone`, ni `navigator.standalone`). Jamais sur l'écran de connexion.
- **Chrome, Edge, Android** : l'application capte l'événement `beforeinstallprompt`, le met de côté (`preventDefault`) et le déclenche avec `prompt()` au clic sur **Installer**. L'événement `appinstalled` ferme la fenêtre.
- **Safari iOS** : pas d'événement disponible. La même fenêtre montre trois étapes illustrées : Partager, Sur l'écran d'accueil, Ajouter.
- Navigateur sans support : aucune fenêtre.
- **Plus tard** la masque 7 jours ; **Ne plus afficher** la masque définitivement (mémorisé sur l'appareil). Un lien **Installer l'application** reste dans Plus tant qu'elle n'est pas installée.
- Présentation : feuille qui monte du bas, composant `Callout` (fond `amber-tint`, pastille ambre avec icône téléphone, titre en indigo, une phrase, bouton principal indigo).
- Prérequis : HTTPS, manifeste valide, service worker enregistré.

## Compatibilité : Android, iOS et ordinateur

L'application doit s'installer et scanner sur tous les appareils courants. Aucune application web ne se comporte de façon identique partout ; la règle est donc que chaque fonction a une solution de repli, pour qu'aucun appareil ne soit bloqué.

| Plateforme | Installation | Scan avec la caméra | Points d'attention |
| --- | --- | --- | --- |
| iPhone et iPad, Safari | Manuelle : Partager, puis Sur l'écran d'accueil. Pas d'événement `beforeinstallprompt` : la fenêtre d'installation montre les étapes | Oui, avec `@zxing/browser` (`BarcodeDetector` est absent de Safari) | Pas de lampe torche ; l'autorisation de la caméra peut être redemandée à l'ouverture ; attribut `playsinline` obligatoire |
| iPhone et iPad, Chrome, Edge, Firefox (iOS 16.4 ou plus) | Menu Partager, puis Sur l'écran d'accueil, même geste que Safari | Oui : tous les navigateurs iOS utilisent le moteur de Safari | Mêmes limites que Safari |
| Android, Chrome et Edge | Fenêtre native via `beforeinstallprompt` | Oui, `BarcodeDetector` s'il existe, sinon ZXing | Lampe torche et mise au point continue quand l'appareil les propose |
| Android, Samsung Internet | Fenêtre native ou menu Ajouter à l'écran d'accueil | Oui | À valider sur appareil réel |
| Android, Firefox | Menu du navigateur ; pas de `beforeinstallprompt` : la fenêtre montre les instructions | Oui, ZXing | — |
| Ordinateur, Chrome et Edge | Icône d'installation dans la barre d'adresse | Oui avec la webcam, moins pratique | Lecteur USB ou Bluetooth pris en charge |
| Mac, Safari 17 ou plus | Fichier, puis Ajouter au Dock | Oui avec la webcam | — |
| Ordinateur, Firefox | Installation de PWA non prise en charge ou limitée | Oui avec la webcam | L'application fonctionne dans un onglet, sans fenêtre d'installation |

Deux limites ne se contournent pas à ce jour : iOS n'offre aucun bouton d'installation natif, et le navigateur iOS ne donne pas accès à la lampe torche. Le cahier prévoit donc des étapes guidées pour l'installation et masque le bouton lampe quand elle n'est pas disponible.

**Scan avec la caméra**

1. Une seule interface `Scanner` cache deux moteurs : `BarcodeDetector` (formats EAN-13, EAN-8, UPC-A, UPC-E) quand le navigateur l'offre, sinon `@zxing/browser` ou `zxing-wasm`. Le reste de l'application ignore lequel tourne.
2. Flux vidéo : caméra arrière (`facingMode: environment`), résolution idéale 1280 par 720, `playsinline` et `muted`, démarré par un geste de l'utilisateur (bouton Scanner).
3. Mise au point continue et lampe torche demandées seulement si `getCapabilities()` les expose ; sinon le bouton lampe est masqué.
4. Cadre de visée large et horizontal, adapté à la forme des codes-barres ; environ 10 lectures par seconde pour ménager la batterie ; caméra coupée dès que l'utilisateur quitte l'écran ou masque l'onglet.
5. Caméra refusée : un message explique comment l'autoriser dans les réglages du navigateur, avec les étapes de la plateforme détectée. Le proxy envoie `Permissions-Policy: camera=(self)` et ne bloque jamais la caméra.

**Solutions de repli, dans l'ordre**

1. Saisie manuelle du code-barres, avec le clavier numérique.
2. Bouton « Prendre une photo du code » : un champ `<input type="file" accept="image/*" capture="environment">` ouvre l'appareil photo du système, et ZXing décode l'image. Cela fonctionne même sans flux vidéo ni autorisation continue.
3. Lecteur de codes-barres USB ou Bluetooth : le champ de code capte la saisie clavier terminée par Entrée.
4. Recherche du produit par nom dans le catalogue.
5. Navigateur intégré d'une application (Instagram, Facebook, WhatsApp) : l'application le détecte et affiche « Ouvrez cette page dans Safari ou Chrome ».

**Installation et affichage**

- Le module d'installation détecte la plateforme et choisit entre l'événement natif, les étapes iOS et les instructions Firefox.
- iOS : balises `apple-mobile-web-app-capable` et `apple-mobile-web-app-status-bar-style`, icône `apple-touch-icon` de 180 px, `viewport-fit=cover` et marges `env(safe-area-inset-*)` pour l'encoche et la barre de navigation du bas.
- Une fois installée sur iOS, l'application n'est plus soumise à la purge des données de site après une période sans visite : l'installation est donc recommandée aux utilisateurs d'iPhone.
- Versions visées : iOS 16.4 ou plus, et des versions récentes de Chrome, Edge, Samsung Internet, Firefox et Safari.

**Recette sur appareils réels avant la mise en service**

- [ ] Un iPhone récent : installation, plein écran, scan, refus puis autorisation de la caméra.
- [ ] Un téléphone Android : installation par la fenêtre native, plein écran, scan, lampe torche.
- [ ] Un ordinateur : utilisation dans le navigateur, webcam, lecteur USB si disponible.
- [ ] Sur chaque appareil, trois codes scannés (EAN-13, EAN-8, UPC-A), dont un en lumière faible.
- [ ] Sur chaque appareil, un ajout hors connexion refusé avec le message « Pas de connexion ».
- [ ] Chaque solution de repli testée une fois : saisie manuelle, photo du code, recherche par nom.

## Identité visuelle (Indigo Ambre)

L'application reprend le design system Indigo Ambre : indigo profond, un seul accent ambre, cartes blanches à pastille d'icône, aucun effet superflu. Les valeurs ci-dessous sont les tokens du système, adaptés au web ; ils deviennent les variables CSS du projet (`tokens.css`).

| Token | Code | Usage dans l'application |
| --- | --- | --- |
| `indigo` | `#3f51a8` | Couleur de marque, bleu ardoise (refonte HIG, `docs/hig.md`) : bouton principal, élément actif, liens. Titres en `ink`. Texte blanc dessus |
| `indigo-mid` | `#4a3dd0` | Liens, états pressés ou survolés, étiquettes de section sur fond blanc |
| `lavender` | `#eae7fb` | Pastille ronde derrière une icône, intérieur des meubles, puces de filtre |
| `lavender-line` | `#c9c2f0` | États vides, contours pointillés, détails discrets |
| `amber` | `#ffcc65` | Accent unique : pastille de quantité, onglet actif, boutons d'ajout, lumière du frigo, chiffres sur carte indigo. Jamais en texte sur blanc |
| `amber-tint` | `#fff6e5` | Encadrés d'information (installation, délai de péremption proche) |
| `white` | `#ffffff` | Fond de l'application et des cartes ; texte sur indigo |
| `ink` | `#1a1a1a` | Texte très sombre, rare |
| `grey` | `#595959` | Texte courant sur blanc |
| `line` | `#e2e8f0` | Filet fin autour des cartes |
| `ok`, `ok-tint` | `#2c8a4a`, `#eaf5ee` | Statut positif, toujours accompagné d'un mot |
| `alert` | `#c0392b` | Statut négatif (périmé), toujours accompagné d'un mot |

Contrastes calculés : blanc sur indigo 12,8 pour 1 ; indigo sur ambre 8,6 pour 1 ; gris sur blanc 7,0 pour 1 ; ambre sur blanc 1,5 pour 1, donc jamais de texte ambre sur fond blanc.

**Typographie** : Carlito (libre, métriquement compatible avec Calibri), auto-hébergée en WOFF2 en 400 et 700, avec Calibri puis Arial en repli. Échelle web :

| Rôle | Style | Couleur |
| --- | --- | --- |
| Titre d'écran | 700, 28 px / 34 px | `indigo` |
| Étiquette de section | 700, 12 px / 16 px, majuscules, interlettrage 0,12 em | `indigo-mid` sur blanc, `amber` sur indigo |
| Titre de carte | 700, 18 px / 24 px | `indigo` |
| Texte courant | 400, 16 px / 24 px | `grey` |
| Texte de carte | 400, 14 px / 20 px | `grey` |
| Compteur (carte de chiffre) | 700, 40 px / 44 px | `amber` sur fond `indigo` |
| Aide, pied de carte | 400, 12 px / 16 px | `grey` |

**Formes et composants**

- Fonds (révisés en Phase 5, décision P5.6) : `surface` (neutre très clair, légèrement chaud) pour la page, `surface-raised` (blanc) pour les cartes, `surface-group` pour les regroupements ; `indigo` pour `indigo` les cartes de chiffres et l'en-tête de la vue Maison. Pas de dégradé, pas de bandeau de couleur, pas de soulignement sous les titres.
- Cartes : fond blanc, filet `line`, rayon 16 px ; cartes de liste sans ombre, ombre douce teintée indigo (`shadow-raised`) pour les éléments posés, `shadow-sheet` pour les feuilles (Phase 5). Pas de bordure épaisse. Pastilles d'icône rondes (rayon 50 %).
- Espacements : 8, 16, 24 et 40 px. Zones tactiles de 44 px minimum.
- Boutons : principal indigo avec texte blanc ; d'ajout ambre avec texte indigo ; secondaire en texte `indigo-mid`.
- Trois composants repris du système : `Card` (carte blanche à icône, ex. un produit), `StatCard` (carte indigo avec chiffre ambre, ex. compteur d'un meuble), `Callout` (encadré `amber-tint`, ex. installation, hors connexion).
- Icônes : jeu Lucide, glyphe indigo dans une pastille lavande (blanc sur fond indigo). Pas d'emoji. Chaque catégorie et chaque lieu a une icône.
- Thème clair uniquement (confirmé en Phase 5) : aucune variante sombre, quel que soit le réglage du téléphone.
- Statuts : toujours un mot en plus de la couleur (« périmé », « J-2 »), jamais la couleur seule.
- Ton : libellés en français, titres qui affirment, phrases courtes.

## Modèle de données

PostgreSQL 16, migrations versionnées (Prisma ou Drizzle au choix de l'implémentation). Le catalogue de produits est séparé du stock : un produit existe une fois par foyer, son stock peut être réparti sur plusieurs lieux et plusieurs dates limites.

Chaque table de données porte `household_id` (le foyer), indexé et obligatoire ; un enfant référence son parent par une clé composite `(id, household_id)`, si bien qu'une ligne ne peut jamais pointer vers l'objet d'un autre foyer. La sécurité par ligne de PostgreSQL (activée et forcée) filtre sur `household_id = app.household_id`, valeur posée par l'API au début de chaque transaction ; sans foyer, aucune ligne n'est visible. L'application tourne sous un rôle sans superutilisateur ni `BYPASSRLS`, les migrations sous le propriétaire.

| Table | Colonnes clés | Rôle |
| --- | --- | --- |
| `households` | id, name (unique, insensible à la casse), created\_at | Foyers |
| `users` | id, household\_id, username (unique, minuscules), password\_hash, role (`admin` ou `member`), created\_at | Comptes, chacun dans un foyer |
| `sessions` | id (hash du jeton), user\_id, expires\_at, created\_at, user\_agent | Sessions révocables |
| `locations` | id, household\_id, name (unique par foyer, sans casse), kind (`pantry`, `fridge`, `freezer`, `cellar` ou `other`), icon, sort\_order | Meubles du foyer (12 au plus) ; `kind` choisit le dessin du meuble |
| `shelves` | id, location\_id, name, kind (rack ou plain), sort\_order | Étagères, tiroirs, rangées et bacs d'un meuble ; le type (casier ou étagère) choisit le dessin |
| `categories` | id, name, icon, sort\_order | Catégories d'affichage |
| `off_category_map` | off\_tag (unique par foyer), category\_id | Tag Open Food Facts vers catégorie, ex. `en:beverages` vers Boissons |
| `products` | id, barcode (unique par foyer, nullable), name, brand, size\_label, image\_path, category\_id, default\_location\_id, source (`off` ou `manual`), category\_guessed (bool), off\_payload (jsonb), created\_by, created\_at, updated\_at | Catalogue du foyer : un même code-barres donne une fiche par foyer |
| `stock_items` | id, product\_id, location\_id, shelf\_id (nullable), quantity (entier ≥ 0), expiry\_date (nullable), updated\_at | Stock courant ; unique sur (product\_id, location\_id, shelf\_id, expiry\_date) ; `shelf_id` nul = plateau « Non rangé » |
| `stock_movements` | id, product\_id, location\_id et shelf\_id (entiers simples), location\_name et shelf\_name (noms au moment du mouvement), delta (entier signé), reason (`scan_add`, `scan_remove`, `manual`, `move`, `correction`), user\_id, created\_at | Journal, jamais modifié, qui survit à la suppression d'un meuble |

**Règles**

- `barcode` est nullable pour accepter un produit sans code-barres (fruits et légumes, boucherie) créé à la main.
- Chaque changement de `stock_items` écrit une ligne dans `stock_movements` dans la même transaction ; le stock courant reste reconstructible depuis le journal.
- Un déplacement entre étagères ou meubles écrit deux mouvements `move` (moins à l'origine, plus à la destination) dans la même transaction.
- Une quantité qui atteint 0 supprime la ligne `stock_items`, jamais le produit. Supprimer une étagère renvoie ses produits au plateau « Non rangé ».
- `category_guessed` vaut vrai quand la catégorie vient de la table de correspondance et que personne ne l'a encore confirmée ; la fiche d'ajout l'affiche alors comme « proposée » et l'enregistre comme confirmée à l'ajout.
- Index : `products(barcode)`, `products` en trigram sur `name` (extension `pg_trgm`, pour la recherche par nom), `stock_items(location_id, shelf_id)`, `stock_items(expiry_date)`. La contrainte d'unicité de `stock_items` utilise `NULLS NOT DISTINCT` (PostgreSQL 15 ou plus).

## Flux de scan

Un code-barres est résolu en trois temps : catalogue local, Open Food Facts, saisie manuelle. Seule la saisie manuelle demande un effort, et une seule fois par produit.

> Schéma non inclus dans cet export (flux de scan · 1 décision, 1 saisie manuelle). La description textuelle autour fait foi.

Le produit enregistré passe ensuite par la fiche d'ajout ; les scans suivants vont directement du catalogue à la fiche d'ajout.

**Règles de résolution**

1. Normaliser le code : retirer les espaces, accepter EAN-8 et EAN-13 (un UPC-A devient un EAN-13 avec un 0 devant) et valider la clé de contrôle. Un code invalide est refusé sans appel réseau.
2. Chercher dans `products`. Trouvé : afficher la fiche d'ajout.
3. Sinon, appeler `GET https://world.openfoodfacts.org/api/v2/product/{code}.json` depuis le serveur, jamais depuis le navigateur, avec un `User-Agent` qui identifie l'application et un délai maximum de 4 secondes.
4. Produit trouvé : préremplir le nom (`product_name_fr`, sinon `product_name`), la marque, la quantité (`quantity`), l'image (`image_front_url`) et la catégorie.
5. Catégorie proposée : parcourir `categories_tags` du plus spécifique au plus général et retenir la première correspondance dans `off_category_map` ; sans correspondance, « Autre ». Le produit est alors marqué `category_guessed`.
6. Erreur réseau, délai dépassé ou produit absent : formulaire vide. Un scan n'est jamais perdu ni bloquant.
7. À la validation du formulaire, créer le produit puis ouvrir la fiche d'ajout.

## Architecture technique

TypeScript de bout en bout. Le navigateur ne parle qu'au reverse proxy, qui route `/` vers le front et `/api` vers l'API ; l'API est la seule à accéder à la base, au volume d'images et aux services externes.

> Schéma non inclus dans cet export (architecture · 4 conteneurs, 1 service externe). La description textuelle autour fait foi.

| Couche | Choix |
| --- | --- |
| Front | Next.js (App Router), TypeScript, Tailwind CSS, PWA installable (manifest + service worker) |
| Scan | `BarcodeDetector` quand le navigateur l'offre, sinon `@zxing/browser` ; HTTPS obligatoire pour la caméra |
| API | NestJS, REST JSON sous `/api`, validation des entrées avec `class-validator` ou Zod |
| Base | PostgreSQL 16 avec Prisma ou Drizzle, extension `pg_trgm` |
| Images | `sharp` pour redimensionner en WebP, stockage dans un volume Docker |
| Mots de passe | `argon2` |
| Reverse proxy | Caddy (certificats Let's Encrypt automatiques) |

**Routes de l'API**

| Route | Rôle |
| --- | --- |
| `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/password` | Session et mot de passe |
| `GET/POST/PATCH/DELETE /users` | Comptes de l'instance avec leur foyer (admin) |
| `GET/POST/PATCH/DELETE /admin/households`, `/admin/households/{id}/categories`, `/admin/households/{id}/off-category-map` | Console : foyers, et catégories et correspondances d'un foyer explicite (admin) |
| `GET /scan/{barcode}` | Résout un code : réponse `known`, `suggested` (fiche Open Food Facts) ou `unknown` |
| `GET /products?q=`, `POST /products`, `PATCH /products/{id}`, `POST /products/{id}/image` | Catalogue |
| `GET /stock?location=&shelf=&category=&q=`, `POST /stock/adjust`, `POST /stock/move` | Inventaire ; `adjust` reçoit produit, lieu, étagère, delta et date limite facultative ; `move` reçoit l'origine, la destination et la quantité |
| `GET /home` | Vue Maison : meubles, étagères et vignettes des produits en un seul appel |
| `GET /products/{id}/movements` | Historique d'un produit |
| `GET/POST/PATCH/DELETE /locations` (`DELETE …?moveStockTo=`), `/shelves` | Meubles et étagères du foyer (tous les comptes) |
| `GET /categories` | Catégories du foyer (lecture) |

Toute route hors `/auth/login` (et `/health`) exige une session valide et ne voit que le foyer du compte ; une ressource d'un autre foyer répond 404. Les routes d'administration exigent le rôle `admin` et répondent 404 à un membre.

## Conteneurisation et déploiement

Un seul `docker-compose.yml` décrit toute l'application ; `docker compose up -d` suffit à la démarrer sur le VPS.

| Service | Image | Port interne | Volume |
| --- | --- | --- | --- |
| `proxy` | `caddy:2` | 80 et 443 (publiés sur l'hôte) | `caddy_data`, `caddy_config` |
| `web` | Next.js, build multi-étapes, sortie `standalone`, utilisateur non-root | 3000 | aucun |
| `api` | NestJS, build multi-étapes, utilisateur non-root | 3001 | `images` |
| `db` | `postgres:16-alpine` | 5432 (réseau interne seulement) | `pgdata` |

**Réseau et domaine**

- Deux réseaux Docker : `edge` (proxy, web, api) et `backend` (api, db). La base n'expose aucun port sur l'hôte.
- **Sous-domaine de `lucaszivan.app`**, hors du portfolio qui occupe la racine : `inventaire.lucaszivan.app` (nom retenu ; l'enregistrement DNS A est déjà créé chez name.com et pointe vers l'IP du VPS). Chez name.com, un enregistrement DNS de type A (hôte = le sous-domaine, réponse = IP du VPS), et AAAA si le VPS a une IPv6. Les sous-domaines sont gratuits ; le certificat Let's Encrypt, obtenu et renouvelé par le proxy, l'est aussi.
- Si le portfolio tourne déjà sur le VPS derrière un reverse proxy, l'application le rejoint (réseau Docker partagé et un hôte virtuel pour le sous-domaine) au lieu de lancer un second Caddy : les ports 80 et 443 ne peuvent être pris qu'une fois.
- **Discrétion** : le sous-domaine n'est lié depuis aucune page du portfolio, l'application envoie `X-Robots-Tag: noindex` et un `robots.txt` qui interdit l'indexation. Ce n'est pas une protection : le nom reste visible dans les journaux publics des certificats HTTPS, et la vraie barrière est la connexion par pseudo et mot de passe.

**Configuration et démarrage**

- Variables dans un fichier `.env` hors du dépôt, avec un `.env.example` versionné : `APP_DOMAIN`, `POSTGRES_PASSWORD`, `APP_DB_PASSWORD`, `DATABASE_URL` (rôle d'exécution), `DATABASE_MIGRATION_URL` (propriétaire), `SESSION_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `OFF_USER_AGENT`.
- Au démarrage, l'API applique les migrations avec le propriétaire, crée le rôle d'exécution et lui donne ses droits, puis, si aucun compte n'existe, crée le foyer « Famille » avec le modèle et son admin.
- `restart: unless-stopped` et un `healthcheck` sur chaque service ; logs sur la sortie standard avec rotation Docker (10 Mo, 3 fichiers).

**Livraison**

- **Un script `deploy.sh`** à la racine du dépôt : on se connecte au VPS en SSH, on lance `./deploy.sh`, et tout le reste est automatique. Ni GitHub Actions, ni registre d'images.
- **Étapes du script** : 1) vérifie que `.env` existe et que Docker répond ; 2) sauvegarde la base (`pg_dump` dans `backups/`, les 14 dernières conservées) ; 3) `git pull --ff-only` ; 4) `docker compose build` ; 5) `docker compose up -d --remove-orphans` ; 6) attend que les `healthcheck` passent et affiche l'état des services ; 7) supprime les images orphelines. Il s'arrête à la première erreur (`set -euo pipefail`).
- **Options** : `--no-cache` reconstruit sans cache, `--no-backup` saute la sauvegarde. Le script peut être relancé sans risque à tout moment. Retour arrière : `git checkout <commit>` puis `./deploy.sh`.
- **Premier déploiement** : cloner le dépôt (privé) sur le VPS avec une clé de déploiement en lecture seule, copier `.env.example` en `.env` et le remplir, puis lancer `./deploy.sh`. Le README décrit ces étapes.
- Pare-feu limité aux ports 22, 80 et 443 ; SSH par clé uniquement.

**Sauvegardes**

- `pg_dump` quotidien par une tâche cron, 14 jours de rétention.
- Copie régulière du volume `images` vers un stockage hors du VPS (autre machine ou stockage objet).
- Le README décrit l'installation, les variables, la sauvegarde et la procédure de restauration, testée une fois avant la mise en service.

## Intégration continue (GitHub Actions)

Le dépôt démarre vide : la CI est créée dès la Phase 0, avant la première fonctionnalité, pour que chaque Pull Request (l'équivalent GitHub d'une MR) soit testée avant le merge. Le déploiement reste manuel via `deploy.sh` en V1.

**Workflow** `.github/workflows/ci.yml`, déclenché sur chaque Pull Request et sur chaque push sur `main`.

| Job | Contenu | Bloquant |
| --- | --- | --- |
| lint-typecheck | ESLint, Prettier (vérification), `tsc --noEmit` sur web et api | Oui |
| test-api | Tests unitaires et d'intégration de l'API (Vitest ou Jest) contre un service PostgreSQL 16 lancé par le job, migrations appliquées depuis zéro | Oui |
| test-web | Tests unitaires des composants (Vitest + Testing Library) | Oui |
| e2e | Playwright sur le parcours critique : connexion, ajout manuel d'un produit, modification de quantité, vue Maison ; Chromium et WebKit, viewport mobile | Oui |
| docker-build | Build des images web et api avec `docker compose build`, sans publication | Oui |
| audit | `npm audit` niveau high, et vérification que `.env` n'est pas versionné | Non (avertissement) |

**Règles**

- Un job tourne en moins de 10 minutes ; cache npm et cache de couches Docker activés.
- Aucun secret nécessaire : la CI utilise une base jetable et des variables de test.
- Le scan caméra et l'API Open Food Facts sont simulés en CI (fixtures) ; seul le test manuel sur vrais appareils valide la caméra.
- Dependabot activé pour npm, Docker et GitHub Actions, en mises à jour hebdomadaires.

**Protection de la branche `main`** (réglage GitHub à activer par Lucas)

- Push direct interdit : tout passe par une Pull Request.
- Merge autorisé seulement si tous les jobs bloquants sont verts.
- Branche à jour avec `main` avant le merge ; merge en squash pour un historique lisible.
- Une branche par phase ou par tâche (`phase-0-socle`, `feat/scan`), une PR par phase au minimum.

**Critère d'acceptation** : une PR qui casse un test ou le build ne peut pas être mergée.

## Sécurité, UX et critères d'acceptation

**Sécurité**

- HTTPS partout avec HSTS (Caddy). Cookies de session `httpOnly`, `Secure`, `SameSite=Lax`.
- Protection CSRF : `SameSite=Lax` plus contrôle de l'en-tête `Origin` sur toutes les requêtes `POST`, `PATCH` et `DELETE`.
- Entrées validées côté serveur, requêtes paramétrées via l'ORM, limite de débit sur l'API.
- Upload d'images : JPEG, PNG ou WebP, 8 Mo maximum, réencodées par `sharp` (métadonnées EXIF retirées), nom de fichier généré par le serveur.
- Appels sortants limités à `openfoodfacts.org` et à son domaine d'images : jamais d'URL fournie par l'utilisateur, pour éviter les requêtes forgées côté serveur (SSRF).
- Secrets uniquement dans `.env`, jamais dans une image ni dans le dépôt. Images de base reconstruites chaque mois.

**UX et interface**

- Mobile d'abord (360 px de large minimum), utilisable aussi sur ordinateur ; thème clair uniquement ; interface en français uniquement.
- Barre de navigation en bas : Scanner, Inventaire (vues Maison et Liste), Plus (Compte, Administration, Installer l'application). L'onglet actif est signalé en ambre.
- Zones tactiles de 44 px minimum ; stepper − / + pour les quantités.
- Retour immédiat après chaque ajout : message du type « Ajouté : 2 × Lait demi-écrémé, Frigo, étagère 2 » avec un bouton Annuler pendant 5 secondes.
- Hors connexion, l'application s'ouvre (coquille en cache) mais les écritures sont refusées avec un message clair ; pas de synchronisation hors ligne dans le MVP.
- Style : Indigo Ambre (section Identité visuelle) : cartes blanches à pastille d'icône, accent ambre unique, aucune couleur par catégorie.

**Critères d'acceptation du MVP**

- [ ] Un membre se connecte avec pseudo et mot de passe et reste connecté 30 jours.
- [ ] Sans compte, aucune donnée n'est accessible et aucun compte ne peut être créé.
- [ ] Un produit présent sur Open Food Facts s'affiche prérempli en moins de 3 secondes sur une connexion 4G.
- [ ] Un code inconnu partout ouvre un formulaire vide ; une fois validé, le scan suivant du même code est reconnu immédiatement.
- [ ] Ajouter 3 unités au Frigo, étagère 2, les fait apparaître dans la vue Liste sous Frigo, dans la bonne catégorie, et dans la vue Maison sur la bonne étagère du frigo, avec la photo.
- [ ] La vue Maison affiche les quatre meubles ; un produit passe d'une étagère à une autre par glisser-déposer et par « Déplacer vers… ».
- [ ] Le mode Retirer décrémente le stock ; à 0, l'article disparaît de l'inventaire.
- [ ] Deux membres voient le même stock ; le journal indique qui a fait chaque mouvement.
- [ ] Open Food Facts injoignable : le formulaire vide s'affiche, rien ne plante.
- [ ] La fenêtre d'installation s'affiche tant que l'application n'est pas installée (Chrome Android et Safari iOS) et ne revient plus une fois installée.
- [ ] Installée, l'application s'ouvre en plein écran ; hors connexion, elle affiche « Pas de connexion ».
- [ ] Sur iPhone (Safari, puis Chrome ou Edge sous iOS 16.4 ou plus), l'application s'installe par Partager puis Sur l'écran d'accueil et scanne un code-barres avec l'appareil photo.
- [ ] Sur Android (Chrome, Samsung Internet, Firefox), l'installation et le scan fonctionnent ; sur ordinateur, l'application fonctionne dans le navigateur et s'installe sur Chrome, Edge et Safari.
- [ ] Caméra refusée ou indisponible : la saisie manuelle, la photo du code et le lecteur USB permettent quand même d'ajouter un produit.
- [ ] Les couleurs et la police correspondent aux tokens Indigo Ambre.
- [ ] `docker compose up -d` sur un VPS vierge avec un `.env` renseigné met l'application en ligne en HTTPS sur le sous-domaine.
- [ ] Une sauvegarde `pg_dump` se restaure sur une base vide.

## Roadmap, hors périmètre et points à trancher

Le MVP (phases 0 et 1) livre un inventaire utilisable par toute la famille ; chaque phase se ferme sur un critère vérifiable.

> Schéma non inclus dans cet export (roadmap · 3 phases, 2 critères de passage). La description textuelle autour fait foi.

**Hors périmètre**

- Lecture des tickets de caisse : retirée de la V1, à reconsidérer après la mise en service.
- Applications natives iOS et Android.
- Synchronisation et écriture hors ligne.
- Inscription publique, connexion par e-mail ou réseau social (plusieurs foyers sont gérés depuis le 25 novembre 2026, créés par l'administrateur).
- Prix, budgets et suivi des dépenses.
- Recettes et reconnaissance d'un produit par photo, sans code-barres.
- Impression d'étiquettes.

**Points à trancher avant de lancer Claude Code**

La colonne du milieu est le choix pris dans ce document ; à modifier directement ici si besoin.

| Question | Choix retenu | Alternative |
| --- | --- | --- |
| Stock partagé ou par personne | Un stock partagé pour tout le foyer, plusieurs foyers isolés | Un stock par utilisateur |
| Back-end | NestJS séparé du front | Next.js seul avec ses route handlers, un conteneur de moins |
| Reverse proxy | Caddy dans le compose, ou le proxy déjà présent sur le VPS | Traefik ou nginx |
| Quantités | Entiers (nombre d'unités) | Unité par produit (g, L) |
| Meubles de la vue Maison | Meubles ajoutables (12 au plus par foyer), dessinés selon leur type, étagères paramétrables (8 au plus) | Quatre meubles fixes |
| ORM | Prisma ou Drizzle, au choix de l'implémentation | — |
| Nom de l'application et sous-domaine | À définir | — |

## Exécution autonome par Claude Code

Claude Code construit le projet seul, sur une machine vierge dédiée, en reprenant le travail après chaque interruption (limite d'usage, plantage, contexte plein).

**Principes**

- L'état vit dans le dépôt, jamais dans la mémoire de la session : `TASKS.md` liste les tâches de chaque phase avec une case à cocher.
- Chaque tâche suit le même cycle : implémenter, lancer les tests, commit, cocher dans `TASKS.md`.
- Une branche par phase, une Pull Request par phase ; la phase suivante ne démarre que si la CI est verte et que les critères d'acceptation de la phase sont cochés.
- Aux portes de la roadmap (fin Phase 0, fin Phase 1), Claude s'arrête et écrit `STOP: validation requise` dans `TASKS.md` ; Lucas valide avant la suite.
- Aucune action sur le VPS de production : pas de clé SSH ni d'accès au serveur sur la machine de build. Le déploiement reste le `deploy.sh` lancé par Lucas.

**Boucle de relance** `run-loop.sh`, lancée avec `--dangerously-skip-permissions` sur la machine vierge uniquement :

```bash
#!/usr/bin/env bash
while ! grep -qE "ALL DONE|STOP: validation requise" TASKS.md; do
  out=$(claude -p "Lis CLAUDE.md et TASKS.md. Prends la prochaine tâche non cochée, implémente-la, lance les tests, commit, coche-la, puis continue. Si tout est coché, écris ALL DONE dans TASKS.md." \
    --dangerously-skip-permissions --max-turns 200 2>&1)
  echo "$out" | tail -n 5
  echo "$out" | grep -qi "limit" && sleep 1800   # réessaie toutes les 30 minutes
done
```

**Garde-fous**

- Les limites d'usage (fenêtre de 5 heures, plafond hebdomadaire) restent valables : la boucle attend, elle ne les contourne pas.
- Les sous-agents sont utiles mais consomment du quota : au plus deux en parallèle (front et api).
- Modèle conseillé : un modèle de la gamme Opus pour planifier et pour les phases d'architecture, un modèle Sonnet pour l'exécution courante des tâches.