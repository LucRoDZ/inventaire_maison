# TASKS.md : suivi d'avancement

> Règles : lis `CLAUDE.md` d'abord. Une tâche = implémenter, tester, commit, cocher.
> Phase terminée : écris `STOP: validation requise` en bas de ce fichier et arrête-toi.
> Tout est terminé : écris `ALL DONE` en bas de ce fichier.

## Phase 0 : Socle (branche `phase-0-socle`)

- [ ] 0.1 Initialiser le dépôt : monorepo `apps/web` (Next.js), `apps/api` (NestJS), `docs/`, `.gitignore`, `.editorconfig`.
- [ ] 0.2 Copier `docs/cahier-des-charges.md` et `tokens.css` (Indigo Ambre) dans le dépôt.
- [ ] 0.3 Configurer TypeScript strict, ESLint, Prettier sur web et api.
- [ ] 0.4 Mettre en place les tests : Vitest (ou Jest) pour l'API, Vitest + Testing Library pour le web, Playwright pour l'e2e.
- [ ] 0.5 Créer la CI `.github/workflows/ci.yml` : lint-typecheck, test-api (PostgreSQL 16), test-web, e2e (Chromium + WebKit mobile), docker-build, audit.
- [ ] 0.6 Ajouter Dependabot (npm, Docker, GitHub Actions, hebdomadaire).
- [ ] 0.7 Écrire `docker-compose.yml` : services `proxy`, `web:3000`, `api:3001`, `db`; réseaux `edge` et `backend`; volumes `pgdata`, `images`, `caddy_data`, `caddy_config`.
- [ ] 0.8 Écrire les Dockerfiles web et api (multi-étapes, utilisateur non root) et le `Caddyfile` (`/` vers web, `/api` vers api, en-tête `noindex`).
- [ ] 0.9 Modèle de données : migrations pour `users`, `sessions`, `locations`, `shelves`, `categories`, `off_category_map`, `products`, `stock_items`, `stock_movements`; extensions `pg_trgm`.
- [ ] 0.10 Seed : catégories par défaut avec icônes, table `off_category_map`, lieux par défaut (garde-manger, frigo, congélateur, cave) et étagères.
- [ ] 0.11 Authentification : pseudo + mot de passe (argon2), sessions en base, cookie HttpOnly, limitation de débit, premier compte admin via variables d'environnement.
- [ ] 0.12 Endpoint `/api/health` et page de connexion fonctionnelle de bout en bout.
- [ ] 0.13 PWA de base : `manifest.webmanifest` (thème #1800ad), icônes, service worker (précache du shell, réseau d'abord pour `/api`).
- [ ] 0.14 Écrire `.env.example`, `deploy.sh` (pull, build, up, migrations, healthcheck, nettoyage d'images) et `README.md`.
- [ ] 0.15 Vérifier la phase : suite de tests complète verte, CI verte sur la PR, `docker compose up` fonctionne depuis zéro.
- [ ] 0.16 Ouvrir la PR `phase-0-socle`, lister les critères d'acceptation validés, puis écrire `STOP: validation requise`.

## Phase 1 : V1 (branche `phase-1-v1`)

### Produits et scan
- [ ] 1.1 API produits : recherche par code-barres, création, modification, liste, recherche floue (`pg_trgm`).
- [ ] 1.2 Client Open Food Facts côté serveur (API v2, User-Agent, 4 s de délai) : nom, marque, image, `categories_tags`.
- [ ] 1.3 Correspondance `off_category_map` vers catégorie locale, avec le drapeau `category_guessed` quand la catégorie est devinée.
- [ ] 1.4 Téléchargement des images, miniatures WebP 400 px avec sharp, stockage dans le volume `images`.
- [ ] 1.5 Écran Scanner : `BarcodeDetector` avec repli zxing, choix de caméra, lampe, saisie manuelle du code.
- [ ] 1.6 Flux de scan : produit connu ouvre la fiche d'ajout; produit trouvé chez OFF préremplit; produit inconnu ouvre le formulaire manuel.
- [ ] 1.7 Fiche d'ajout : photo, nom, quantité (stepper), lieu, étagère, date limite facultative.
- [ ] 1.8 Formulaire produit inconnu : nom, marque, catégorie, photo facultative; produit enregistré pour les prochains scans.

### Inventaire
- [ ] 1.9 API stock : `stock_items` et `stock_movements` (`scan_add`, `scan_remove`, `manual`, `move`, `correction`).
- [ ] 1.10 Vue Liste : filtres par lieu et catégorie, recherche, tri, ajustement rapide des quantités.
- [ ] 1.11 Vue Maison : 4 meubles (garde-manger, frigo, congélateur, cave) avec étagères, produits en vignettes.
- [ ] 1.12 Glisser-déposer des produits entre étagères et entre lieux (`@dnd-kit`), avec alternative tactile par menu « Déplacer ».
- [ ] 1.13 Fiche produit : modifier nom, catégorie, photo; historique des mouvements.
- [ ] 1.14 Écran « À classer » : produits sans lieu ou avec catégorie devinée.
- [ ] 1.15 Retrait par scan et décrément de quantité; gestion du stock à zéro.

### Utilisateurs et administration
- [ ] 1.16 Écran Administration (rôle `admin`) : membres, lieux, étagères, catégories, ordre.
- [ ] 1.17 Gestion des comptes : création de membre, changement de mot de passe, désactivation.

### PWA, compatibilité, qualité
- [ ] 1.18 Fenêtre d'installation : `beforeinstallprompt` (Chrome, Edge, Android), tutoriel pas à pas sur iOS, masquée en mode standalone, « Plus tard » 7 jours, « Ne plus afficher ».
- [ ] 1.19 Compatibilité : scan caméra avec repli sur saisie manuelle, HTTPS obligatoire, rendu iOS Safari, Android Chrome, ordinateur.
- [ ] 1.20 Identité visuelle : toutes les couleurs via `tokens.css`, Carlito, rayon 16 px, aucun emoji, contrastes AA.
- [ ] 1.21 Tests e2e du parcours critique : connexion, ajout manuel, scan simulé, déplacement, retrait, vue Maison.
- [ ] 1.22 Sauvegardes : script de dump PostgreSQL et sauvegarde du volume `images`, documentés dans le README.
- [ ] 1.23 README complet : installation locale, variables d'environnement, déploiement sur le VPS, test manuel du scan sur vrais appareils.
- [ ] 1.24 Passer la checklist « Critères d'acceptation » du cahier des charges, noter chaque critère validé ou non.
- [ ] 1.25 Ouvrir la PR `phase-1-v1`, résultats de CI verts, puis écrire `STOP: validation requise`.

## Phase 2 : Confort (branche `phase-2-confort`)

- [ ] 2.1 Reprendre la liste de la section Roadmap du cahier des charges pour la Phase 2 et la détailler ici en tâches cochables.
- [ ] 2.2 Implémenter chaque tâche détaillée (une tâche = un commit, tests inclus).
- [ ] 2.3 Mettre à jour le README et la checklist d'acceptation.
- [ ] 2.4 Ouvrir la PR `phase-2-confort`, puis écrire `ALL DONE`.

## Décisions prises
<!-- Claude : note ici chaque choix pris en l'absence de précision, une ligne par décision, avec la date. -->

## Problèmes bloquants
<!-- Claude : note ici ce qui t'empêche d'avancer, avec la commande et l'erreur exacte. -->