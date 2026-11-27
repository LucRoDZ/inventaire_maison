# CLAUDE.md : Inventaire de garde-manger familial

## Source de vérité
- Le cahier des charges est `docs/cahier-des-charges.md`. En cas de doute, il prime sur ce fichier. Ne l'ouvre jamais en entier : section par section (index ci-dessous).
- L'état d'avancement est dans `TASKS.md` (phase en cours seulement). Tu le lis au début de chaque session et tu le mets à jour avant de t'arrêter. L'archive `docs/archive/` ne se lit que sur demande.
- Respecte le périmètre : pas de lecture de tickets de caisse, rien hors du cahier des charges et de la phase en cours.

## Index des documents (ne pas les ouvrir en entier)
Cherche le titre avec `grep -n "^## \|^### " <fichier>`, puis lis la plage de lignes (`sed -n 'a,bp'`).

| Sujet | Fichier | Section à chercher |
|---|---|---|
| Périmètre, roadmap | `docs/cahier-des-charges.md` | `## Vision et périmètre`, `## Roadmap` |
| Comptes, sessions | `docs/cahier-des-charges.md` | `## Utilisateurs et authentification` |
| Scanner, fiche d'ajout, produit inconnu | `docs/cahier-des-charges.md` | `### 1. Scanner`, `### 2. Fiche d'ajout`, `### 3. Formulaire produit inconnu`, `## Flux de scan` |
| Vues Maison et Liste, fiche produit | `docs/cahier-des-charges.md` | `### 4. Inventaire`, `### 5. Fiche produit` |
| Administration, catégories par défaut | `docs/cahier-des-charges.md` | `### 7. Administration`, `### Catégories et lieux par défaut` |
| PWA, compatibilité | `docs/cahier-des-charges.md` | `## PWA`, `## Compatibilité` |
| Identité visuelle | `docs/cahier-des-charges.md` | `## Identité visuelle` |
| Modèle de données | `docs/cahier-des-charges.md` | `## Modèle de données` |
| Architecture, déploiement, CI | `docs/cahier-des-charges.md` | `## Architecture technique`, `## Conteneurisation`, `## Intégration continue` |
| Sécurité, critères d'acceptation | `docs/cahier-des-charges.md` | `## Sécurité, UX` |
| Portes, meuble ouvert, glisser-déposer | `docs/vue-maison-portes.md` | `### Meuble ouvert`, `### Glisser-déposer`, `### Accessibilité` |
| Sélecteurs e2e à ne pas casser | `docs/vue-maison-portes.md` | `## 7. À ne pas casser` |
| Foyers, RLS, rôles PostgreSQL | `docs/foyers-et-meubles.md` | `## 2. Flux d'une requête`, `## 3. Rôles PostgreSQL` |
| Création de foyer, meubles modulables | `docs/foyers-et-meubles.md` | `## 5. Création d'un foyer`, `## 7. Meubles modulables` |
| Variables d'environnement | `README.md` | `## Variables d'environnement` |
| Tests et qualité | `README.md` | `## Tests et qualité` |
| Déploiement, sauvegardes | `README.md` | `## Déploiement sur le VPS`, `## Sauvegardes` |
| Tests manuels sur appareils | `README.md` | `## Test manuel sur vrais appareils` |
| Phase 3 : vagues, avancement | `docs/phase-3.md` | tableau en tête |
| Phase 5 : contrat, avancement, décisions | `docs/phase-5.md` | tableau en tête |

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
- Design Indigo Ambre : utilise `tokens.css` du dépôt, ne recopie jamais une couleur en dur. Thème clair uniquement (décision Phase 5 : aucun thème sombre). Un seul accent ambre, pas de couleur par catégorie, pas d'emoji.
- Police Carlito. Cartes : rayon 16 px, filet `line` ; ombres par les jetons `shadow-raised` et `shadow-sheet` (Phase 5).

## Méthode de travail
1. Une phase à la fois. Une branche par phase et une Pull Request par phase vers `main`. Ne pousse jamais directement sur `main`.
2. Une tâche = un commit : implémenter, vérifier (ciblé, ci-dessous), commiter, cocher la case dans `TASKS.md` avec le hash court du commit.
3. **Vérification par tâche, ciblée** (Node 24 : `nvm use`) :
   - typecheck du seul espace de travail touché : `npm run typecheck -w @inventaire/api` ou `-w @inventaire/web` (si `packages/shared` change : `npm run build -w @inventaire/shared` d'abord) ; jamais le `npm run typecheck` racine ;
   - tests des seuls fichiers touchés : `npm test -w @inventaire/api -- <fichier.spec.ts>`, ou `npx vitest related <fichiers> --run` dans l'espace de travail ;
   - `npx eslint <fichiers modifiés>`, `node scripts/check-colors.mjs`, `npx prettier --write <fichiers modifiés>` ;
   - au plus un fichier e2e pertinent (`npm test -w @inventaire/e2e -- <fichier> --project=chromium-mobile`).
   La suite complète, tous les e2e, axe et `format:check` ne tournent qu'une fois en fin de phase, et en CI. La CI est la barrière : `gh pr checks`, sans relancer en local ce que la CI refait.
4. Ne contourne jamais un test qui échoue (pas de `skip`, pas de suppression) : corrige la cause.
5. **Pas de compte rendu de session.** `TASKS.md` : une ligne par tâche (case cochée, hash court) et une ligne par décision réelle. Le bilan de fin de phase (30 lignes au plus) va dans la description de la PR.
6. Fin de phase : suite complète, critères d'acceptation validés et non validés dans la PR, `STOP: validation requise` en dernière ligne de `TASKS.md`, arrêt.
7. Décision manquante : choix le plus simple et réversible, une ligne dans « Décisions prises », et on continue. Arrêt seulement si le choix est irréversible ou change le périmètre.

## Lire peu
- `grep` et plages de lignes plutôt que fichiers entiers au-delà de 300 lignes. Jamais le cahier des charges en entier.
- Sorties de commandes bavardes (git, npm, tests, gh) passées par `rtk` ou tronquées (`| tail -20`).
- Une session enchaîne plusieurs tâches sans tout relire.

## Modèles et sous-agents
- Opus planifie, tranche, fusionne et relit. Les tâches mécaniques et bien délimitées vont à l'agent `worker` (`.claude/agents/worker.md`, Sonnet), chacun dans son propre `git worktree`, avec une consigne de 10 à 20 lignes : fichiers à toucher, contrat à respecter, tests ciblés, interdiction de toucher au reste.
- Au plus 3 sous-agents en parallèle. Ils ne touchent ni à `TASKS.md`, ni aux migrations fusionnées, ni aux fichiers « contrat » (types partagés, migration de la phase). Réponse de chacun : 5 lignes (fait, commit, tests lancés, problème).
- Une tâche de moins de 15 lignes de code se fait sans sous-agent.
- Revue indépendante d'un diff : agent `reviewer` (`.claude/agents/reviewer.md`, Opus, lecture seule).

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