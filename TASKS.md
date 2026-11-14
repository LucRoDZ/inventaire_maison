# TASKS.md : suivi d'avancement

> Règles : lis `CLAUDE.md` d'abord. Une tâche = implémenter, tester, commit, cocher.
> Une tâche n'est cochée que si son critère « Fin » est constaté et que `npm run lint`, `npm run typecheck` et `npm test` passent.
> Après chaque `git push` : `gh pr checks`, et correction avant de continuer.
> Tâche bloquée : note la commande et l'erreur dans « Problèmes bloquants ». Si une tâche suivante en dépend, écris le marqueur d'arrêt et arrête-toi ; ne saute pas la tâche.
> Phase terminée : écris seul sur la dernière ligne de ce fichier `STOP: validation requise` et arrête-toi. Lucas supprime cette ligne pour lancer la phase suivante.
> Tout est terminé : écris seul sur la dernière ligne `ALL DONE`.
> Ces deux marqueurs ne doivent jamais commencer une autre ligne de ce fichier.

## Phase 0 : Socle (branche `phase-0-socle`) : 22 tâches

- [x] **0.1 Monorepo et squelettes**
  - Résultat : workspaces npm avec un web Next.js (App Router) qui affiche une page provisoire et une API NestJS qui répond sur `/api/health`.
  - Fichiers : `package.json`, `.nvmrc`, `.gitignore`, `.editorconfig`, `apps/web/`, `apps/api/src/{main,app.module}.ts`, `apps/api/src/health/`, `packages/shared/`.
  - Comportement : `npm run dev` lance web (3000) et api (3001) ; Next réécrit `/api/*` vers `API_INTERNAL_URL` ; `GET /api/health` renvoie 200 `{"status":"ok"}` sans session ; `.env` ignoré par git.
  - Tests : aucun lanceur à ce stade (tâches 0.3 et 0.4).
  - Fin : `npm install && npm run build` passe ; `curl -s localhost:3000/api/health` renvoie `{"status":"ok"}`.

- [x] **0.2 TypeScript strict, ESLint, Prettier**
  - Résultat : une seule configuration de qualité pour web, api et shared.
  - Fichiers : `tsconfig.base.json`, `eslint.config.mjs`, `.prettierrc`, scripts racine `lint`, `format:check`, `typecheck`.
  - Comportement : `strict`, `noUncheckedIndexedAccess`, `any` implicite interdit ; ESLint échoue sur un import inutilisé.
  - Tests : sans objet.
  - Fin : `npm run lint && npm run format:check && npm run typecheck` passent.

- [x] **0.3 Tests de l'API**
  - Résultat : Vitest (SWC) et supertest opérationnels dans `apps/api`.
  - Fichiers : `apps/api/vitest.config.ts`, `apps/api/test/setup.ts`, `apps/api/src/health/health.spec.ts`.
  - Comportement : l'application Nest est montée en mémoire par un utilitaire `createTestApp()` réutilisé par tous les tests d'intégration.
  - Tests : `GET /api/health` renvoie 200.
  - Fin : `npm run test:api` passe avec 1 test.

- [ ] **0.4 Tests du web et e2e**
  - Résultat : Vitest + Testing Library dans `apps/web`, Playwright dans `e2e/`.
  - Fichiers : `apps/web/vitest.config.ts`, `apps/web/test/setup.ts`, `e2e/playwright.config.ts`, `e2e/tests/smoke.spec.ts`.
  - Comportement : projets `chromium-mobile` (Pixel 7) et `webkit-mobile` (iPhone 14) ; `webServer` construit puis lance api et web ; `npm test` enchaîne api et web.
  - Tests : un test de rendu de la page provisoire ; un e2e qui charge `/` et lit le titre.
  - Fin : `npm run test:web` et `npm run test:e2e` passent sur les deux projets.

- [ ] **0.5 Dockerfiles**
  - Résultat : images web et api multi-étapes, utilisateur non root.
  - Fichiers : `apps/web/Dockerfile`, `apps/api/Dockerfile`, `.dockerignore`, `next.config.ts` (`output: "standalone"`).
  - Comportement : contexte de build à la racine ; base `node:24-slim` ; web écoute 3000, api 3001 ; aucun fichier `.env` copié.
  - Tests : sans objet.
  - Fin : les deux `docker build` passent et `docker run --rm <image> id -u` ne renvoie pas `0`.

- [ ] **0.6 Compose, Caddyfile, variantes de proxy, `.env.example`**
  - Résultat : la pile complète démarre avec `docker compose up -d`, seule (Caddy embarqué) ou derrière le nginx partagé du VPS.
  - Fichiers : `docker-compose.yml`, `docker-compose.dev.yml` (publie la base sur `127.0.0.1:5432`), `docker-compose.shared-proxy.yml`, `Caddyfile`, `deploy/nginx/inventaire.conf.example`, `.env.example`.
  - Comportement : services `proxy` (profil `proxy`), `web`, `api`, `db` ; réseaux `edge` et `backend` ; volumes `pgdata`, `images`, `caddy_data`, `caddy_config` ; `restart: unless-stopped`, healthcheck et rotation des logs (10 Mo, 3 fichiers) sur chaque service ; la base ne publie aucun port dans le fichier principal. Caddy (local, CI, VPS vierge) : `/api/*` vers `api:3001`, le reste vers `web:3000`, HSTS, `X-Robots-Tag: noindex`, `Permissions-Policy: camera=(self)`. Production (`docker-compose.shared-proxy.yml`) : web et api rejoignent le réseau Docker externe `${SHARED_PROXY_NETWORK}` (`external: true`, valeur `easyq_default` sur le VPS) avec les alias `inventaire-web` (port 3000) et `inventaire-api` (port 3001) ; aucun port publié sur l'hôte, profil `proxy` inactif ; `SHARED_PROXY_NETWORK` absente : erreur explicite de compose. `deploy/nginx/inventaire.conf.example`, sur le modèle du portfolio, à ajouter par Lucas au conteneur nginx existant (`easyq-nginx-1`) : `resolver 127.0.0.11 valid=10s ipv6=off;`, `set $inv_web http://inventaire-web:3000;`, `set $inv_api http://inventaire-api:3001;`, `location /api/` vers `$inv_api` et `location /` vers `$inv_web` (URI transmise telle quelle), en-têtes `Host`, `X-Forwarded-For`, `X-Forwarded-Proto`, `X-Robots-Tag: noindex`, HSTS, `client_max_body_size 10m` ; port 80 : `/.well-known/acme-challenge/` servi depuis le webroot de certbot, le reste redirigé en HTTPS ; port 443 : certificats certbot de `inventaire.lucaszivan.app`. `.env.example` : `APP_DOMAIN`, `POSTGRES_PASSWORD`, `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `OFF_USER_AGENT`, `COMPOSE_FILE`, `COMPOSE_PROFILES`, `SHARED_PROXY_NETWORK`, sans aucune valeur réelle. Aucune commande n'est exécutée sur le VPS.
  - Tests : sans objet (test de fumée dans la CI, tâche 0.7).
  - Fin : (1) avec `APP_DOMAIN=localhost COMPOSE_PROFILES=proxy`, `docker compose up -d --build --wait` réussit et `curl -sk https://localhost/api/health` renvoie 200 ; `docker compose port db 5432` ne renvoie rien. (2) après `docker network create inv_test_proxy`, avec `SHARED_PROXY_NETWORK=inv_test_proxy COMPOSE_FILE=docker-compose.yml:docker-compose.shared-proxy.yml`, `docker compose up -d --wait` réussit, `docker run --rm --network inv_test_proxy curlimages/curl -s http://inventaire-api:3001/api/health` renvoie `{"status":"ok"}`, `http://inventaire-web:3000/` répond, et `docker compose port web 3000` comme `docker compose port api 3001` ne renvoient rien.

- [ ] **0.7 CI GitHub Actions et PR en brouillon**
  - Résultat : six jobs sur chaque PR et chaque push sur `main` ; PR `phase-0-socle` ouverte en brouillon.
  - Fichiers : `.github/workflows/ci.yml`.
  - Comportement : `lint-typecheck` ; `test-api` (service PostgreSQL 16) ; `test-web` ; `e2e` (Chromium et WebKit) ; `docker-build` (`docker compose build`, puis démarrage et `curl` de `/api/health`) ; `audit` (`npm audit --audit-level=high` et `git ls-files .env` vide, `continue-on-error`). Cache npm et cache de couches Docker, annulation des exécutions remplacées, limite de 10 minutes par job, aucun secret.
  - Tests : la CI elle-même.
  - Fin : `gh pr checks` montre les cinq jobs bloquants verts.

- [ ] **0.8 Dependabot**
  - Résultat : mises à jour hebdomadaires pour npm, Docker et GitHub Actions.
  - Fichiers : `.github/dependabot.yml`.
  - Comportement : une entrée npm à la racine, une entrée Docker par Dockerfile, une entrée `github-actions` ; mises à jour mineures groupées.
  - Tests : sans objet.
  - Fin : `grep -c package-ecosystem .github/dependabot.yml` renvoie au moins 4 et la CI reste verte.

- [ ] **0.9 Configuration, connexion à la base, migrations au démarrage**
  - Résultat : l'API valide son environnement, se connecte à PostgreSQL et applique les migrations avant d'écouter.
  - Fichiers : `apps/api/src/config/`, `apps/api/src/database/`, `apps/api/drizzle.config.ts`, `apps/api/drizzle/`.
  - Comportement : variable manquante ou invalide (`SESSION_SECRET` de moins de 32 caractères, `ADMIN_PASSWORD` de moins de 8) : arrêt au démarrage avec un message qui nomme la variable sans afficher sa valeur. `/api/health` exécute `SELECT 1` : 200, ou 503 `{"status":"error"}` si la base ne répond pas.
  - Tests : unitaires du schéma d'environnement ; intégration : santé 200 avec base, 503 avec un pool simulé en erreur.
  - Fin : `npm run test:api` passe ; `docker compose stop db` fait passer `/api/health` à 503.

- [ ] **0.10 Schéma et première migration**
  - Résultat : toutes les tables du modèle de données, avec contraintes et index.
  - Fichiers : `apps/api/src/database/schema/*.ts`, `apps/api/drizzle/0000_*.sql`.
  - Comportement : tables `users` (+ `disabled_at`), `sessions` (+ `last_seen_at`), `login_attempts`, `locations`, `shelves`, `categories` (+ `is_fallback`), `off_category_map`, `products` (+ `search_text`), `stock_items` (+ `created_at`), `stock_movements` (+ `expiry_date`). Extension `pg_trgm`. Unicité `stock_items(product_id, location_id, shelf_id, expiry_date)` en `NULLS NOT DISTINCT`, `CHECK (quantity > 0)`, `CHECK (delta <> 0)`, pseudo unique en minuscules, `barcode` unique nullable. Index : `products(barcode)`, GIN trigramme sur `search_text`, `stock_items(location_id, shelf_id)`, `stock_items(expiry_date)`.
  - Tests : intégration : migration depuis une base vide ; deux lignes identiques avec `shelf_id` et `expiry_date` nuls sont refusées ; quantité 0 refusée ; deux produits sans code-barres acceptés ; pseudo en double refusé.
  - Fin : `npm run db:migrate` réussit sur une base vide et `npm run test:api` passe.

- [ ] **0.11 Seed des référentiels**
  - Résultat : catégories, correspondances, lieux et étagères par défaut créés au premier démarrage.
  - Fichiers : `apps/api/src/database/seed/{categories,off-category-map,locations}.ts`, `seed.service.ts`.
  - Comportement : 15 catégories avec icône Lucide et ordre, « Autre » en `is_fallback` ; environ 80 tags Open Food Facts (au moins 3 par catégorie hors Autre et Hygiène) ; lieux Garde-manger (4 étagères), Frigo (4 étagères, 2 bacs à légumes, 1 balconnet), Congélateur (3 tiroirs), Cave (3 rangées `rack`, 1 étagère « Caisses et packs ») ; chaque référentiel n'est rempli que s'il est vide.
  - Tests : intégration : seed sur base vide (15 catégories, 4 lieux, 18 étagères) ; second passage sans doublon ; un lieu renommé n'est pas recréé.
  - Fin : `npm run db:seed` deux fois de suite laisse les mêmes comptes de lignes ; tests verts.

- [ ] **0.12 Authentification : sessions, connexion, garde globale, premier admin**
  - Résultat : connexion par pseudo et mot de passe, session en base, toute l'API fermée par défaut.
  - Fichiers : `apps/api/src/auth/{auth.controller,auth.service,session.service,session.guard,public.decorator,password.service}.ts`, `apps/api/src/users/bootstrap-admin.service.ts`, `packages/shared/src/auth.ts`.
  - Comportement : `POST /api/auth/login` `{username, password}` : 200 `{id, username, role}` et cookie `inv_session` ; 401 « Pseudo ou mot de passe incorrect » (même réponse et hachage factice si le pseudo n'existe pas ou si le compte est désactivé) ; 400 si le corps est invalide. Pseudo comparé en minuscules. `POST /api/auth/logout` : 204, session supprimée, cookie effacé. `GET /api/auth/me` : 200 ou 401. Garde globale : 401 partout sauf `login` et `health`. Session expirée : 401 et ligne supprimée ; prolongation glissante au-delà de 24 h. argon2id ; le mot de passe n'apparaît dans aucun journal. Admin créé au démarrage si la table `users` est vide.
  - Tests : unitaires du service de mot de passe et de session ; intégration : connexion réussie, mauvais mot de passe, pseudo inconnu, casse du pseudo, compte désactivé, cookie (attributs et durée), `me` sans cookie, déconnexion, session expirée, prolongation, route quelconque sans session, admin créé une seule fois.
  - Fin : `POST /api/auth/login` renvoie 401 avec un mauvais mot de passe et 200 avec le bon ; `GET /api/locations` sans cookie renvoie 401.

- [ ] **0.13 Anti-force-brute et limite de débit**
  - Résultat : 5 échecs en 15 minutes bloquent le couple pseudo + IP pendant 15 minutes ; débit global limité.
  - Fichiers : `apps/api/src/auth/login-throttle.service.ts`, configuration `@nestjs/throttler`, `main.ts` (`trust proxy` à 1).
  - Comportement : sixième tentative : 429 « Trop de tentatives, réessayez dans 15 minutes » avec `Retry-After`, même avec le bon mot de passe ; un succès efface les échecs du couple ; une autre IP ou un autre pseudo n'est pas bloqué ; purge des tentatives de plus de 24 h. Limite globale : 300 requêtes par minute et par IP, 429 au-delà.
  - Tests : intégration avec horloge simulée : blocage au sixième essai, déblocage après 15 minutes, indépendance des couples, remise à zéro après succès.
  - Fin : six `POST /api/auth/login` erronés de suite : le sixième renvoie 429.

- [ ] **0.14 Contrôle de l'origine, rôles, changement de mot de passe**
  - Résultat : protection CSRF, garde `admin` prête, chacun peut changer son mot de passe.
  - Fichiers : `apps/api/src/auth/{origin.guard,roles.guard,roles.decorator}.ts`, route `POST /auth/password`.
  - Comportement : `POST`, `PATCH`, `DELETE` sans en-tête `Origin` ou avec une origine différente de l'origine publique : 403. `@Roles('admin')` : 403 pour un membre. `POST /api/auth/password` `{currentPassword, newPassword}` : 204 et révocation des autres sessions ; 400 si le nouveau fait moins de 8 ou plus de 128 caractères ; 403 si l'actuel est faux.
  - Tests : intégration : origine absente, étrangère, correcte ; route d'essai réservée à l'admin ; changement réussi puis ancienne session d'un autre appareil refusée ; ancien mot de passe refusé à la connexion.
  - Fin : `curl -X POST` sur `/api/auth/logout` avec `Origin: https://exemple.test` renvoie 403.

- [ ] **0.15 Socle visuel Indigo Ambre**
  - Résultat : Tailwind branché sur `tokens.css`, police Carlito, composants de base.
  - Fichiers : `tokens.css` (alignement typographique sur le cahier), `apps/web/app/globals.css`, `apps/web/components/ui/{Card,StatCard,Callout,Button,IconBadge}.tsx`, `scripts/check-colors.mjs`.
  - Comportement : couleurs, rayons, ombre et espacements uniquement par variables ; boutons principal (indigo, texte blanc), d'ajout (ambre, texte indigo), secondaire (texte `indigo-mid`) ; zones tactiles de 44 px ; `check-colors` (appelé par `npm run lint`) échoue sur une couleur hexadécimale, `rgb()` ou une classe de palette Tailwind hors tokens dans `apps/web`.
  - Tests : rendu et rôle accessible de chaque composant ; test du script avec un fichier fautif.
  - Fin : `npm run lint` passe, et échoue si l'on ajoute `color: #ff0000` dans un composant.

- [ ] **0.16 Page de connexion et coquille de l'application**
  - Résultat : connexion de bout en bout et navigation à quatre onglets.
  - Fichiers : `apps/web/app/connexion/page.tsx`, `apps/web/app/(app)/layout.tsx`, `apps/web/components/nav/BottomNav.tsx`, `apps/web/lib/{api,auth}.ts`, `apps/web/middleware.ts`, pages provisoires des onglets.
  - Comportement : formulaire pseudo et mot de passe en français ; erreurs 401, 429 et réseau affichées dans un `Callout` ; sans cookie, toute page redirige vers `/connexion` ; une réponse 401 de l'API renvoie à la connexion ; onglets Scanner, Inventaire, À classer, Plus, l'actif en ambre ; déconnexion depuis Plus ; marges `env(safe-area-inset-*)`.
  - Tests : composants : formulaire (validation, message d'erreur), barre d'onglets (onglet actif). E2E : redirection sans session, mauvais mot de passe, connexion, rechargement toujours connecté, déconnexion.
  - Fin : `npm run test:e2e` passe sur Chromium et WebKit.

- [ ] **0.17 Manifeste, icônes et balises iOS**
  - Résultat : application installable.
  - Fichiers : `apps/web/app/manifest.ts`, `apps/web/app/robots.ts`, `apps/web/assets/icon.svg`, `scripts/generate-icons.mjs`, `apps/web/public/icons/`, métadonnées de `app/layout.tsx`, en-têtes dans `next.config.ts`.
  - Comportement : manifeste conforme au tableau du cahier (« Inventaire maison », « Inventaire », `standalone`, `portrait`, `fr`, thème indigo) ; icônes 192, 512, 512 maskable et `apple-touch-icon` 180 générées avec sharp ; balises `apple-mobile-web-app-*`, `viewport-fit=cover` ; `robots.txt` qui interdit tout ; en-têtes `X-Robots-Tag` et `Permissions-Policy`.
  - Tests : unitaire du manifeste (champs, tailles, `short_name` de 12 caractères au plus) ; e2e : `/manifest.webmanifest` et chaque icône répondent 200.
  - Fin : `curl -s localhost:3000/manifest.webmanifest` contient `"display":"standalone"`.

- [ ] **0.18 Service worker, hors connexion, nouvelle version**
  - Résultat : coquille disponible hors ligne et mise à jour proposée.
  - Fichiers : `apps/web/app/sw.ts`, configuration Serwist, `apps/web/components/pwa/{OfflineCallout,UpdateCallout,RegisterSW}.tsx`, `apps/web/lib/online.ts`.
  - Comportement : précache de la coquille (JS, CSS, polices, icônes) ; images produits en `stale-while-revalidate` ; `GET /api` réseau d'abord, `/api/auth` jamais en cache, écritures jamais interceptées ; hors ligne : encadré « Pas de connexion » qui dit que l'ajout et le retrait sont indisponibles ; nouvelle version : « Nouvelle version disponible » et bouton Actualiser ; caches vidés à la déconnexion ; service worker inactif en `npm run dev`.
  - Tests : composants des deux encadrés (événements `online`, `offline`, mise à jour simulée). E2E Chromium : après une première visite, hors ligne, la coquille s'ouvre et l'encadré s'affiche.
  - Fin : l'e2e hors ligne passe.

- [ ] **0.19 `deploy.sh` et sauvegarde de la base**
  - Résultat : déploiement en une commande, conforme aux 7 étapes du cahier.
  - Fichiers : `deploy.sh`, `scripts/backup-db.sh`.
  - Comportement : `set -euo pipefail` ; vérifie `.env` et Docker ; `pg_dump` compressé dans `backups/` (14 conservés, étape sautée si la base ne tourne pas encore ou avec `--no-backup`) ; `git pull --ff-only` ; `docker compose build` (`--no-cache` en option) ; `up -d --remove-orphans` ; attente des healthchecks avec délai maximal et affichage de l'état ; suppression des images orphelines. Relançable sans risque. Ne contient aucune commande SSH.
  - Tests : `shellcheck` dans le job `lint-typecheck` ; test de `backup-db.sh` contre la base du job `docker-build` (fichier créé, rotation à 14).
  - Fin : `shellcheck deploy.sh scripts/*.sh` passe ; `./deploy.sh --no-backup` exécuté deux fois de suite en local réussit.

- [ ] **0.20 README de la Phase 0**
  - Résultat : README exact pour l'installation locale et les deux modes de proxy (nginx partagé en production, Caddy embarqué).
  - Fichiers : `README.md`.
  - Comportement : choix de Drizzle et raison ; Node 24 ; démarrage local ; variables du cahier plus `COMPOSE_FILE`, `COMPOSE_PROFILES`, `SHARED_PROXY_NETWORK` ; tests ; production derrière le nginx en conteneur du VPS : `COMPOSE_FILE=docker-compose.yml:docker-compose.shared-proxy.yml`, `SHARED_PROXY_NETWORK=easyq_default`, alias `inventaire-web` et `inventaire-api`, aucun port publié, bloc `deploy/nginx/inventaire.conf.example` à ajouter au nginx existant ; Caddy embarqué (`COMPOSE_PROFILES=proxy`) pour le local et un VPS vierge ; ligne Proxy du tableau Stack corrigée ; premier déploiement ; protection de branche à activer par Lucas. Toutes les étapes sur le VPS sont décrites pour Lucas, jamais exécutées par Claude.
  - Tests : sans objet.
  - Fin : chaque commande du README, exécutée sur un clone neuf, réussit.

- [ ] **0.21 Vérification de la phase**
  - Résultat : preuve que le socle tient depuis zéro.
  - Fichiers : aucun, sauf corrections.
  - Comportement : suite complète ; volumes supprimés puis `docker compose up` ; connexion avec l'admin du `.env` ; chaque critère de fin de Phase 0 noté validé, non validé ou à valider par Lucas.
  - Tests : toute la suite.
  - Fin : `npm run lint && npm run typecheck && npm test && npm run test:e2e` passent ; `docker compose down -v && docker compose up -d --build --wait` réussit ; `gh pr checks` vert.

- [ ] **0.22 PR prête et arrêt**
  - Résultat : PR `phase-0-socle` sortie du brouillon avec la liste des critères.
  - Fichiers : `TASKS.md`.
  - Comportement : description de la PR : critères validés, non validés, à valider par Lucas ; décisions prises ; puis marqueur d'arrêt en dernière ligne.
  - Tests : sans objet.
  - Fin : `gh pr view --json isDraft` renvoie `false` ; la dernière ligne de `TASKS.md` est le marqueur d'arrêt.

## Phase 1 : V1 (branche `phase-1-v1`) : 40 tâches

### Référentiels, catalogue, Open Food Facts

- [ ] **1.1 API lieux et étagères**
  - Résultat : lecture pour tous, écriture pour l'admin.
  - Fichiers : `apps/api/src/locations/`, `packages/shared/src/locations.ts`.
  - Comportement : `GET /locations` (étagères incluses, triées) ; `PATCH /locations/{id}` (nom, icône, ordre) ; `POST/PATCH/DELETE /shelves` (nom, type `rack` ou `plain`, ordre, lieu). Supprimer une étagère renvoie son stock au « Non rangé » du meuble, avec fusion des lignes identiques et deux mouvements `move` par ligne, dans une transaction. Nom vide ou de plus de 40 caractères : 400 ; identifiant inconnu : 404 ; membre en écriture : 403.
  - Tests : intégration de chaque route, dont la suppression avec fusion et le journal.
  - Fin : `DELETE /api/shelves/{id}` par un membre renvoie 403 ; par l'admin 204, et le stock réapparaît avec `shelf_id` nul.

- [ ] **1.2 API catégories et correspondances Open Food Facts**
  - Résultat : référentiels de classement administrables.
  - Fichiers : `apps/api/src/categories/`.
  - Comportement : `GET/POST/PATCH/DELETE /categories` (nom, icône parmi une liste fermée d'icônes Lucide, ordre) ; supprimer une catégorie renvoie ses produits vers « Autre » avec `category_guessed=true` et supprime ses correspondances ; « Autre » non supprimable (409). `GET/POST/PATCH/DELETE /off-category-map` (`off_tag` unique au format `xx:slug`, 409 en cas de doublon).
  - Tests : intégration de chaque route et de chaque erreur.
  - Fin : `DELETE /api/categories/{id de Autre}` renvoie 409.

- [ ] **1.3 Normalisation des codes-barres**
  - Résultat : une fonction partagée par le web et l'API.
  - Fichiers : `packages/shared/src/barcode.ts`.
  - Comportement : retire espaces et tirets ; EAN-13 et EAN-8 validés par clé de contrôle ; UPC-A (12 chiffres) préfixé d'un 0 ; UPC-E développé seulement si le format est fourni ; tout le reste (lettres, autre longueur, clé fausse) renvoie une erreur typée.
  - Tests : unitaires sur une table de cas : codes réels valides, clé fausse, UPC-A, UPC-E, espaces, chaîne vide, 14 chiffres.
  - Fin : `npm test` passe ; `normalizeBarcode("3 017620 422003")` renvoie `3017620422003`.

- [ ] **1.4 API catalogue**
  - Résultat : création, lecture, recherche floue et modification des produits.
  - Fichiers : `apps/api/src/products/`, `packages/shared/src/products.ts`.
  - Comportement : `GET /products?q=&needsReview=&limit=` (similarité trigramme sur `search_text`, sans accents, 20 résultats par défaut ; `needsReview=true` : produits en stock dont la catégorie est « Autre » ou devinée) ; `GET /products/{id}` (avec stock par lieu) ; `POST /products` (nom et catégorie obligatoires ; marque, format, lieu habituel, code-barres facultatifs ; code normalisé, 409 si déjà présent ; `source=manual`, `created_by`) ; `PATCH /products/{id}` (nom, marque, catégorie, lieu habituel ; toute modification de catégorie remet `category_guessed` à faux).
  - Tests : intégration : recherche avec faute de frappe et sans accent, doublon de code, code invalide, catégorie inconnue, produit sans code-barres, confirmation de catégorie.
  - Fin : `GET /api/products?q=lait+ecreme` retrouve « Lait demi-écrémé ».

- [ ] **1.5 Images : miniatures et envoi de photo**
  - Résultat : toute image devient une miniature WebP locale de 400 px.
  - Fichiers : `apps/api/src/images/`.
  - Comportement : `POST /products/{id}/image` (multipart, 8 Mo maximum, JPEG, PNG ou WebP vérifiés par signature) : réencodage sharp, 400 px de large, orientation appliquée puis EXIF retiré, nom aléatoire généré par le serveur, ancienne image supprimée ; 413 si trop lourd, 415 si le type est refusé. `GET /images/{fichier}` : session exigée, motif de nom strict, `Cache-Control: private, max-age=31536000, immutable`, 404 sinon.
  - Tests : unitaires du service (dimensions, format, absence d'EXIF) ; intégration : envoi valide, fichier trop lourd, faux JPEG, tentative de traversée de chemin, accès sans session.
  - Fin : `GET /api/images/..%2F..%2Fetc%2Fpasswd` renvoie 404 ; l'image servie est un WebP de 400 px.

- [ ] **1.6 Client Open Food Facts**
  - Résultat : lecture d'une fiche produit depuis le serveur.
  - Fichiers : `apps/api/src/off/{off.client,off.mapper}.ts`, `apps/api/test/fixtures/off/*.json`.
  - Comportement : `GET {base}/api/v2/product/{code}.json` avec `User-Agent` = `OFF_USER_AGENT` et délai de 4 s ; renvoie nom (`product_name_fr`, sinon `product_name`), marque, `quantity`, `image_front_url`, `categories_tags`, ou un résultat typé `not_found` / `unavailable` (délai, erreur réseau, 5xx, JSON invalide), sans jamais lever d'exception ; `OFF_BASE_URL` ignorée en production.
  - Tests : unitaires avec `fetch` simulé : fiche complète, fiche sans nom français, fiche sans nom, 404, délai dépassé, 500, JSON invalide, présence du `User-Agent`.
  - Fin : `npm run test:api` passe sans aucun appel réseau réel.

- [ ] **1.7 Catégorie devinée et image distante**
  - Résultat : une fiche Open Food Facts donne une catégorie locale et une miniature.
  - Fichiers : `apps/api/src/off/category-guess.service.ts`, `apps/api/src/images/remote-image.service.ts`.
  - Comportement : parcours de `categories_tags` du dernier au premier, première correspondance retenue, sinon « Autre ». Image : HTTPS seulement, hôte terminé par `.openfoodfacts.org`, redirections non suivies, 8 Mo maximum, délai de 4 s ; tout échec laisse `image_path` vide sans erreur.
  - Tests : unitaires : tag le plus spécifique prioritaire, aucun tag connu, liste vide ; URL en HTTP, hôte étranger, redirection, fichier trop gros, contenu non image.
  - Fin : tests verts ; une URL `https://exemple.test/x.jpg` n'est jamais appelée.

- [ ] **1.8 Résolution d'un scan**
  - Résultat : `GET /scan/{barcode}` répond `known`, `suggested` ou `unknown`.
  - Fichiers : `apps/api/src/scan/`, `packages/shared/src/scan.ts`.
  - Comportement : code invalide : 400 sans appel réseau. Présent au catalogue : `known` avec le produit et son stock. Trouvé chez Open Food Facts avec un nom : produit créé (`source=off`, `category_guessed=true`, `off_payload`), image téléchargée en tâche de fond, réponse `suggested`. Fiche sans nom : `unknown` raison `poor_data` avec indices. Absent : `unknown/not_found`. Panne : `unknown/off_unavailable`. Deux scans simultanés du même code inconnu ne créent qu'un produit.
  - Tests : intégration avec client simulé : les cinq issues, le format UPC-A, la création unique en concurrence, le second scan qui renvoie `known`.
  - Fin : avec Open Food Facts simulé en panne, `GET /api/scan/3017620422003` renvoie 200 `{"status":"unknown","reason":"off_unavailable"}`.

### Stock

- [ ] **1.9 Ajustement du stock et journal**
  - Résultat : `POST /stock/adjust` modifie le stock et écrit le journal dans la même transaction.
  - Fichiers : `apps/api/src/stock/{stock.controller,stock.service}.ts`, `packages/shared/src/stock.ts`.
  - Comportement : entrée `{productId, locationId, shelfId?, expiryDate?, delta, reason}` avec `reason` parmi `scan_add`, `scan_remove`, `manual`, `correction`. Delta positif : crée la ligne ou additionne. Delta négatif : décrémente, supprime la ligne à 0, 409 « Stock insuffisant » au-delà. Delta 0, étagère d'un autre lieu, date invalide : 400. Fixe le lieu habituel du produit s'il est vide. Réponse : la ligne à jour (ou `null`) et le mouvement.
  - Tests : intégration : création, addition sur la même clé, date différente = autre ligne, passage à 0, dépassement, étagère incohérente, auteur du mouvement, deux décréments concurrents, somme du journal égale au stock.
  - Fin : deux `adjust` de +2 puis −4 renvoient 409 et laissent la quantité à 4.

- [ ] **1.10 Lecture du stock et compteurs**
  - Résultat : `GET /stock` alimente la vue Liste.
  - Fichiers : `apps/api/src/stock/stock.query.ts`.
  - Comportement : filtres `location`, `shelf`, `category`, `q` (nom ou marque) ; tri `name`, `added`, `expiry` (sans date en dernier) ; chaque ligne porte produit, catégorie, lieu, étagère, quantité, date limite et statut d'échéance (`expired`, `soon` avec nombre de jours, ou aucun) calculé en Europe/Paris ; compteurs par lieu : produits distincts et unités.
  - Tests : intégration sur un jeu de données : chaque filtre, chaque tri, bornes J-3, aujourd'hui, hier, compteurs.
  - Fin : `GET /api/stock?location={frigo}&sort=expiry` renvoie les lignes du frigo, la plus proche de l'échéance en premier.

- [ ] **1.11 Déplacement, retrait automatique, historique**
  - Résultat : `POST /stock/move`, `POST /stock/remove`, `GET /products/{id}/movements`.
  - Fichiers : `apps/api/src/stock/{stock-move.service,stock-remove.service}.ts`.
  - Comportement : `move` `{stockItemId, toLocationId, toShelfId?, quantity}` : deux mouvements `move` (moins et plus) en une transaction, fusion à la destination, 400 si origine = destination, 409 si quantité supérieure au stock. `remove` `{productId}` : décrémente de 1 la ligne à la date limite la plus proche, sinon la plus ancienne ; 404 « Pas en stock » ; réponse : la ligne touchée, pour le message et l'annulation. `movements` : du plus récent au plus ancien, avec pseudo, lieu, étagère, delta, raison ; pagination par curseur.
  - Tests : intégration : déplacement partiel et total, fusion, erreurs ; choix de la ligne en retrait ; auteur et ordre de l'historique ; compte désactivé toujours nommé.
  - Fin : après un `move`, l'historique du produit contient deux lignes `move` de deltas opposés.

- [ ] **1.12 `GET /home`**
  - Résultat : toute la vue Maison en un appel.
  - Fichiers : `apps/api/src/home/`.
  - Comportement : par lieu (ordre `sort_order`) : type, icône, compteurs (produits, unités, bientôt périmés), étagères ordonnées avec leurs vignettes (ligne de stock, produit, image ou icône de catégorie, quantité, date limite, statut), et plateau « Non rangé ».
  - Tests : intégration : base vide (4 meubles, étagères vides), produit rangé, produit non rangé, compteur d'échéance.
  - Fin : `GET /api/home` renvoie 4 meubles ; un ajout au Frigo, étagère 2, apparaît dans cette étagère.

### Scanner et ajout

- [ ] **1.13 Moteurs de scan**
  - Résultat : une interface `Scanner` qui cache `BarcodeDetector` et `zxing-wasm`.
  - Fichiers : `apps/web/lib/scanner/{types,native-engine,zxing-engine,create-scanner,fake-engine}.ts`, WASM copié dans `apps/web/public/`.
  - Comportement : choix du moteur natif s'il gère EAN-13, EAN-8, UPC-A et UPC-E, sinon ZXing ; environ 10 lectures par seconde ; résultat `{code, format}` ; même code ignoré pendant 2 s ; `decodeImage(blob)` pour la photo ; WASM chargé depuis l'application, jamais depuis un CDN ; moteur factice seulement si `NEXT_PUBLIC_E2E=1`.
  - Tests : unitaires : sélection du moteur, cadence, anti-doublon, décodage par ZXing d'images EAN-13, EAN-8 et UPC-A en fixtures, image sans code.
  - Fin : `npm run test:web` passe ; le build de production ne contient pas `fake-engine`.

- [ ] **1.14 Écran Scanner**
  - Résultat : caméra arrière plein écran sur `/`.
  - Fichiers : `apps/web/app/(app)/page.tsx`, `apps/web/components/scanner/{ScannerView,CameraControls,PermissionHelp}.tsx`, `apps/web/lib/scanner/camera.ts`.
  - Comportement : flux démarré par le bouton Scanner (`facingMode: environment`, 1280 × 720, `playsinline muted`) ; cadre de visée horizontal ; bip et vibration si disponibles ; bouton lampe et mise au point continue seulement si `getCapabilities()` les expose ; choix de caméra s'il y en a plusieurs ; caméra coupée en quittant l'écran ou en masquant l'onglet ; bascule Ajouter / Retirer ; caméra refusée ou absente : message avec les étapes de la plateforme détectée et accès direct aux replis ; contexte non sécurisé : message « HTTPS requis ».
  - Tests : composants avec faux `MediaStream` : démarrage, arrêt sur `visibilitychange`, lampe masquée, refus de permission, bascule de mode.
  - Fin : tests verts ; en local sur Chrome, la caméra s'allume et s'éteint au changement d'onglet.

- [ ] **1.15 Solutions de repli**
  - Résultat : un code peut toujours être saisi sans flux vidéo.
  - Fichiers : `apps/web/components/scanner/{ManualCodeInput,PhotoCodeButton,InAppBrowserNotice}.tsx`, `apps/web/lib/platform.ts`.
  - Comportement : champ au clavier numérique, validé par Entrée (lecteur USB ou Bluetooth), code invalide refusé avec un message ; « Prendre une photo du code » (`capture="environment"`) décodée par ZXing, « Code illisible, réessayez » sinon ; navigateur intégré (Instagram, Facebook, WhatsApp) : « Ouvrez cette page dans Safari ou Chrome ».
  - Tests : composants : saisie valide, clé fausse, saisie rapide terminée par Entrée, photo lisible et illisible, détection par agent utilisateur.
  - Fin : tests verts.

- [ ] **1.16 Fiche d'ajout**
  - Résultat : feuille quantité, lieu, étagère, date limite.
  - Fichiers : `apps/web/components/add/{AddSheet,QuantityStepper,LocationPicker,UndoToast}.tsx`.
  - Comportement : photo ou pictogramme, nom, marque, catégorie ; quantité 1 par défaut, minimum 1 ; lieu prérempli selon l'ordre A6 ; étagère facultative (« Non rangé » par défaut) ; date limite facultative ; « Ajouter » et « Ajouter et scanner le suivant » ; message « Ajouté : 2 × Lait demi-écrémé, Frigo, étagère 2 » avec Annuler pendant 5 s (mouvement `correction`) ; hors ligne ou erreur : la feuille reste ouverte avec un message, rien n'est perdu.
  - Tests : composants : valeurs par défaut, stepper, changement de lieu qui vide l'étagère, envoi, annulation, échec réseau.
  - Fin : tests verts.

- [ ] **1.17 Flux de scan, mode Ajouter**
  - Résultat : du code détecté à l'ajout, pour un produit connu ou trouvé.
  - Fichiers : `apps/web/lib/scan-flow.ts`, `apps/web/components/scanner/ScanFlow.tsx`.
  - Comportement : code détecté : pause du scan, appel de `/scan` ; `known` ou `suggested` : fiche d'ajout (mention « Catégorie proposée » si devinée, modifiable sur place) ; `unknown` : formulaire de la tâche 1.18 ; code invalide : message, le scan reprend ; hors ligne : « Pas de connexion ».
  - Tests : composants pour chaque issue. E2E (moteur factice et serveur de fixtures) : produit Open Food Facts ajouté et visible ; second scan reconnu ; saisie manuelle du même code.
  - Fin : l'e2e « scan simulé d'un produit Open Food Facts » passe sur les deux navigateurs.

- [ ] **1.18 Formulaire produit inconnu**
  - Résultat : un produit inconnu est décrit une seule fois.
  - Fichiers : `apps/web/components/product/{ProductForm,PhotoField}.tsx`.
  - Comportement : nom et catégorie obligatoires, marque, lieu habituel, photo facultative ; indices préremplis si fournis ; message adapté à la raison (introuvable, Open Food Facts injoignable) ; validation : création, envoi de la photo, puis fiche d'ajout ; si la photo échoue, le produit est gardé et un message le dit.
  - Tests : composants : champs obligatoires, envoi, photo en échec. E2E : code inconnu, formulaire, ajout, second scan reconnu ; Open Food Facts en panne : formulaire vide et ajout possible.
  - Fin : les deux e2e passent.

- [ ] **1.19 Ajouter sans code-barres**
  - Résultat : fruits, légumes et boucherie ajoutés par le nom.
  - Fichiers : `apps/web/components/add/CatalogSearch.tsx`.
  - Comportement : lien sur l'écran Scanner ; recherche dès 2 caractères avec temporisation ; résultat touché : fiche d'ajout (raison `manual`) ; aucun résultat : « Créer ce produit » ouvre le formulaire sans code-barres.
  - Tests : composants : recherche, état vide, création. E2E : « Tomates » créé et ajouté sans code.
  - Fin : l'e2e « ajout manuel d'un produit » passe.

- [ ] **1.20 Mode Retirer**
  - Résultat : un scan décrémente de 1.
  - Fichiers : `apps/web/components/scanner/RemoveFlow.tsx`.
  - Comportement : `known` : `POST /stock/remove`, message « Retiré : 1 × Lait, Frigo » avec Annuler 5 s, le scan reprend ; pas en stock : « Pas en stock » ; inconnu : « Produit inconnu », proposition de passer en mode Ajouter ; aucun produit n'est créé en mode Retirer.
  - Tests : composants pour les trois cas et l'annulation. E2E : stock 2, deux retraits, l'article disparaît de l'inventaire.
  - Fin : l'e2e de retrait passe.

### Inventaire

- [ ] **1.21 Vue Liste**
  - Résultat : inventaire par lieu et catégorie.
  - Fichiers : `apps/web/app/(app)/inventaire/page.tsx`, `apps/web/components/list/{ListView,LocationTabs,CategorySection,StockCard,ExpiryBadge,ListToolbar}.tsx`.
  - Comportement : bascule Maison / Liste ; onglets Tout puis lieux ; sections repliables par catégorie ; carte : photo ou pictogramme, nom, marque, quantité, − / + (raison `manual`, mise à jour optimiste, retour arrière en cas d'erreur, la carte disparaît à 0) ; recherche, filtre de catégorie, tri ; pastille ambre « J-3 » ou « Aujourd'hui », rouge « Périmé », toujours avec le mot ; compteurs d'articles et d'unités ; état vide avec bouton vers le scanner.
  - Tests : composants : pastille aux bornes, carte et retour arrière, sections, état vide. E2E : 3 unités ajoutées au Frigo visibles sous Frigo dans la bonne catégorie ; modification de quantité.
  - Fin : l'e2e « modification de quantité » passe.

- [ ] **1.22 Vue Maison : les quatre meubles**
  - Résultat : grille des meubles dessinés.
  - Fichiers : `apps/web/components/home/{HomeView,FurnitureCard}.tsx`, `apps/web/components/home/furniture/{Pantry,Fridge,Freezer,Cellar}.tsx`.
  - Comportement : 2 colonnes sur téléphone, 4 sur ordinateur ; en-tête indigo ; chaque meuble : SVG aux seules couleurs des tokens (intérieur lavande, traits indigo, lumière ambre du frigo), nombre d'articles, pastille ambre « n bientôt périmés » si besoin ; dessin choisi par `locations.kind`.
  - Tests : composants : quatre meubles rendus, compteur, pastille absente à 0. E2E : la vue Maison affiche quatre meubles nommés.
  - Fin : l'e2e « vue Maison » passe.

- [ ] **1.23 Meuble ouvert**
  - Résultat : étagères et vignettes d'un meuble.
  - Fichiers : `apps/web/app/(app)/inventaire/[lieu]/page.tsx`, `apps/web/components/home/{OpenFurniture,ShelfRow,ProductTile,UnshelvedTray}.tsx`.
  - Comportement : ouverture animée (250 ms, `transform` et `opacity` seulement, coupée par `prefers-reduced-motion`) ; étagères empilées dans l'ordre, dessin `rack` ou `plain` ; vignette carrée avec photo ou pictogramme et pastille ambre de quantité ; étagère pleine : défilement horizontal ; étagère vide : contour pointillé `lavender-line`, « Vide », bouton + qui ouvre le scanner avec ce meuble et cette étagère préchoisis ; plateau « Non rangé » en bas.
  - Tests : composants : ordre, étagère vide, plateau, contexte transmis au scanner. E2E : ajout depuis une étagère vide, le produit y apparaît avec sa photo.
  - Fin : l'e2e passe ; le critère « 3 unités au Frigo, étagère 2 » est vérifié dans les deux vues.

- [ ] **1.24 Panneau produit et « Déplacer vers… »**
  - Résultat : agir sur une vignette sans glisser.
  - Fichiers : `apps/web/components/home/{ProductSheet,MoveDialog}.tsx`.
  - Comportement : feuille du bas : photo, nom, quantité − / +, date limite, lien vers la fiche produit, « Déplacer vers… » (meuble, étagère ou « Non rangé », quantité = toute la ligne par défaut) ; destination identique impossible ; message de confirmation.
  - Tests : composants : choix de destination, quantité partielle, erreur 409. E2E : déplacement d'une étagère à une autre par le menu.
  - Fin : l'e2e « Déplacer vers… » passe.

- [ ] **1.25 Glisser-déposer**
  - Résultat : déplacement par appui long, à la souris et au clavier.
  - Fichiers : `apps/web/components/home/dnd/{DndProvider,DroppableShelf,FurnitureDropBar}.tsx`.
  - Comportement : `@dnd-kit/core` ; tactile : appui de 250 ms, tolérance 5 px ; souris : distance de 8 px ; clavier : Espace, flèches, Espace, avec annonces en français ; barre des meubles visible en haut pendant le glissement (dépôt = « Non rangé » du meuble) ; mise à jour optimiste et retour arrière en cas d'erreur ; glisser déplace toute la ligne.
  - Tests : composants : logique de dépôt (étagère, meuble, origine). E2E : déplacement au clavier sur les deux navigateurs, à la souris sur Chromium ; l'historique contient deux mouvements `move`.
  - Fin : l'e2e de glisser-déposer passe.

- [ ] **1.26 Recherche et filtres de la vue Maison**
  - Résultat : retrouver un produit dans la maison.
  - Fichiers : `apps/web/components/home/HomeFilters.tsx`.
  - Comportement : recherche et puces de catégorie (fond lavande) ; les vignettes hors filtre s'estompent ; les meubles qui contiennent un résultat sont entourés d'ambre ; filtre conservé en ouvrant un meuble.
  - Tests : composants : filtrage par texte et par catégorie, meuble entouré.
  - Fin : tests verts.

- [ ] **1.27 Fiche produit**
  - Résultat : modifier un produit et lire son historique.
  - Fichiers : `apps/web/app/(app)/produits/[id]/page.tsx`, `apps/web/components/product/{ProductEdit,StockByLocation,MovementList}.tsx`.
  - Comportement : modifier nom, marque, catégorie, lieu habituel, photo ; stock par lieu et étagère ; historique « qui, quand, combien, où, pourquoi » en français, chargé par pages ; produit inconnu : page « Produit introuvable ».
  - Tests : composants : formulaire, libellés des raisons. E2E : deux membres agissent sur un produit, l'historique nomme chacun ; la catégorie modifiée se voit dans la vue Liste.
  - Fin : l'e2e « deux membres, même stock » passe.

- [ ] **1.28 À classer**
  - Résultat : classer en un toucher.
  - Fichiers : `apps/web/app/(app)/a-classer/page.tsx`, `apps/web/components/review/ReviewCard.tsx`.
  - Comportement : produits en stock dont la catégorie est « Autre » ou devinée ; un toucher sur « Confirmer » ou sur une autre catégorie classe le produit et le retire de la liste ; pastille de compteur sur l'onglet ; état vide « Tout est classé ».
  - Tests : composants : confirmation, changement, état vide. E2E : un produit scanné apparaît, est confirmé, disparaît.
  - Fin : l'e2e passe.

### Comptes et administration

- [ ] **1.29 API membres**
  - Résultat : gestion des comptes par l'admin.
  - Fichiers : `apps/api/src/users/`.
  - Comportement : `GET /users` ; `POST /users` (pseudo, mot de passe temporaire, rôle ; 409 si le pseudo existe, même désactivé) ; `PATCH /users/{id}` (rôle, nouveau mot de passe : révoque ses sessions ; réactivation) ; `DELETE /users/{id}` : désactivation et révocation des sessions. Dernier admin et soi-même protégés (409). Tout en 403 pour un membre. Le hachage ne sort jamais dans une réponse.
  - Tests : intégration de chaque route et de chaque garde-fou ; compte désactivé incapable de se connecter et session coupée.
  - Fin : `POST /api/users` par un membre renvoie 403 ; `POST /api/users` sans session renvoie 401.

- [ ] **1.30 Écrans Plus et Compte**
  - Résultat : compte personnel et accès à l'administration.
  - Fichiers : `apps/web/app/(app)/plus/page.tsx`, `apps/web/app/(app)/plus/compte/page.tsx`.
  - Comportement : Plus : Compte, Administration (visible pour l'admin seulement), Installer l'application (emplacement prévu pour 1.34), Se déconnecter. Compte : pseudo, rôle, changement de mot de passe avec messages d'erreur clairs.
  - Tests : composants : entrée Administration masquée pour un membre, formulaire. E2E : changement de mot de passe puis reconnexion.
  - Fin : l'e2e passe.

- [ ] **1.31 Administration : membres**
  - Résultat : créer, réinitialiser, désactiver, réactiver un membre.
  - Fichiers : `apps/web/app/(app)/plus/administration/membres/page.tsx`.
  - Comportement : liste avec rôle et état ; création avec mot de passe temporaire ; confirmation avant désactivation ; erreurs 409 expliquées ; un membre qui ouvre l'URL voit « Accès réservé à l'administrateur ».
  - Tests : composants des formulaires. E2E : l'admin crée un membre, qui se connecte ; l'admin le désactive, sa connexion échoue.
  - Fin : l'e2e passe.

- [ ] **1.32 Administration : lieux et étagères**
  - Résultat : renommer et réordonner les lieux, gérer leurs étagères.
  - Fichiers : `apps/web/app/(app)/plus/administration/lieux/page.tsx`.
  - Comportement : nom, icône et ordre d'un lieu ; ajouter, renommer, changer le type, réordonner (boutons monter et descendre), supprimer une étagère avec confirmation « les produits iront dans Non rangé ».
  - Tests : composants. E2E : une étagère ajoutée apparaît dans la vue Maison ; supprimée, ses produits passent en « Non rangé ».
  - Fin : l'e2e passe.

- [ ] **1.33 Administration : catégories et correspondances**
  - Résultat : gérer les catégories et la table Open Food Facts.
  - Fichiers : `apps/web/app/(app)/plus/administration/{categories,correspondances}/page.tsx`.
  - Comportement : nom, icône (sélecteur d'icônes Lucide), ordre ; suppression avec confirmation « les produits iront dans Autre » ; « Autre » non supprimable ; correspondances : liste filtrable, ajout, modification, suppression, doublon signalé.
  - Tests : composants. E2E : une correspondance ajoutée classe un produit scanné ensuite.
  - Fin : l'e2e passe.

### PWA, compatibilité, qualité

- [ ] **1.34 Fenêtre d'installation**
  - Résultat : invitation à installer tant que l'application ne l'est pas.
  - Fichiers : `apps/web/lib/install.ts`, `apps/web/components/pwa/{InstallSheet,IosInstallSteps,BrowserInstallHelp}.tsx`.
  - Comportement : après la connexion seulement, jamais en `standalone` ; Chrome, Edge, Android : `beforeinstallprompt` mis de côté, `prompt()` au clic sur Installer, `appinstalled` ferme ; iOS : trois étapes illustrées (Partager, Sur l'écran d'accueil, Ajouter) ; Firefox Android : instructions du menu ; sans support : rien ; « Plus tard » masque 7 jours, « Ne plus afficher » définitivement (stockage local) ; lien « Installer l'application » dans Plus ; présentation `Callout` en feuille du bas.
  - Tests : unitaires de la machine d'états (plateformes, délais avec horloge simulée, standalone) ; composants ; e2e Chromium avec événement simulé.
  - Fin : tests verts ; la fenêtre n'apparaît pas sur `/connexion`.

- [ ] **1.35 Audit compatibilité, accessibilité, identité**
  - Résultat : conformité vérifiée sur tous les écrans.
  - Fichiers : `e2e/tests/a11y.spec.ts`, corrections dans les composants.
  - Comportement : aucun défilement horizontal à 360 px ; zones tactiles de 44 px ; contrastes AA (axe) ; aucun texte ambre sur blanc ; statuts toujours avec un mot ; aucun emoji ; animations coupées par `prefers-reduced-motion` ; marges de zone sûre ; police Carlito chargée.
  - Tests : e2e axe sur chaque écran à 360 px ; test qui échoue sur un caractère emoji dans `apps/web` ; `check-colors`.
  - Fin : `npm run test:e2e` et `npm run lint` passent.

- [ ] **1.36 Consolidation du parcours critique e2e**
  - Résultat : un scénario unique de bout en bout, en plus des e2e de chaque tâche.
  - Fichiers : `e2e/tests/critical-path.spec.ts`.
  - Comportement : connexion, ajout manuel, scan simulé, modification de quantité, vue Maison, déplacement, retrait jusqu'à 0, second membre qui voit le même stock ; durée du job e2e sous 10 minutes.
  - Tests : le scénario, sur Chromium et WebKit.
  - Fin : `gh pr checks` : job `e2e` vert en moins de 10 minutes.

- [ ] **1.37 Sauvegardes et restauration**
  - Résultat : sauvegarde complète et restauration prouvée.
  - Fichiers : `scripts/{backup-images.sh,restore-db.sh,test-backup-restore.sh}`.
  - Comportement : archive datée du volume `images`, 14 conservées ; `restore-db.sh <fichier>` refuse une base non vide sauf `--force` ; test : sauvegarde, restauration sur une base vide, comparaison du nombre de lignes de chaque table.
  - Tests : `test-backup-restore.sh` dans le job `docker-build` ; `shellcheck`.
  - Fin : `./scripts/test-backup-restore.sh` se termine par `OK`.

- [ ] **1.38 README complet**
  - Résultat : documentation d'exploitation.
  - Fichiers : `README.md`.
  - Comportement : installation, variables ; déploiement en production derrière le nginx partagé, pas à pas pour Lucas : certificat certbot en webroot pour `inventaire.lucaszivan.app`, ajout du bloc d'exemple au nginx existant, test puis rechargement de sa configuration, `./deploy.sh`, vérification de `https://inventaire.lucaszivan.app/api/health`, renouvellement du certificat, dépannage (502 tant que les conteneurs ne sont pas sur `easyq_default`) ; variante Caddy embarqué pour un VPS vierge ; cron de sauvegarde (base et images), copie hors du VPS, restauration, reconstruction mensuelle des images (`--no-cache`), recette manuelle sur vrais appareils reprise du cahier (6 points), test manuel du scan.
  - Tests : sans objet.
  - Fin : chaque commande du README est exécutable telle quelle.

- [ ] **1.39 Checklist des critères d'acceptation**
  - Résultat : chaque critère du MVP noté validé (avec le test qui le prouve), non validé, ou à valider par Lucas.
  - Fichiers : `TASKS.md` (section Critères de fin de phase).
  - Comportement : aucun critère coché sans preuve ; les critères sur vrais appareils, 4G, VPS et HTTPS restent à la charge de Lucas.
  - Tests : toute la suite.
  - Fin : la section est remplie et la suite complète est verte.

- [ ] **1.40 PR et arrêt**
  - Résultat : PR `phase-1-v1` avec CI verte.
  - Fichiers : `TASKS.md`.
  - Comportement : description avec la checklist et les décisions ; marqueur d'arrêt en dernière ligne.
  - Tests : sans objet.
  - Fin : `gh pr checks` vert ; la dernière ligne de `TASKS.md` est le marqueur d'arrêt.

## Phase 2 : Confort (branche `phase-2-confort`) : 14 tâches

> Contenu choisi par Lucas le 14/11/2026 (le schéma Roadmap est absent du cahier). Détail à affiner au début de la phase, au même format que la Phase 1.

### Péremption
- [ ] **2.1 Réglage du seuil d'alerte** : table `settings` du foyer, seuil en jours (3 par défaut), `GET/PATCH /settings` (écriture admin) ; les pastilles et compteurs l'utilisent. Fin : seuil à 5, un produit à J-5 devient « bientôt périmé ».
- [ ] **2.2 Écran « Bientôt périmés »** : liste triée par date, accessible depuis la pastille d'un meuble et depuis Plus, avec retrait rapide. Fin : e2e.
- [ ] **2.3 Abonnement aux notifications push** : clés VAPID dans `.env`, table `push_subscriptions`, activation par appareil depuis Compte, masquée quand le navigateur ne le permet pas (iOS non installé). Fin : tests d'intégration avec envoi simulé.
- [ ] **2.4 Résumé quotidien** : tâche planifiée à 8 h (Europe/Paris), une notification par abonné s'il y a des produits sous le seuil ; abonnement expiré supprimé. Fin : test avec horloge simulée.

### Liste de courses
- [ ] **2.5 Seuil minimum par produit** : `products.min_quantity`, modifiable dans la fiche produit. Fin : tests API.
- [ ] **2.6 API liste de courses** : table `shopping_items` (produit ou libellé libre, quantité, coché, origine automatique ou manuelle) ; entrée automatique quand le stock total passe sous le seuil, retirée quand il repasse au-dessus. Fin : tests d'intégration.
- [ ] **2.7 Écran Liste de courses** : cocher, ajouter une ligne libre, vider les lignes cochées ; accès depuis Plus. Fin : e2e.

### Confort de saisie
- [ ] **2.8 Scan en rafale** : option du scanner : un produit connu est ajouté (+1, lieu habituel) sans fiche, avec Annuler ; un produit inconnu ouvre toujours le formulaire. Fin : e2e.
- [ ] **2.9 Édition en lot** : sélection multiple dans la vue Liste, puis déplacer ou retirer. Fin : e2e.
- [ ] **2.10 Fusion de produits en double** (admin) : `products.merged_into_id`, stock transféré par mouvements `correction`, journal d'origine intact, le code-barres fusionné mène au produit conservé. Fin : tests d'intégration.
- [ ] **2.11 Rattacher un code-barres à un produit créé à la main** : sur un code inconnu, « C'est un produit existant » ouvre la recherche du catalogue. Fin : e2e.

### Clôture
- [ ] **2.12 Parcours e2e de la Phase 2** et audit d'accessibilité des nouveaux écrans.
- [ ] **2.13 README et checklist** mis à jour (variables VAPID, nouvelles tables).
- [ ] **2.14 PR `phase-2-confort`**, CI verte, puis marqueur de fin en dernière ligne.

## Critères de fin de phase

### Phase 0
- [ ] Un membre se connecte avec pseudo et mot de passe et reste connecté 30 jours (tests 0.12, e2e 0.16).
- [ ] Sans compte, aucune donnée n'est accessible et aucun compte ne peut être créé (test 0.12 ; aucune route d'inscription).
- [ ] Une PR qui casse un test ou le build ne peut pas être mergée (CI 0.7 ; protection de branche : Lucas).
- [ ] `docker compose up -d` démarre toute la pile depuis zéro (0.21, en local avec `APP_DOMAIN=localhost`).
- [ ] Hors connexion, la coquille s'ouvre et affiche « Pas de connexion » (e2e 0.18).
- [ ] Le manifeste est valide et l'application installable (0.17).
- [ ] Les couleurs et la police de l'écran de connexion viennent des tokens (0.15).

### Phase 1 (critères d'acceptation du MVP)
- [ ] Produit présent sur Open Food Facts prérempli en moins de 3 secondes en 4G (e2e 1.17 pour le flux ; mesure : Lucas).
- [ ] Code inconnu partout : formulaire vide ; validé, le scan suivant est reconnu (e2e 1.18).
- [ ] 3 unités au Frigo, étagère 2 : visibles dans la vue Liste et sur la bonne étagère de la vue Maison, avec la photo (e2e 1.21, 1.23).
- [ ] La vue Maison affiche les quatre meubles ; déplacement par glisser-déposer et par « Déplacer vers… » (e2e 1.22, 1.24, 1.25).
- [ ] Le mode Retirer décrémente ; à 0, l'article disparaît (e2e 1.20).
- [ ] Deux membres voient le même stock ; le journal indique l'auteur (e2e 1.27).
- [ ] Open Food Facts injoignable : formulaire vide, rien ne plante (test 1.8, e2e 1.18).
- [ ] La fenêtre d'installation s'affiche tant que l'application n'est pas installée et ne revient plus ensuite (tests 1.34 ; appareils : Lucas).
- [ ] Installée, l'application s'ouvre en plein écran ; hors connexion, « Pas de connexion » (e2e 0.18 ; appareils : Lucas).
- [ ] iPhone (Safari, puis Chrome ou Edge) : installation et scan (Lucas).
- [ ] Android (Chrome, Samsung Internet, Firefox) et ordinateur : installation et scan (Lucas).
- [ ] Caméra refusée ou indisponible : saisie manuelle, photo du code et lecteur USB permettent d'ajouter (tests 1.15, e2e 1.17).
- [ ] Les couleurs et la police correspondent aux tokens (1.35).
- [ ] `docker compose up -d` sur un VPS vierge met l'application en ligne en HTTPS (Lucas ; test de fumée Caddy en CI). Sur le VPS actuel : en ligne derrière le nginx partagé via `docker-compose.shared-proxy.yml` (Lucas).
- [ ] Une sauvegarde `pg_dump` se restaure sur une base vide (1.37 ; essai réel avant mise en service : Lucas).
- [ ] Recette sur appareils réels du cahier, 6 points (Lucas).

### Phase 2
- [ ] Un produit sous le seuil apparaît dans « Bientôt périmés » et, si l'appareil est abonné, dans le résumé quotidien.
- [ ] Un produit passé sous son minimum apparaît dans la liste de courses et en sort quand le stock remonte.
- [ ] Dix produits connus sont ajoutés en rafale sans ouvrir de fiche.
- [ ] Deux doublons fusionnés ne laissent qu'un produit, sans perte de stock ni d'historique.

## Décisions prises

- 14/11/2026 : T1. Reverse proxy (corrigé le même jour) : le proxy du VPS est un nginx en conteneur (`easyq-nginx-1`, image `nginx:alpine`, réseau Docker `easyq_default`), pas un nginx sur l'hôte : il ne peut pas joindre un port publié sur `127.0.0.1`. En production, web et api rejoignent le réseau externe `easyq_default` (`SHARED_PROXY_NETWORK`, fichier `docker-compose.shared-proxy.yml`) sous les noms `inventaire-web` (3000) et `inventaire-api` (3001), sans publier de port sur l'hôte. Les certificats viennent de certbot (webroot). Le Caddy du compose reste disponible par profil (`COMPOSE_PROFILES=proxy`) pour le test local, la CI et un VPS vierge. Claude ne touche jamais au VPS : la configuration nginx est un fichier d'exemple que Lucas installe.
- 14/11/2026 : T2. Phase 2 : Péremption, Liste de courses, Confort de saisie. Pas de journal global ni d'export.
- 14/11/2026 : T3. Nom : `name` « Inventaire maison », `short_name` « Inventaire ».
- 14/11/2026 : T4. Produit trouvé sur Open Food Facts : Enregistré au catalogue dès le scan (`source=off`, `category_guessed=true`), fiche d'ajout ouverte aussitôt.
- 14/11/2026 : T5. Suppression d'un compte : Désactivation (`disabled_at`), sessions révoquées, pseudo conservé dans l'historique.
- 14/11/2026 : T6. Typographie : Le cahier fait foi : `tokens.css` est corrigé (titre de carte 18/24, étiquette 12/16 `indigo-mid` interlettrage 0,12 em, ajout du texte d'aide 12/16).
- 14/11/2026 : T7. Mode Retirer, plusieurs lignes : Automatique : date limite la plus proche, sinon ligne la plus ancienne ; Annuler 5 s.
- 14/11/2026 : T8. Mot de passe temporaire : Aucun changement forcé.
- 14/11/2026 : C1. Variables : le cahier liste `APP_DOMAIN`, `POSTGRES_PASSWORD` ; le README liste `PUBLIC_URL` : Liste du cahier. L'origine publique est déduite : `https://$APP_DOMAIN`. README réécrit.
- 14/11/2026 : C2. Migrations : appliquées par l'API au démarrage (cahier) ou par `deploy.sh` (README, ancien TASKS) ? : Par l'API au démarrage. `deploy.sh` suit les 7 étapes du cahier, sans étape de migration.
- 14/11/2026 : C3. `/health` : public selon `CLAUDE.md`, absent des exceptions du cahier : Public, ne renvoie que `{"status":"ok"}` (nécessaire aux healthchecks).
- 14/11/2026 : C4. Rôle `membre` (texte) contre `member` (modèle) : `member` dans le code et la base, « Membre » à l'écran.
- 14/11/2026 : C5. « À classer » : catégorie Autre ou devinée (cahier) contre « sans lieu ou devinée » (ancien TASKS 1.14) : Cahier. Limité aux produits actuellement en stock (conséquence de T4 : un scan abandonné ne pollue pas la liste).
- 14/11/2026 : C6. Sous-domaine « à définir » (tableau final) contre `inventaire.lucaszivan.app` retenu (déploiement) : `inventaire.lucaszivan.app`.
- 14/11/2026 : C7. Lieux : routes `POST/DELETE /locations` et `kind=other`, mais « quatre meubles fixes » retenu : V1 : pas de création ni suppression de lieu. `GET` et `PATCH` (nom, icône, ordre) seulement ; `other` reste réservé dans l'énumération. **À confirmer.**
- 14/11/2026 : C8. Ordre des lieux : « Garde-manger, Frigo, Cave, Congélateur » (onglets) contre « Garde-manger, Frigo, Congélateur, Cave » (vue Maison) : `sort_order` initial de la vue Maison ; les onglets suivent `sort_order`.
- 14/11/2026 : C9. Fiche d'ajout : addition si « même lieu, même date » ; contrainte d'unicité : lieu, étagère, date : Le modèle fait foi : même lieu, même étagère, même date.
- 14/11/2026 : C10. `quantity ≥ 0` mais une ligne à 0 est supprimée : `CHECK (quantity > 0)`.
- 14/11/2026 : C11. `SESSION_SECRET` « de signature » alors que le jeton est opaque et haché en base : `sessions.id = HMAC-SHA256(SESSION_SECRET, jeton)`. Changer le secret révoque toutes les sessions.
- 14/11/2026 : C12. Ancien TASKS : job `docker-build` de la CI (0.5) avant les Dockerfiles (0.8) ; PR ouverte en fin de phase alors que `gh pr checks` est exigé après chaque push : Dockerfiles et compose avant la CI ; PR ouverte en brouillon dès la CI.
- 14/11/2026 : C13. Ancien TASKS 0.2 « copier cahier et tokens » : déjà fait : Remplacé par l'alignement de `tokens.css` (T6).
- 14/11/2026 : C14. `run-loop.sh` : « si tu es bloqué, passe à la tâche suivante », alors que les tâches dépendent les unes des autres : Règle ajoutée dans `TASKS.md` : une tâche bloquée dont dépend la suite arrête la phase (marqueur d'arrêt + section Problèmes bloquants). Le script n'est pas modifié sans votre accord.
- 14/11/2026 : C15. `/home/lucas/CLAUDE.md` (RuFlo : essaims d'agents, event sourcing, DDD) est chargé sur cette machine et contredit « simple avant tout » : Le `CLAUDE.md` du projet et le cahier priment. Je n'applique que ce qui est compatible (fichiers de moins de 500 lignes, validation aux frontières). **À confirmer.**
- 14/11/2026 : A1. Raison de chaque mouvement : `scan_add` : fiche d'ajout ouverte par un code (caméra, saisie, photo, lecteur USB). `scan_remove` : mode Retirer. `manual` : boutons − / + et ajout sans code-barres. `move` : déplacement, et renvoi au « Non rangé » à la suppression d'une étagère. `correction` : bouton Annuler.
- 14/11/2026 : A2. Code à 8 chiffres : EAN-8 ou UPC-E ? : Le moteur de scan transmet le format ; UPC-E est développé en UPC-A puis EAN-13. Sans format (saisie manuelle), 8 chiffres = EAN-8. 12 chiffres = UPC-A, préfixé d'un 0. Stockage canonique : EAN-13 ou EAN-8.
- 14/11/2026 : A3. Pastille le jour même : « Aujourd'hui » (ambre), puis J-1 à J-3 ; « Périmé » si la date est passée. Dates sans heure, fuseau Europe/Paris. « Bientôt périmés » d'un meuble = échéance à 3 jours ou moins, périmés inclus.
- 14/11/2026 : A4. Session « glissante » : `expires_at` et cookie repoussés de 30 jours si la dernière prolongation date de plus de 24 h. Changer son mot de passe révoque les autres sessions.
- 14/11/2026 : A5. Glisser une ligne : quelle quantité ? : Glisser déplace toute la ligne ; « Déplacer vers… » permet de choisir la quantité. Déposer sur un autre meuble = son plateau « Non rangé ». Si la destination a déjà ce produit à la même date, les quantités s'additionnent.
- 14/11/2026 : A6. Lieu prérempli de la fiche d'ajout : Ordre : meuble/étagère d'où le scanner a été ouvert, lieu habituel du produit, dernier lieu utilisé sur l'appareil, premier lieu. Le lieu habituel d'un produit sans valeur est fixé au premier ajout.
- 14/11/2026 : A7. Vue Liste : une carte par quoi ? : Une carte par ligne de stock (produit, étagère, date) ; − / + agit sur cette ligne. « Articles » = produits distincts, « unités » = somme des quantités.
- 14/11/2026 : A8. « Annuler » : après quoi ? : Après un ajout et après un retrait par scan ; mouvement inverse `correction`.
- 14/11/2026 : A9. Bacs à légumes, balconnet, tiroirs : `shelves.kind` n'a que `rack` et `plain` : Ce sont des étagères `plain` nommées ; c'est le `kind` du meuble qui décide du dessin des emplacements (tiroirs pour le congélateur).
- 14/11/2026 : A10. Fiche Open Food Facts sans nom : Réponse `unknown` avec les champs disponibles en indice (marque, image) ; le formulaire s'ouvre. `unknown` porte une raison (`not_found`, `off_unavailable`, `poor_data`) pour le message.
- 14/11/2026 : A11. Recherche « par nom ou marque », insensible aux accents ? : Colonne `products.search_text` (nom + marque, minuscules, sans diacritiques, calculée par l'API) avec index trigramme GIN.
- 14/11/2026 : A12. Boutons de la fiche d'ajout : « Ajouter » revient à l'écran d'origine ; « Ajouter et scanner le suivant » relance la caméra.
- 14/11/2026 : M1. Journal non reconstructible par date limite ; tri « date d'ajout » sans colonne : Colonnes ajoutées : `stock_movements.expiry_date`, `stock_items.created_at`.
- 14/11/2026 : M2. Stockage de l'anti-force-brute : Table `login_attempts(username, ip, created_at)`. Réponse 429 avec `Retry-After`. IP lue derrière un seul proxy de confiance.
- 14/11/2026 : M3. Routes absentes du tableau : `GET /products/{id}`, `GET /images/{fichier}` (session exigée, cache immuable), `POST /stock/remove` (retrait automatique T7).
- 14/11/2026 : M4. Catégorie « Autre » supprimable ? : Colonne `categories.is_fallback` : non supprimable. Supprimer une catégorie renvoie ses produits vers « Autre ».
- 14/11/2026 : M5. Suppression d'une étagère quand le « Non rangé » a déjà le même produit à la même date : Fusion des quantités dans la transaction, deux mouvements `move`.
- 14/11/2026 : M6. Garde-fous comptes : Pseudo 3 à 30 caractères `[a-z0-9_.-]` ; mot de passe 8 à 128 ; impossible de désactiver ou rétrograder le dernier admin, ni soi-même ; même message et même durée pour pseudo inconnu ou mot de passe faux.
- 14/11/2026 : M7. Concurrence : deux décréments simultanés : Mise à jour atomique en transaction ; stock insuffisant : 409 « Stock insuffisant ».
- 14/11/2026 : M8. Image Open Food Facts et délai de 3 s : Téléchargée en tâche de fond après la réponse du scan ; pictogramme de catégorie en attendant ; nouvelle tentative au scan suivant si `image_path` est vide.
- 14/11/2026 : M9. Mode Retirer : produit pas en stock ou inconnu : Message « Pas en stock » ou « Produit inconnu », aucun mouvement, proposition de passer en mode Ajouter.
- 14/11/2026 : M10. Suppression d'un produit, modification du code-barres : Hors V1 (le rattachement d'un code-barres arrive en Phase 2).
- 14/11/2026 : M11. Cache hors ligne des lectures `/api` : Réseau d'abord avec repli cache pour les `GET` (hors `/api/auth`), cache vidé à la déconnexion ; aucune écriture en cache.
- 14/11/2026 : M12. Sauvegarde hors VPS : destination inconnue : Les scripts produisent des archives locales dans `backups/` ; le README donne un exemple `rsync`. La copie hors site reste à votre main.
- 14/11/2026 : M13. En-têtes de sécurité quand nginx remplace Caddy : `X-Robots-Tag`, `Permissions-Policy: camera=(self)`, `X-Content-Type-Options`, `Referrer-Policy` envoyés par Next et l'API eux-mêmes ; HSTS et `X-Robots-Tag` aussi dans le Caddyfile et dans l'exemple nginx ; `client_max_body_size 10m` côté nginx, au-dessus de la limite d'envoi de 8 Mo de l'API. Pas de CSP stricte en V1.
- 14/11/2026 : M14. Reprise après une porte de validation : Vous supprimez la ligne du marqueur d'arrêt dans `TASKS.md` pour relancer la boucle (procédure écrite dans `TASKS.md`).
- 14/11/2026 : M15. Critères non automatisables (4G en moins de 3 s, vrais appareils, HTTPS sur le VPS, restauration réelle) : Listés « à valider par Lucas » dans chaque PR, jamais cochés par moi.
- 14/11/2026 : ORM Drizzle ; tests API Vitest + SWC ; service worker Serwist ; repli de scan `zxing-wasm` ; Node 24 ; images `node:24-slim`.

## Problèmes bloquants
<!-- Claude : note ici ce qui t'empêche d'avancer, avec la commande et l'erreur exacte. -->

- 2026-11-14 : tâche 0.4 bloquée (non cochée). Le web (Vitest) et l'e2e Chromium passent ; le projet `webkit-mobile` échoue en local : WebKit ne démarre pas, bibliothèques système manquantes (`libgtk-4.so.1`, `libgraphene-1.0.so.0`, `libevent-2.1.so.7`, `libwebpdemux.so.2`, `libavif.so.16`, `libx264.so`, etc.).
  - Commande : `npm run test:e2e` → `Host system is missing dependencies to run browsers` (projet `webkit-mobile`, 1 failed / 1 passed).
  - Cause : `npx playwright install-deps webkit` exige sudo (`sudo: a password is required`), indisponible ici. Action pour Lucas : `sudo npx playwright install-deps webkit` sur cette machine, puis relancer la boucle. Les tâches 0.16, 0.18 et les e2e de la Phase 1 exigent WebKit : la phase s'arrête ici.
STOP: validation requise
