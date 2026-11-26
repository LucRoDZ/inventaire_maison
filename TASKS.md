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
- [x] **K.1 Migration unique** : `settings`, `shopping_items`, `push_subscriptions`, colonnes `categories`, `products`, `stock_movements`, RLS. Fin : `rls.spec.ts` vert.
- [x] **K.2 Types partagés** : DTO, unités, raisons, filtres d'échéance, signature de l'analyseur. Fin : build de `shared`.
- [x] **K.3 Navigation** : barre `Scanner · Inventaire · Courses · Plus`, `/courses` vide, redirections. Fin : e2e navigation.
- [x] **K.4 Plan** : `docs/phase-3.md`. Fin : vagues et tableau.

### A. Péremption et gaspillage
- [x] **A1 Seuil d'alerte par foyer** (3 j), réglé dans la console. Fin : seuil à 5, J-5 devient « bientôt » (8a675df).
- [x] **A2 Quatre compteurs** en tête de zone, filtres d'échéance dans l'URL. Fin : e2e « Bientôt » filtre (b1fbb34).
- [x] **A3 Pastille d'urgence** par ligne et tri par date limite. Fin : test de composant (b1fbb34).
- [x] **A4 Consommé / Jeté** : raisons `consumed`, `wasted`, partout où l'on retire. Fin : journal affiche la raison (3d03a30).
- [x] **A5 Statistiques** 30 jours (Plus). Fin : tests API et e2e (c076b89).
- [x] **A6 Durée suggérée par catégorie** : `shelf_life_days`, date « Suggérée ». Fin : e2e fiche (2570359).
- [x] **A7 Notifications push** : abonnement, résumé 8 h, clic vers la liste filtrée. Fin : tests horloge et envoi simulés (cca39e2).

### B. Courses
- [x] **B1 Onglet Courses** : liste, cocher, quantité, vider. Fin : e2e (fd1138e).
- [x] **B2 Saisie rapide** : analyseur déterministe dans `shared`. Fin : ~30 cas unitaires (43c400c).
- [x] **B3 Récemment consommés** : 12 puces. Fin : tests API (0567801).
- [x] **B4 Seuil minimum** et ajout ou retrait automatique. Fin : tests d'intégration (06c7115).
- [x] **B5 Ranger les achats** cochés. Fin : e2e (fd1138e).

### C. Ajout et fiche article
- [x] **C1 Fiche article unique** avec montant et unité. Fin : e2e (2570359).
- [x] **C2 Scanner, point d'entrée unique**. Fin : e2e (2570359).
- [x] **C3 Scan en rafale**. Fin : e2e avec Annuler (636e9b8).
- [x] **C4 Rattacher un code-barres** à un produit existant. Fin : tests API et e2e (56af27a).
- [x] **C5 Édition en lot** en vue Liste. Fin : e2e (4c2531f).
- [x] **C6 Fusion de doublons**. Fin : tests d'intégration, journal intact (56af27a).

### D. Inventaire
- [x] **D1 Vue Liste triée par date limite** par défaut, compteurs à la place de « Ma maison ». Fin : e2e (b1fbb34).

### Clôture
- [x] **Z1 Suite complète et e2e** (deux navigateurs, deux tailles). Fin : 191 e2e, API et web verts en CI (5395ad5).
- [x] **Z2 Revue `reviewer`** (isolation, accessibilité, identité). Fin : 9 points corrigés (194a040).
- [x] **Z3 Finition unslop** des nouveaux écrans. Fin : `docs/audit-finition.md`, section Phase 3.
- [x] **Z4 README, PR, CI verte, fusion**. Fin : squash de la PR #27.

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
- P3.1 : migration 0004 écrite à la main (le snapshot 0003 était périmé) ; `0004_snapshot.json` régénéré, à jour.
- P3.2 : `push_subscriptions` unique par foyer et `endpoint` (RLS empêche de voir une ligne d'un autre foyer) ; l'application se désabonne à la déconnexion ; le résumé ignore un compte désactivé ou changé de foyer.
- P3.3 : durées suggérées du modèle : Viandes 3 j, Poissons 2 j, Laitiers et œufs 7 j, Fruits et légumes 5 j ; appliquées aussi aux foyers existants par la migration (catégories au même nom).
- P3.4 : « Aujourd'hui » = statut `soon` avec `days: 0` (forme d'`ExpiryStatus` inchangée) ; filtres d'échéance `today`, `soon` (1 à seuil), `expired`.
- P3.5 : variables VAPID vides lues comme absentes : notifications désactivées, l'API démarre.
- P3.6 : une annulation de retrait écrit la même raison avec un delta positif (`consumed` +n) ; les statistiques la neutralisent, l'historique affiche « Annulation : consommé ».
- P3.7 : une ligne de courses cochée bloque une nouvelle ligne automatique du même produit tant qu'elle n'est pas vidée ou rangée ; la ligne automatique vaut 1.
- P3.8 : la date d'achat de la fiche sert au calcul de la date suggérée, elle n'est pas enregistrée (pas de colonne au contrat).
- P3.9 : fiche d'ajout et formulaire produit inconnu gardent leurs deux étapes, avec les mêmes champs (contenance, date suggérée, rescan).
- P3.10 : un appareil abonné garde l'identifiant du compte abonné (`localStorage`) ; à la connexion d'un autre compte, l'abonnement du navigateur est supprimé (l'ancien foyer ne lui parle plus).
- P3.11 : job CI `e2e` limité à 20 min (191 tests sur deux navigateurs, 5 min de tests plus la construction) au lieu de 10.
- U2 : barre du bas dans le flux (dernière ligne de la colonne du `body`), pas `fixed`.

## Problèmes bloquants
<!-- Claude : note ici ce qui t'empêche d'avancer, avec la commande et l'erreur exacte. -->

- (note) Node 24 obligatoire (`nvm use`) : sous Node 20, `argon2` plante dans les tests API. Le conteneur local `inv-test-pg` occupe `127.0.0.1:5432`.

STOP: validation requise
