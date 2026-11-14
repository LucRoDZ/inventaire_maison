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
| Front | Next.js (App Router), TypeScript, Tailwind, PWA |
| API | NestJS (REST sous `/api`), TypeScript |
| Base de données | PostgreSQL 16 |
| Proxy | Caddy (HTTPS automatique) |
| Conteneurs | Docker Compose |

## Démarrage local

Prérequis : Node.js LTS, Docker et Docker Compose.

```bash
cp .env.example .env        # puis renseigner les valeurs
docker compose up -d db     # base de données seule
npm install
npm run dev                 # web sur :3000, api sur :3001
```

Ou tout en conteneurs :

```bash
docker compose up --build
```

## Variables d'environnement

Toutes sont décrites dans `.env.example`. Ne versionne jamais `.env`.

| Variable | Rôle |
| --- | --- |
| `DATABASE_URL` | Connexion PostgreSQL |
| `SESSION_SECRET` | Secret de signature des sessions |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Premier compte administrateur, créé au premier démarrage |
| `PUBLIC_URL` | URL publique de l'application |
| `OFF_USER_AGENT` | User-Agent envoyé à Open Food Facts |

## Tests et qualité

```bash
npm run lint
npm run typecheck
npm test            # unitaires API et web
npm run test:e2e    # Playwright
```

La CI GitHub Actions (`.github/workflows/ci.yml`) lance ces vérifications sur chaque Pull Request. La branche `main` n'accepte un merge que si les jobs bloquants sont verts.

## Déploiement sur le VPS

Premier déploiement :

1. Sur le VPS, cloner le dépôt avec une clé de déploiement en lecture seule.
2. Créer `.env` à partir de `.env.example`.
3. Vérifier que l'enregistrement DNS `inventaire.lucaszivan.app` pointe vers l'IP du VPS (`curl -4 ifconfig.me` sur le VPS pour la lire).
4. Lancer `./deploy.sh`.

Mises à jour : se connecter en SSH, puis lancer `./deploy.sh`. Le script récupère le code, reconstruit les images, applique les migrations, relance les conteneurs, vérifie `/api/health` et nettoie les anciennes images.

## Sauvegardes

- Base : `docker compose exec db pg_dump -U <utilisateur> <base> > sauvegarde.sql`
- Images produits : sauvegarder le volume `images`.
- Planifier les deux avec `cron` sur le VPS et copier le résultat hors du serveur.

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