# Inventaire de garde-manger familial

Application web installable (PWA) pour suivre le contenu du garde-manger, du frigo, du congélateur et de la cave d'une famille : scan de code-barres, fiche produit automatique via Open Food Facts, rangement par catégorie et vue « Maison » avec meubles et étagères.

Auto-hébergée sur un VPS OVH, en conteneurs Docker, à `https://inventaire.lucaszivan.app`.

## Documentation

- Cahier des charges : [`docs/cahier-des-charges.md`](docs/cahier-des-charges.md)
- Foyers isolés et meubles modulables (conception, rôles, migration, retour arrière) : [`docs/foyers-et-meubles.md`](docs/foyers-et-meubles.md)
- Audit de finition de l'interface : [`docs/audit-finition.md`](docs/audit-finition.md)
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

En local, l'API, `db:migrate` et `household:create` lisent le `.env` de la racine ; une variable déjà définie dans le shell est prioritaire. En production (Docker) et dans les tests, ce fichier n'est jamais lu. Au premier démarrage sur une base vide, l'API crée le foyer « Famille » (meubles et catégories du modèle) et son administrateur (`ADMIN_USERNAME`, `ADMIN_PASSWORD`).

Toute la pile en conteneurs, avec Caddy embarqué :

```bash
APP_DOMAIN=localhost COMPOSE_PROFILES=proxy docker compose up -d --build --wait
curl -sk https://localhost/api/health      # {"status":"ok"}
```

## Variables d'environnement

Toutes sont décrites dans `.env.example`. Ne versionne jamais `.env`. En production (`NODE_ENV=production`, donc dans Docker), l'API refuse de démarrer si `SESSION_SECRET`, `ADMIN_PASSWORD`, `PROXY_SECRET` ou un mot de passe de la base contiennent encore `change-me`. `POSTGRES_PASSWORD` et `APP_DB_PASSWORD` entrent tels quels dans les URL de connexion : utilise des caractères hexadécimaux (`openssl rand -hex 24`), pas de `@`, `/`, `:` ni `#`.

| Variable | Rôle |
| --- | --- |
| `APP_DOMAIN` | Domaine public (`localhost` en local) ; l'origine autorisée de l'API en est dérivée |
| `POSTGRES_PASSWORD` | Mot de passe du propriétaire de la base (`inventaire`, superutilisateur de l'image Postgres) : migrations seulement |
| `APP_DB_PASSWORD` | Mot de passe du rôle d'exécution `inventaire_app` (sans superutilisateur ni `BYPASSRLS`, soumis à la sécurité par ligne). L'API crée ce rôle et lui pose ce mot de passe à chaque démarrage. `./deploy.sh` l'ajoute à `.env` s'il manque |
| `DATABASE_URL` | Connexion d'exécution (`inventaire_app`) pour `npm run dev` ; Compose construit la sienne |
| `DATABASE_MIGRATION_URL` | Connexion du propriétaire (migrations, création du rôle d'exécution) pour `npm run dev` ; Compose construit la sienne |
| `SESSION_SECRET` | Clé HMAC des sessions (32 caractères au moins) : la base ne stocke que `HMAC-SHA256(SESSION_SECRET, jeton)`. Changer ce secret déconnecte tout le monde (révocation d'urgence) |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Premier compte administrateur, créé quand la table `users` est vide, dans le foyer « Famille ». Pseudo : 3 à 30 caractères parmi `a-z`, `0-9`, `_`, `.`, `-` (mis en minuscules) ; mot de passe : 8 à 128 caractères |
| `PROXY_SECRET` | Secret partagé avec le reverse proxy (16 caractères au moins, `openssl rand -hex 32`). Le proxy l'envoie dans `X-Proxy-Secret` ; sans lui, l'API ignore `X-Forwarded-For` et ne retient que l'adresse du pair direct. Empêche un autre conteneur du réseau partagé de falsifier son adresse pour contourner les limites de débit. Obligatoire dans Compose |
| `OFF_USER_AGENT` | User-Agent envoyé à Open Food Facts |
| `COMPOSE_FILE` | Fichiers Compose utilisés (voir les deux modes de proxy) |
| `COMPOSE_PROFILES` | `proxy` active Caddy embarqué ; vide derrière le nginx partagé |
| `SHARED_PROXY_NETWORK` | Réseau Docker externe du nginx partagé (mode production uniquement) |
| `RATE_LIMIT_PER_MINUTE` | Facultative : limite globale de requêtes par minute et par IP (300 par défaut ; `/api/health` n'est jamais limité) |

## Foyers, comptes et rôles

Chaque compte appartient à un **foyer** (une famille) ; les comptes d'un même foyer partagent tout l'inventaire, deux foyers ne voient jamais rien l'un de l'autre. Le foyer n'apparaît jamais aux membres : seul l'administrateur le voit, dans **Plus > Administration** (écrans Foyers, Comptes, Catégories et Correspondances). L'administrateur gère foyers et comptes mais ne lit jamais l'inventaire d'un autre foyer que le sien.

- **Créer un foyer** : Administration > Foyers, ou en créant un compte avec « Nouveau foyer ». Le foyer reçoit une copie du modèle : quatre meubles (Garde-manger, Frigo, Congélateur, Cave), les catégories et les correspondances Open Food Facts.
- **Supprimer un foyer** : seulement s'il n'a plus de compte (déplacez-les d'abord) ; il faut retaper son nom. Ses meubles, produits, stock, catégories, historique et photos sont effacés : seule une sauvegarde permet de revenir en arrière.
- **Changer un compte de foyer** : Administration > Comptes > « Changer de foyer ». Le compte voit alors l'autre inventaire, ses sessions sont coupées ; l'historique garde son pseudo.
- **Meubles** : chaque compte ajoute, renomme, réordonne et supprime les meubles de son foyer (12 au plus, 8 étagères ou tiroirs par meuble), depuis l'accueil (tuile « Ajouter un meuble ») ou Plus > Meubles et étagères.
- **Amorcer une instance vide** sans passer par le premier admin du `.env` :

  ```bash
  npm run household:create -- --name "Famille Martin" --admin "martin"          # en local
  docker compose exec api node dist/households/cli.js --name "Famille Martin" --admin "martin"   # sur le VPS
  ```

  Le mot de passe est demandé sans écho ; laissé vide (ou sans terminal), il est généré et affiché une seule fois.

**Défense en profondeur.** Chaque requête est liée au foyer du compte (contexte posé par la garde de session) ; tous les accès aux données passent par `TenantDb`, qui ouvre une transaction avec `set_config('app.household_id', …, true)` et filtre explicitement par foyer. Sous ce filtre, la sécurité par ligne de PostgreSQL (`ENABLE` et `FORCE ROW LEVEL SECURITY`) refuse toute ligne d'un autre foyer, et toute ligne quand aucun foyer n'est posé. L'application tourne sous le rôle `inventaire_app` (`DATABASE_URL`), sans superutilisateur ni `BYPASSRLS`, avec des droits minimum par table (le journal en lecture et insertion seulement) ; les migrations tournent sous le propriétaire (`DATABASE_MIGRATION_URL`). L'API refuse de démarrer si le rôle d'exécution peut contourner la sécurité par ligne. Les photos sont rangées par foyer et servies après vérification ; le service worker ne met aucune réponse de l'API en cache. Détails : [`docs/foyers-et-meubles.md`](docs/foyers-et-meubles.md).

## Tests et qualité

```bash
npm run lint
npm run format:check
npm run typecheck
npm test            # API puis web ; l'API exige un PostgreSQL joignable par
                    # DATABASE_MIGRATION_URL, un superutilisateur (défaut :
                    # postgres://test:test@localhost:5432/inventaire_test, comme en CI) ; les tests
                    # tournent sous le rôle d'exécution de DATABASE_URL, créé au démarrage
npm run test:e2e    # Playwright : Chromium (Pixel 7) et WebKit (iPhone 14)
shellcheck deploy.sh scripts/*.sh
scripts/test-backup-db.sh        # pile Compose démarrée (`docker compose up -d --wait`)
scripts/test-backup-restore.sh   # idem : sauvegarde, restauration, comparaison des tables
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

Sur ce VPS, tout se trouve ici :

| Élément | Valeur |
| --- | --- |
| Dépôt de l'application | `/opt/inventaire` |
| Conteneur nginx | `easyq-nginx-1`, configuration dans `/opt/proxy/conf.d/` (un fichier `.conf` par site) |
| Réseau Docker partagé | `easyq_default` (alias `inventaire-web`, `inventaire-api`) |
| Certificats Let's Encrypt | volume Docker `easyq_certbot_certs` |
| Dossier des défis ACME | volume Docker `easyq_certbot_www` |

Reste à faire par Lucas : copier [`deploy/nginx/inventaire.conf.example`](deploy/nginx/inventaire.conf.example) dans `/opt/proxy/conf.d/inventaire.conf` (redirection HTTP, `/api/` vers `inventaire-api`, le reste vers `inventaire-web`, certificat de `inventaire.lucaszivan.app`), y remplacer `REMPLACER_PAR_PROXY_SECRET` par la valeur de `PROXY_SECRET`, puis recharger nginx.

### Caddy embarqué (local, VPS vierge)

```bash
COMPOSE_FILE=docker-compose.yml
COMPOSE_PROFILES=proxy
```

Caddy publie 80 et 443, obtient les certificats Let's Encrypt automatiquement et ajoute HSTS, `X-Robots-Tag: noindex` et `Permissions-Policy: camera=(self)`. Ne l'active pas à côté du nginx partagé : les ports ne peuvent être pris qu'une fois.

## Déploiement sur le VPS

Ces étapes sont faites par Lucas sur le VPS, jamais par Claude.

### Premier déploiement, derrière le nginx partagé

1. Cloner le dépôt dans `/opt/inventaire` avec une clé de déploiement en lecture seule, puis créer `.env` :

   ```bash
   sudo mkdir -p /opt/inventaire && sudo chown "$USER" /opt/inventaire
   git clone <url-du-dépôt> /opt/inventaire && cd /opt/inventaire
   cp .env.example .env && chmod 600 .env
   ```

   Renseigner dans `.env` les valeurs réelles (jamais commitées, aucune ne doit contenir `change-me`) : `POSTGRES_PASSWORD` (`openssl rand -hex 24`), `SESSION_SECRET` et `PROXY_SECRET` (`openssl rand -hex 32` chacun), `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `OFF_USER_AGENT`, `APP_DOMAIN=inventaire.lucaszivan.app`, et le mode proxy :

   ```bash
   COMPOSE_FILE=docker-compose.yml:docker-compose.shared-proxy.yml
   COMPOSE_PROFILES=
   SHARED_PROXY_NETWORK=easyq_default
   ```

2. Vérifier que l'enregistrement DNS `inventaire.lucaszivan.app` pointe vers l'IP du VPS :

   ```bash
   dig +short inventaire.lucaszivan.app
   ```

3. Relever où `easyq-nginx-1` monte les deux volumes de certbot (le bloc d'exemple suppose `/etc/letsencrypt` pour les certificats et `/var/www/certbot` pour les défis ; adapter `root`, `ssl_certificate` et `ssl_certificate_key` si le résultat diffère) :

   ```bash
   docker inspect easyq-nginx-1 --format '{{range .Mounts}}{{.Name}} -> {{.Destination}}{{"\n"}}{{end}}'
   ```

4. Ajouter d'abord le seul bloc du port 80 (le premier `server` de l'exemple) dans `/opt/proxy/conf.d/inventaire.conf`, tester et recharger nginx, pour qu'il serve les défis ACME :

   ```bash
   docker exec easyq-nginx-1 nginx -t
   docker exec easyq-nginx-1 nginx -s reload
   ```

5. Obtenir le certificat avec certbot en conteneur, sur les deux volumes d'easyq (pas de certbot installé sur l'hôte) :

   ```bash
   docker run --rm \
     -v easyq_certbot_certs:/etc/letsencrypt \
     -v easyq_certbot_www:/var/www/certbot \
     certbot/certbot certonly --webroot -w /var/www/certbot \
     -d inventaire.lucaszivan.app
   ```

6. Compléter `/opt/proxy/conf.d/inventaire.conf` avec le contenu entier de [`deploy/nginx/inventaire.conf.example`](deploy/nginx/inventaire.conf.example) (bloc du port 443 compris, avec la valeur de `PROXY_SECRET`), puis tester et recharger :

   ```bash
   docker exec easyq-nginx-1 nginx -t
   docker exec easyq-nginx-1 nginx -s reload
   ```

   Si `nginx -t` échoue, ne rien recharger : l'ancienne configuration reste en service.

7. Lancer le déploiement depuis `/opt/inventaire` (le premier n'a pas de base à sauvegarder : l'étape est sautée) :

   ```bash
   cd /opt/inventaire && ./deploy.sh
   ```

8. Vérifier :

   ```bash
   curl -s https://inventaire.lucaszivan.app/api/health      # {"status":"ok"}
   ```

   Puis ouvrir l'application et se connecter avec `ADMIN_USERNAME` et `ADMIN_PASSWORD`.

### Mises à jour

`./deploy.sh`. Le script vérifie `.env` et Docker, sauvegarde la base, fait `git pull --ff-only`, reconstruit les images, relance les conteneurs (les migrations s'appliquent au démarrage de l'API), attend les healthchecks puis supprime les images orphelines. Options : `--no-backup`, `--no-cache`. Retour arrière : `git checkout <commit> && ./deploy.sh`.

Après un déploiement, les téléphones passent à la nouvelle version **sans rien demander** : le service worker prend la main tout seul, et une page déjà ouverte change de version à la navigation suivante (jamais pendant un scan, une saisie, un glisser-déposer ou avec un panneau ouvert), ou au prochain lancement. Aucun message « Nouvelle version disponible ».

### Mise à jour vers les foyers (une seule fois)

Cette version ajoute la migration `0003` (foyers, sécurité par ligne) et le rôle `inventaire_app`. Elle s'applique d'elle-même au démarrage de l'API, mais **une sauvegarde est obligatoire avant** : il n'existe pas de migration descendante.

```bash
/opt/scripts/backup-inventaire.sh          # sauvegarde obligatoire (base et images)
cd /opt/inventaire && git pull --ff-only   # récupère le nouveau deploy.sh
./deploy.sh                                # génère APP_DB_PASSWORD dans .env s'il manque, puis déploie
```

Au démarrage, l'API rattache tout l'existant au foyer « Famille » (comptes, meubles, produits, stock, historique), crée le rôle `inventaire_app`, déplace les photos dans `h<foyer>/` et vérifie que le rôle d'exécution ne contourne pas la sécurité par ligne. Vérifier ensuite `curl -s https://inventaire.lucaszivan.app/api/health`, puis se connecter : l'inventaire est inchangé.

**Retour arrière** (seulement en cas de problème) : l'ancien code ne fonctionne pas sur le nouveau schéma, il faut restaurer la sauvegarde prise juste avant.

```bash
cd /opt/inventaire
git checkout <commit précédent>            # le dernier commit avant la fusion de la PR
./deploy.sh --no-backup                    # reconstruit l'ancienne version
docker compose stop api
scripts/restore-db.sh --force backups/inventaire-<date d'avant>.sql.gz
docker compose start api
docker compose exec -T api tar -xzf - -C /data/images < backups/images-<date d'avant>.tar.gz   # si les photos ont bougé
```

Le rôle `inventaire_app` laissé par la nouvelle version n'a aucun droit sur l'ancien schéma restauré ; on peut le supprimer (`docker compose exec db psql -U inventaire -c 'DROP ROLE inventaire_app'`).

### Renouvellement du certificat

Les certificats vivent dans le volume `easyq_certbot_certs`, comme ceux d'easyq. Si le VPS renouvelle déjà ce volume (cron ou minuteur d'easyq), il suffit que nginx relise les certificats après chaque renouvellement. Sinon, renouveler à la main ou par cron :

```bash
docker run --rm -v easyq_certbot_certs:/etc/letsencrypt -v easyq_certbot_www:/var/www/certbot \
  certbot/certbot renew --dry-run                                  # essai à blanc
docker run --rm -v easyq_certbot_certs:/etc/letsencrypt -v easyq_certbot_www:/var/www/certbot \
  certbot/certbot renew                                            # renouvellement réel
docker exec easyq-nginx-1 nginx -s reload                          # à lancer après chaque renouvellement
```

### Dépannage

- **502 Bad Gateway** : les conteneurs ne sont pas (encore) sur le réseau `easyq_default`. Vérifier :

  ```bash
  docker compose ps
  docker network inspect easyq_default --format '{{range .Containers}}{{.Name}} {{end}}'
  ```

  `inventaire-web-1` et `inventaire-api-1` (préfixe : nom du dossier du projet Compose, ici `inventaire`) doivent y figurer ; sinon contrôler `COMPOSE_FILE` et `SHARED_PROXY_NETWORK` dans `.env`, puis relancer `./deploy.sh`. nginx résout les noms `inventaire-web` et `inventaire-api` à chaque requête : aucun rechargement n'est nécessaire une fois les conteneurs démarrés.
- **L'API ne se connecte pas à la base (`password authentication failed`) alors que le mot de passe est bon** : le nom visé désigne la base d'une autre application du réseau partagé. L'API doit joindre `inventaire-db` (alias propre à ce projet, voir `docker-compose.yml`), jamais `db`.
- **`/api/health` répond 503** : la base ne répond pas. `docker compose logs db api --tail=50`.
- **Pas de connexion possible après changement de `SESSION_SECRET`** : normal, toutes les sessions sont révoquées ; se reconnecter.
- **Connexions refusées en 429 pour tout le monde** : nginx n'envoie pas (ou pas la bonne) valeur de `X-Proxy-Secret` : l'API ignore alors `X-Forwarded-For` et voit toutes les requêtes venir de nginx. Comparer `proxy_set_header X-Proxy-Secret` dans `/opt/proxy/conf.d/inventaire.conf` avec `PROXY_SECRET` dans `/opt/inventaire/.env`.
- **L'API refuse de démarrer** : le message nomme la variable d'environnement manquante ou invalide (sans afficher sa valeur).

### Variante : Caddy embarqué sur un VPS vierge

Sans nginx partagé, Caddy obtient lui-même les certificats. Dans `.env` : `COMPOSE_FILE=docker-compose.yml`, `COMPOSE_PROFILES=proxy`, `APP_DOMAIN=<le domaine>` (DNS déjà pointé, ports 80 et 443 libres), puis `./deploy.sh` et `curl -s https://<le domaine>/api/health`.

## Sauvegardes

- Base : `scripts/backup-db.sh` (appelé par `deploy.sh`) écrit un `pg_dump` compressé `inventaire-<date>.sql.gz` dans `backups/` et garde les 14 derniers. Le dump ne contient pas les droits (`--no-privileges`) : l'API réaccorde ceux du rôle `inventaire_app` à chaque démarrage.
- Images produits : `scripts/backup-images.sh` archive le volume `images` en `images-<date>.tar.gz` dans `backups/` (14 conservées), en lisant le volume par le conteneur `api`.
- Les archives sont créées en `600` (dossier en `700`) : elles contiennent les hachages des mots de passe. `BACKUP_DIR` et `BACKUP_KEEP` changent le dossier et le nombre conservé.

### Planification (cron)

Sur le VPS, `crontab -e` (adapter le chemin du dépôt) : sauvegarde de la base et des images chaque nuit à 3 h, puis reconstruction complète des images (`--no-cache`, pour récupérer les correctifs de sécurité des images de base) le premier dimanche du mois à 4 h (le test `date` sélectionne le dimanche des jours 1 à 7 : en cron, jour du mois et jour de la semaine ensemble signifient « l'un ou l'autre »).

```cron
0 3 * * * cd /opt/inventaire && (scripts/backup-db.sh && scripts/backup-images.sh) >> backups/cron.log 2>&1
0 4 * * 0 [ "$(date +\%d)" -le 7 ] && cd /opt/inventaire && ./deploy.sh --no-cache >> backups/cron.log 2>&1
```

### Copie hors du serveur

Une sauvegarde qui reste sur le VPS ne protège pas d'une panne du VPS. Depuis ton poste (adapter l'utilisateur et l'hôte) :

```bash
rsync -av --chmod=F600,D700 <utilisateur>@<vps>:/opt/inventaire/backups/ ~/sauvegardes-inventaire/
```

### Restauration

```bash
docker compose stop api                                   # plus d'écriture pendant la restauration
scripts/restore-db.sh --force backups/inventaire-<date>.sql.gz
docker compose start api
```

Sans `--force`, le script refuse une base qui contient déjà des données. Les images se restaurent dans le volume par le conteneur `api` :

```bash
docker compose exec -T api tar -xzf - -C /data/images < backups/images-<date>.tar.gz
```

La preuve que sauvegarde et restauration fonctionnent est rejouée par `scripts/test-backup-restore.sh` (pile démarrée) : sauvegarde, restauration dans une base vide, comparaison du nombre de lignes de chaque table, droits `600` des archives.

### Base créée avec l'ancienne image `postgres:16` (Debian)

L'image est désormais `postgres:16-alpine`. Un volume `pgdata` créé par l'image Debian démarre, mais PostgreSQL signale « database has no actual collation version » : les index sur du texte ont été triés avec la locale glibc et doivent être reconstruits. Un VPS dont la base est créée directement avec l'image Alpine n'est pas concerné. Sinon, sauvegarder puis restaurer dans un volume neuf :

```bash
scripts/backup-db.sh                       # archive dans backups/
docker compose down
docker volume rm <projet>_pgdata           # nom affiché par `docker volume ls`
docker compose up -d db --wait
zcat backups/inventaire-<date>.sql.gz | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U inventaire -d inventaire
docker compose up -d --wait
```

## Test manuel sur vrais appareils

La CI ne peut pas tester la caméra. Recette du cahier des charges, à cocher avant la mise en service (chaque ligne à faire par Lucas) :

1. Un iPhone récent : installation sur l'écran d'accueil via le tutoriel, plein écran, scan, refus puis autorisation de la caméra.
2. Un téléphone Android : installation par la fenêtre native, plein écran, scan, lampe torche.
3. Un ordinateur : utilisation dans le navigateur, installation (Chrome ou Edge), webcam, lecteur USB si disponible.
4. Sur chaque appareil, trois codes scannés (EAN-13, EAN-8, UPC-A), dont un en lumière faible.
5. Sur chaque appareil, un ajout hors connexion refusé avec le message « Pas de connexion ».
6. Chaque solution de repli testée une fois : saisie manuelle, photo du code, recherche par nom.

### Mise à jour silencieuse

Après un déploiement, sur un téléphone où l'application est déjà ouverte :

1. Aucun message ni bouton n'annonce la nouvelle version.
2. Pendant un scan (caméra allumée) ou une saisie en cours, la page ne se recharge pas.
3. Toucher un onglet de la barre du bas : l'écran suivant s'ouvre dans la nouvelle version (un bref rechargement est normal).
4. Mettre l'application en arrière-plan puis la rouvrir : elle vérifie seule s'il existe une nouvelle version.

### Écran Scanner (caméra)

Sur `http://localhost:3000` (Chrome, `localhost` compte comme contexte sécurisé) puis sur l'adresse HTTPS réelle :

1. Ouvrir l'onglet Scanner, toucher « Scanner » : la caméra arrière s'allume, un cadre ambre apparaît (le voyant de la caméra est allumé).
2. Passer à un autre onglet du navigateur : le voyant s'éteint. Revenir : le bouton « Scanner » est de nouveau proposé.
3. Changer d'onglet de l'application (Inventaire) : le voyant s'éteint aussi.
4. Si l'appareil a une lampe, « Allumer la lampe » l'allume ; sinon le bouton est absent. S'il y a plusieurs caméras, le sélecteur « Caméra » en change.
5. Mode Retirer / Ajouter : la bascule en haut garde son choix.
6. Refuser la permission (réglages du site) : le message donne les étapes de la plateforme et « Saisir le code à la main » met le focus sur la saisie.
7. Ouvrir l'application en `http://` sur le réseau local (hors `localhost`) : message « HTTPS requis ».

### Vue Maison (portes et lumière)

Les tests automatiques mesurent la géométrie et la cadence des images dans des navigateurs sans écran ; le rendu réel d'un téléphone, surtout Safari sur iPhone, se vérifie à la main :

1. Onglet Inventaire, vue Maison : les quatre meubles sont fermés. Un appui sur une carte fait pencher la porte et allume un halo ambre, puis le meuble s'ouvre sans attente.
2. Dans chaque meuble : la ou les portes pivotent en un peu plus d'une demi-seconde, sans saccade, puis restent en fine lamelle sur le côté sans recouvrir les étagères ; une fine barre de lumière ambre s'allume en haut (pas au congélateur). Le cadre du meuble s'arrête sous sa dernière étagère, toutes les étagères ont la même hauteur. Au congélateur, les tiroirs glissent l'un après l'autre, leur poignée ne touche aucun texte et leur contenu reste visible.
3. Téléphone en portrait : le meuble entier (barre du haut, étagères, « Non rangé ») tient entre le haut de l'écran et la barre du bas, la page ne défile pas, y compris dans Safari quand la barre d'adresse se replie. Faire défiler une étagère pleine de gauche à droite : pas de saccade, les piles de vignettes ne sont pas rognées. Tourner le téléphone en paysage : la page défile de nouveau.
4. Appui long sur une vignette puis glisser : l'étagère survolée s'entoure d'ambre ; déposer déplace le produit.
5. Taper un nom dans la recherche de la vue Maison : seuls les meubles qui contiennent un résultat s'entourent d'ambre, porte entrouverte.
   Dans un meuble ouvert, le bouton Filtres (en haut à droite) ouvre le panneau de recherche par le bas ; un filtre actif met un point ambre sur le bouton et une ligne « Filtré : … » sous la barre, les étagères se resserrent sans faire défiler la page.
6. Réglages du téléphone, « Réduire les animations » activé : le meuble apparaît directement ouvert et allumé.

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

## Crédits

La passe de finition de l'interface (`docs/audit-finition.md`) s'appuie sur le skill [`unslop`](https://github.com/heydamir/unslop) de Damir Sokolovsky, sous licence [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
