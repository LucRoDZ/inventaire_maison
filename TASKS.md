# TASKS.md : suivi d'avancement

> Règles (détail dans `CLAUDE.md`, « Méthode de travail ») : une tâche = un commit ; vérification ciblée (typecheck de l'espace de travail touché, tests des fichiers touchés, eslint et prettier sur les fichiers modifiés, au plus un e2e) ; suite complète seulement en fin de phase et en CI (`gh pr checks` après chaque push).
> Coche une tâche avec le hash court de son commit, sans compte rendu. Une ligne par décision réelle.
> Tâche bloquée : commande et erreur dans « Problèmes bloquants » ; si une tâche suivante en dépend, écris le marqueur d'arrêt et arrête-toi.
> Phase terminée : écris seul sur la dernière ligne de ce fichier `STOP: validation requise` et arrête-toi. Tout est terminé : `ALL DONE` seul sur la dernière ligne. Ces deux marqueurs ne commencent jamais une autre ligne.
> Phases terminées et ancienne Phase 2 (reprise dans la Phase 3) : `docs/archive/TASKS-phases-0-1.md`, à ne pas lire sauf demande.

## Phase 3 : Confort et refonte (branche `phase-3-confort-refonte`)

> Plan, vagues et tableau d'avancement : `docs/phase-3.md`.

### Étape 0 : processus
- [x] **0.1 Archive** : phases terminées vers `docs/archive/`. Fin : `TASKS.md` sous 150 lignes (20b0f92).
- [x] **0.2 Règles** : vérification ciblée, index des documents, sous-agents. Fin : `CLAUDE.md`, en-tête, `run-loop.sh` (8e16dc4).
- [x] **0.3 Agents** : `.claude/agents/worker.md`, `reviewer.md`. Fin : fichiers versionnés.
- [x] **0.4 CI** : cache Playwright, pas d'annulation sur `main`. Fin : CI verte.
- [x] **0.5 Mesures** dans la PR. Fin : avant et après dans la description.

### Contrat
- [ ] **K.1 Migration unique** : `settings`, `shopping_items`, `push_subscriptions`, colonnes `categories`, `products`, `stock_movements`, RLS. Fin : `rls.spec.ts` vert.
- [ ] **K.2 Types partagés** : DTO, unités, raisons, filtres d'échéance, signature de l'analyseur. Fin : build de `shared`.
- [ ] **K.3 Navigation** : barre `Scanner · Inventaire · Courses · Plus`, `/courses` vide, redirections. Fin : e2e navigation.
- [ ] **K.4 Plan** : `docs/phase-3.md`. Fin : vagues et tableau.

### A. Péremption et gaspillage
- [ ] **A1 Seuil d'alerte par foyer** (3 j), réglé dans la console. Fin : seuil à 5, J-5 devient « bientôt ».
- [ ] **A2 Quatre compteurs** en tête de zone, filtres d'échéance dans l'URL. Fin : e2e « Bientôt » filtre.
- [ ] **A3 Pastille d'urgence** par ligne et tri par date limite. Fin : test de composant.
- [ ] **A4 Consommé / Jeté** : raisons `consumed`, `wasted`, partout où l'on retire. Fin : journal affiche la raison.
- [ ] **A5 Statistiques** 30 jours (Plus). Fin : tests API et e2e.
- [ ] **A6 Durée suggérée par catégorie** : `shelf_life_days`, date « Suggérée ». Fin : e2e fiche.
- [ ] **A7 Notifications push** : abonnement, résumé 8 h, clic vers la liste filtrée. Fin : tests horloge et envoi simulés.

### B. Courses
- [ ] **B1 Onglet Courses** : liste, cocher, quantité, vider. Fin : e2e.
- [ ] **B2 Saisie rapide** : analyseur déterministe dans `shared`. Fin : ~30 cas unitaires.
- [ ] **B3 Récemment consommés** : 12 puces. Fin : tests API.
- [ ] **B4 Seuil minimum** et ajout ou retrait automatique. Fin : tests d'intégration.
- [ ] **B5 Ranger les achats** cochés. Fin : e2e.

### C. Ajout et fiche article
- [ ] **C1 Fiche article unique** avec montant et unité. Fin : e2e.
- [ ] **C2 Scanner, point d'entrée unique**. Fin : e2e.
- [ ] **C3 Scan en rafale**. Fin : e2e avec Annuler.
- [ ] **C4 Rattacher un code-barres** à un produit existant. Fin : tests API et e2e.
- [ ] **C5 Édition en lot** en vue Liste. Fin : e2e.
- [ ] **C6 Fusion de doublons**. Fin : tests d'intégration, journal intact.

### D. Inventaire
- [ ] **D1 Vue Liste triée par date limite** par défaut, compteurs à la place de « Ma maison ». Fin : e2e.

### Clôture
- [ ] **Z1 Suite complète et e2e** (deux navigateurs, deux tailles). Fin : vert.
- [ ] **Z2 Revue `reviewer`** (isolation, accessibilité, identité). Fin : corrections faites.
- [ ] **Z3 Finition unslop** des nouveaux écrans. Fin : audit noté.
- [ ] **Z4 README, PR, CI verte, fusion**. Fin : squash.

## Décisions prises

> Une ligne par décision. Décisions des phases archivées : chercher l'identifiant avec `grep -n "<ID>\." docs/archive/TASKS-phases-0-1.md`. Celles qui structurent encore le code :

- ORM : Drizzle ; tests API Vitest + SWC ; service worker Serwist ; repli de scan `zxing-wasm` ; Node 24.
- T1 : en production, nginx en conteneur du VPS (réseau `easyq_default`), Caddy du compose seulement par profil `proxy` (local, CI).
- C2 : migrations appliquées par l'API au démarrage, pas par `deploy.sh`.
- C3 : `/health` public, renvoie seulement `{"status":"ok"}`.
- C7 renversée : meubles créés et supprimés par tous les comptes du foyer.
- F.A1 : deux rôles PostgreSQL, migrateur propriétaire et `inventaire_app` sous RLS (`APP_DB_PASSWORD`).
- F.A2 : toute route admin répond 404 à un membre.
- F.A3 : catégories et correspondances écrites seulement par la console `/admin/households/:id/...` ; `GET /categories` reste.
- F.A4 : le modèle copié à la création d'un foyer est celui du seed (`database/seed/*.ts`).
- F.A5 : service worker en réseau seul pour toute l'API.
- F.A10 : journal sans clé étrangère sur le lieu, instantané `location_name` et `shelf_name`.
- F.A12 : contexte de foyer ouvert par middleware ; sans foyer, `TenantDb` refuse ; une tâche de fond ouvre sa propre transaction de foyer.
- F.B1 : étagères modifiables par les membres, dans leur foyer.
- I1 : bandeau « Ma maison » supprimé ; un seul en-tête (titre, Filtres, bascule, recherche).
- I3 : état des filtres dans l'URL (`q`, `cat`, `meuble`, `tri`, `vue=liste`) via `useHomeFilters`.
- I6 : la page ne défile jamais ; écran = `Screen` + `ScrollZone`.
- U1 : un seul bouton principal indigo ; l'ambre marque seulement l'état actif, les pastilles et les dates proches.
- U2 : barre du bas dans le flux (dernière ligne de la colonne du `body`), pas `fixed`.

## Problèmes bloquants
<!-- Claude : note ici ce qui t'empêche d'avancer, avec la commande et l'erreur exacte. -->

- (note) Node 24 obligatoire (`nvm use`) : sous Node 20, `argon2` plante dans les tests API. Le conteneur local `inv-test-pg` occupe `127.0.0.1:5432`.
