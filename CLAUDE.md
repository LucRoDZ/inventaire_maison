# CLAUDE.md : Inventaire de garde-manger familial

## Source de vérité
- Le cahier des charges est `docs/cahier-des-charges.md`. En cas de doute, il prime sur ce fichier.
- L'état d'avancement est dans `TASKS.md`. Tu le lis au début de chaque session et tu le mets à jour avant de t'arrêter.
- Respecte le périmètre : pas de lecture de tickets de caisse en V1, rien hors du cahier des charges.

## Stack (imposée)
- Front : Next.js (App Router), TypeScript, Tailwind, PWA.
- API : NestJS REST sous `/api`, TypeScript.
- Base : PostgreSQL 16 (pg_trgm), ORM Prisma ou Drizzle (choisis-en un en Phase 0 et note le choix dans le README).
- Reverse proxy : Caddy. Conteneurs : Docker Compose.
- Images : sharp (miniatures WebP 400 px). Mots de passe : argon2.
- Scan : `BarcodeDetector` avec repli `zxing-wasm` ou `@zxing/browser`.
- Glisser-déposer : `@dnd-kit`. Icônes : Lucide.

## Langue et style
- Interface 100 % en français. Code, commits et noms de variables en anglais.
- Design Indigo Ambre : utilise `tokens.css` du dépôt, ne recopie jamais une couleur en dur. Thème clair uniquement en V1. Un seul accent ambre, pas de couleur par catégorie, pas d'emoji.
- Police Carlito. Cartes : rayon 16 px, ombre `0 4px 8px rgba(0,0,0,.12)`.

## Méthode de travail
1. Une phase à la fois, dans l'ordre : Phase 0, Phase 1, Phase 2. Ne commence pas une phase tant que la précédente n'est pas validée.
2. Une branche par phase (`phase-0-socle`, `phase-1-v1`, ...) et une Pull Request par phase vers `main`. Ne pousse jamais directement sur `main`.
3. Une tâche = une unité commit : implémenter, tester, commiter, cocher la case dans `TASKS.md`.
4. Tests obligatoires : une tâche n'est cochée que si lint, typecheck et tests passent en local. Ne contourne jamais un test qui échoue (pas de `skip`, pas de suppression) : corrige la cause.
5. À la fin d'une phase : lance toute la suite de tests, liste les critères d'acceptation validés et non validés dans la PR, écris `STOP: validation requise` dans `TASKS.md` puis arrête-toi.
6. Si une décision manque dans le cahier des charges : prends le choix le plus simple et réversible, note-le dans la section « Décisions prises » de `TASKS.md` et continue. Ne t'arrête pas pour une question mineure. Arrête-toi seulement si le choix est irréversible ou change le périmètre.

## CI
- La CI GitHub Actions (`.github/workflows/ci.yml`) est créée en Phase 0, avant toute fonctionnalité.
- Elle doit rester verte : après chaque `git push`, vérifie le résultat avec `gh pr checks` et corrige avant de continuer.
- Aucun secret dans la CI : base jetable et variables de test.

## Sécurité
- Aucun secret dans le dépôt. `.env` est ignoré par git, `.env.example` est versionné.
- Ne touche jamais au VPS de production. Le déploiement est le `deploy.sh` lancé par Lucas.
- Toute route de l'API exige une session valide, sauf `/auth/login` et `/health`.
- Limitation de débit sur la connexion. Appels Open Food Facts côté serveur uniquement, avec User-Agent et délai d'expiration de 4 s.

## Livrables attendus à la racine
- `docker-compose.yml`, `Caddyfile`, `deploy.sh`, `.env.example`, `README.md`, `tokens.css`.
- `docs/cahier-des-charges.md`, `TASKS.md`, `run-loop.sh`.

## Limites de l'exécution autonome
- Tu travailles sur une machine dédiée sans accès au VPS. Ne cherche pas à t'y connecter.
- Les appels réseau vers Open Food Facts sont simulés dans les tests (fixtures).
- Le scan caméra ne peut pas être testé automatiquement : fournis le test manuel dans le README.