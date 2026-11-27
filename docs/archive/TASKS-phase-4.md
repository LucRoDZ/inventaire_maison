# Archive : Phase 4 (fusionnée, PR #28)

## Phase 4 : Finition premium (branche `phase-4-premium`)

> Plan, vagues et tableau d'avancement : `docs/phase-4.md`.

### Étape 0 et contrat
- [x] **0.1 Archive** de la Phase 3. Fin : `TASKS.md` sous 150 lignes.
- [x] **0.2 Section Phase 4**. Fin : une case par tâche.
- [x] **0.3 Cibles e2e inchangées** (chromium-mobile Pixel 7, webkit-mobile iPhone 14, 360×740, 390×844). Fin : vérifié.
- [x] **K.1 Migration unique** `idempotency_keys` (RLS) et purge à 14 jours. Fin : `rls.spec.ts` vert.
- [x] **K.2 Jetons** voile, glissement, illustrations (et valeurs sombres). Fin : `check-colors` vert.
- [x] **K.3 Types partagés** `SyncOp`, `SyncResult`, constantes de file. Fin : build de `shared`.
- [x] **K.4 Plan** `docs/phase-4.md`. Fin : vagues et tableau.

### A. Scanner immersif
- [x] **A1 Écran `/scanner` plein écran** sans barre du bas, « Fermer le scanner », voile et coins. Fin : e2e (23cccd7).
- [x] **A2 Retour à la lecture** : coins verrouillés, coche, `aria-live`, vibration réglable, anti-doublon 1,5 s. Fin : test de composant (23cccd7).
- [x] **A3 Fiche en bas** de l'écran (ajout ou formulaire inconnu). Fin : e2e saisie manuelle (23cccd7).
- [x] **A4 Compteur de session** et « Annuler le dernier ». Fin : e2e (23cccd7).
- [x] **A5 Lampe et zoom** selon `getCapabilities()`, saisie manuelle toujours là. Fin : test de composant (23cccd7).
- [x] **A6 Cycle de vie de la caméra** et refus d'accès. Fin : e2e flux simulé (159e6c4).

### B. Scans hors ligne
- [x] **B1 File IndexedDB** avec clés d'idempotence, codes inconnus « à identifier ». Fin : tests unitaires (875eb3f).
- [x] **B2 Cache du catalogue** du foyer. Fin : test unitaire (875eb3f).
- [x] **B3 `POST /sync`** : une transaction par opération, rejeu sans effet, conflits. Fin : tests d'API (0fd04d2).
- [x] **B4 Interface** : pastille « À synchroniser (n) », écran dédié. Fin : e2e hors ligne (875eb3f).
- [x] **B5 Purge** de la file et du cache à la déconnexion ou au changement de compte. Fin : e2e (46c57ea).
- [x] **B6 Mises à jour optimistes** sûres, avec retour arrière. Fin : tests de composant (77f01af).

### C. Gestes et saisie
- [x] **C1 Glisser une ligne** (Liste, Courses) : Consommé ou Jeté, annulation 5 s. Fin : e2e (241816a).
- [x] **C2 Dates limites rapides** et affichage relatif. Fin : test de composant (0c29381).
- [x] **C3 Chiffres tabulaires**, titres équilibrés. Fin : revue (0c29381).
- [x] **C4 Partager la liste** (Web Share, repli presse-papiers). Fin : test de composant (0c29381).

### D. Fluidité visuelle
- [x] **D1 Squelettes** de chargement sans décalage. Fin : test de composant (0c29381).
- [x] **D2 Images** en fondu sur espace réservé. Fin : test de composant (0c29381).
- [x] **D3 View Transitions** : abandonnée (P4.8).
- [x] **D4 États vides illustrés** (SVG aux jetons). Fin : axe (0c29381).
- [x] **D5 Messages d'erreur** humains avec « Réessayer ». Fin : test de composant (0c29381).

### E. Application installée
- [x] **E1 Pastille d'icône** (Badging). Fin : test avec API simulée (77f01af).
- [x] **E2 Raccourcis** Scanner et Courses. Fin : test du manifeste (77f01af).
- [x] **E3 Écrans de lancement et icônes** (iPhone, adaptable). Fin : script et test (77f01af).

### F. Thème sombre
- [x] **F1 Réglage « Apparence »** sans flash. Fin : e2e (a4a3202).
- [x] **F2 Palette sombre** Indigo Ambre, contraste AA. Fin : axe dans les deux thèmes (5f8080d).
- [x] **F3 Tous les écrans** en sombre, Vue Maison comprise. Fin : e2e et `check-colors` (5f8080d).

### Clôture
- [x] **Z1 Suite complète et e2e**. Fin : vert en CI (a9ed09e).
- [x] **Z2 Revue `reviewer`** (isolation, accessibilité, identité, replis). Fin : 7 points corrigés.
- [x] **Z3 Finition unslop**. Fin : `docs/audit-finition.md`, section Phase 4.
- [x] **Z4 README, PR, CI verte, fusion**. Fin : squash de la PR #28.
