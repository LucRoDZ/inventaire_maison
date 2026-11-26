> Archive, ne pas lire sauf demande.

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

