# Inventaire de garde-manger familial

Application web installable (PWA) pour suivre le contenu du garde-manger, du frigo, du congélateur et de la cave d'une famille : scan de code-barres, fiche produit automatique via Open Food Facts, rangement par catégorie et vue « Maison » avec meubles et étagères.

Auto-hébergée sur un VPS OVH, en conteneurs Docker, à `https://inventaire.lucaszivan.app`.

## Documentation

- Cahier des charges : [`docs/cahier-des-charges.md`](docs/cahier-des-charges.md)
- Consignes pour Claude Code : [`CLAUDE.md`](CLAUDE.md)
- Suivi d'avancement : [`TASKS.md`](TASKS.md)

## Stack

| Couche | Technologie |
| --- | --- |
| Front | Next.js (App Router), TypeScript, Tailwind, PWA (Serwist) |
| API | NestJS (REST sous `/api`), TypeScript |
| Base de données | PostgreSQL 16 (`pg_trgm`), ORM Drizzle |
| Proxy | nginx partagé du VPS en production, Caddy embarqué (profil `proxy`) en local et sur un VPS vierge |
| Conteneurs | Docker Compose |

**Choix de Drizzle** : requêtes SQL proches du métier (recherche trigramme, `NULLS NOT DISTINCT`, transactions du journal de stock), migrations en SQL lisible versionnées dans `apps/api/drizzle/`, aucune étape de génération de client à l'exécution.

## Démarrage local

Prérequis : Node.js 24 (`.nvmrc`), Docker et Docker Compose.

```bash
nvm use                     # Node 24
cp .env.example .env        # puis renseigner les valeurs
npm install                 # compile aussi packages/shared (postinstall)
COMPOSE_FILE=docker-compose.yml:docker-compose.dev.yml docker compose up -d db   # base sur 127.0.0.1:5432
npm run db:migrate          # facultatif : l'API applique aussi les migrations au démarrage
npm run dev                 # web sur :3000, api sur :3001
```

En local, l'API, `db:migrate` et `db:seed` lisent le `.env` de la racine ; une variable déjà définie dans le shell est prioritaire. En production (Docker) et dans les tests, ce fichier n'est jamais lu.

Toute la pile en conteneurs, avec Caddy embarqué :

```bash
APP_DOMAIN=localhost COMPOSE_PROFILES=proxy docker compose up -d --build --wait
curl -sk https://localhost/api/health      # {"status":"ok"}
```

## Variables d'environnement

Toutes sont décrites dans `.env.example`. Ne versionne jamais `.env`.

| Variable | Rôle |
| --- | --- |
| `APP_DOMAIN` | Domaine public (`localhost` en local) ; l'origine autorisée de l'API en est dérivée |
| `POSTGRES_PASSWORD` | Mot de passe PostgreSQL |
| `DATABASE_URL` | Connexion PostgreSQL pour `npm run dev` (Compose construit la sienne) |
| `SESSION_SECRET` | Clé HMAC des sessions (32 caractères au moins) : la base ne stocke que `HMAC-SHA256(SESSION_SECRET, jeton)`. Changer ce secret déconnecte tout le monde (révocation d'urgence) |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Premier compte administrateur, créé quand la table `users` est vide. Pseudo : 3 à 30 caractères parmi `a-z`, `0-9`, `_`, `.`, `-` (mis en minuscules) ; mot de passe : 8 à 128 caractères |
| `OFF_USER_AGENT` | User-Agent envoyé à Open Food Facts |
| `COMPOSE_FILE` | Fichiers Compose utilisés (voir les deux modes de proxy) |
| `COMPOSE_PROFILES` | `proxy` active Caddy embarqué ; vide derrière le nginx partagé |
| `SHARED_PROXY_NETWORK` | Réseau Docker externe du nginx partagé (mode production uniquement) |
| `RATE_LIMIT_PER_MINUTE` | Facultative : limite globale de requêtes par minute et par IP (300 par défaut ; `/api/health` n'est jamais limité) |

## Tests et qualité

```bash
npm run lint
npm run format:check
npm run typecheck
npm test            # API puis web ; l'API exige un PostgreSQL joignable par DATABASE_URL
                    # (défaut : postgres://test:test@localhost:5432/inventaire_test, comme en CI)
npm run test:e2e    # Playwright : Chromium (Pixel 7) et WebKit (iPhone 14)
shellcheck deploy.sh scripts/*.sh
scripts/test-backup-db.sh   # pile Compose démarrée (`docker compose up -d --wait`)
```

La CI GitHub Actions (`.github/workflows/ci.yml`) lance ces vérifications sur chaque Pull Request. Active la protection de la branche `main` dans les réglages GitHub : merge seulement si `lint-typecheck`, `test-api`, `test-web`, `e2e`, `docker-build` et `audit` sont verts. Dans `audit`, le contrôle des fichiers `.env` versionnés est bloquant ; `npm audit` ne produit qu'un avertissement.

## Production et proxy

Deux modes, choisis par `COMPOSE_FILE` et `COMPOSE_PROFILES` dans `.env`.

### Derrière le nginx partagé du VPS (production)

Le VPS héberge déjà un nginx en conteneur (`easyq-nginx-1`) qui tient les ports 80 et 443. L'application le rejoint sans publier aucun port :

```bash
COMPOSE_FILE=docker-compose.yml:docker-compose.shared-proxy.yml
COMPOSE_PROFILES=
SHARED_PROXY_NETWORK=easyq_default
```

`web` et `api` rejoignent le réseau `easyq_default` avec les alias `inventaire-web` (port 3000) et `inventaire-api` (port 3001). Si `SHARED_PROXY_NETWORK` manque, Compose s'arrête avec un message explicite.

Reste à faire par Lucas : ajouter au nginx existant le bloc de [`deploy/nginx/inventaire.conf.example`](deploy/nginx/inventaire.conf.example) (redirection HTTP, `/api/` vers `inventaire-api`, le reste vers `inventaire-web`, certificats certbot de `inventaire.lucaszivan.app`), puis recharger nginx.

### Caddy embarqué (local, VPS vierge)

```bash
COMPOSE_FILE=docker-compose.yml
COMPOSE_PROFILES=proxy
```

Caddy publie 80 et 443, obtient les certificats Let's Encrypt automatiquement et ajoute HSTS, `X-Robots-Tag: noindex` et `Permissions-Policy: camera=(self)`. Ne l'active pas à côté du nginx partagé : les ports ne peuvent être pris qu'une fois.

## Déploiement sur le VPS

Ces étapes sont faites par Lucas, jamais par Claude.

Premier déploiement :

1. Sur le VPS, cloner le dépôt avec une clé de déploiement en lecture seule.
2. Créer `.env` à partir de `.env.example` (mode production ci-dessus, valeurs réelles, jamais committées).
3. Vérifier que l'enregistrement DNS `inventaire.lucaszivan.app` pointe vers l'IP du VPS.
4. Ajouter le bloc nginx et recharger nginx.
5. Lancer `./deploy.sh`.

Mises à jour : `./deploy.sh`. Le script vérifie `.env` et Docker, sauvegarde la base, fait `git pull --ff-only`, reconstruit les images, relance les conteneurs (les migrations s'appliquent au démarrage de l'API), attend les healthchecks puis supprime les images orphelines. Options : `--no-backup`, `--no-cache`. Retour arrière : `git checkout <commit> && ./deploy.sh`.

## Sauvegardes

- Base : `scripts/backup-db.sh` (appelé par `deploy.sh`) écrit un `pg_dump` compressé dans `backups/` et garde les 14 derniers. À planifier aussi avec `cron`.
- Images produits : sauvegarder le volume Docker `images`.
- Copier le résultat hors du serveur.

## Test manuel sur vrais appareils

La CI ne peut pas tester la caméra. Avant chaque version, vérifier à la main :

1. iPhone (Safari) : installation sur l'écran d'accueil via le tutoriel, scan d'un code-barres, ajout d'un produit.
2. Android (Chrome) : fenêtre d'installation, scan, ajout.
3. Ordinateur (Chrome ou Edge) : installation, saisie manuelle du code-barres.
4. Refus de la permission caméra : l'application propose la saisie manuelle.

## Exécution autonome avec Claude Code

Sur une machine vierge dédiée (jamais sur le VPS de production) :

```bash
chmod +x run-loop.sh
tmux new -s build
MODEL=opus ./run-loop.sh      # planification et architecture
MODEL=sonnet ./run-loop.sh    # exécution courante
```

Le script relance Claude Code jusqu'à `ALL DONE` ou `STOP: validation requise` dans `TASKS.md`, et attend quand une limite d'usage est atteinte. Il journalise dans `run-loop.log`.

## Licence

Usage privé familial.