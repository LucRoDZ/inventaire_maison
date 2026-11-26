# Phase 4 : finition premium

## Avancement

| Étape | État | Détail |
| --- | --- | --- |
| Étape 0 | fait | archive Phase 3, section Phase 4, cibles e2e vérifiées |
| Contrat (K.1 à K.4) | fait | migration 0005, jetons, types, `dataScope`, ce plan |
| Vague 1 : SCAN (A) | en cours | worktree `worker` |
| Vague 1 : SYNC (B1 à B5) | en cours | worktree `worker` |
| Vague 1 : UI (C, D, E, B6) | en cours | worktree `worker` |
| Vague 2 : fusion puis thème sombre (F) | à faire | ordre SCAN, SYNC, UI ; un seul `worker` pour F |
| Vague 3 : suite complète, revue | à faire | |
| Finition, clôture | à faire | |

## Contrat (ne change pas sans le pilote)

- Migration unique `apps/api/drizzle/0005_phase4_sync.sql` : `idempotency_keys` (`household_id`, `key` unique par foyer, `device_id`, `result` jsonb, `created_at`), RLS activée et forcée ; droits `SELECT, INSERT, DELETE`. Purge à 14 jours par la tâche planifiée existante (`apps/api/src/push/push.scheduler.ts`, une transaction par foyer).
- Types : `packages/shared/src/sync.ts` (`SyncOp`, `SyncResult`, `SyncRequest`, `SyncResponse`, `CatalogCacheEntry`, constantes de file) ; `AuthUser.dataScope` (opaque, change avec le compte et son foyer, décision D2 respectée).
- Jetons (`tokens.css`, utilitaires dans `globals.css`) : `scanner-veil`, `scanner-frame`, `scanner-ink`, `alert-tint`, `swipe-consumed-bg|ink`, `swipe-wasted-bg|ink`, `skeleton`, `illustration-surface|line|accent`, `theme-color` ; bloc `:root[data-theme='dark']` pour ces seuls jetons.

## Routes

| Route | Qui | Rôle |
| --- | --- | --- |
| `POST /sync` (`SyncRequest`, 100 opérations au plus) | SYNC | une transaction par opération, dans l'ordre ; clé déjà vue : `duplicate` sans effet ; conflits `merged`, `insufficient_stock`, `no_location` ; hors foyer : `rejected` |
| `GET /sync/catalog` | SYNC | `CatalogCacheEntry[]` du foyer, produits fusionnés exclus |

## Données sur l'appareil

- File IndexedDB `inventaire-sync` et cache du catalogue, marqués du `dataScope` du compte ; purgés à la déconnexion et quand un compte d'un autre `dataScope` se connecte. Le propriétaire de l'abonnement push passe aussi au `dataScope`.

## Répartition

| Agent | Sections | Fichiers principaux |
| --- | --- | --- |
| SCAN | A | `app/(scan)/scanner`, `components/scanner` |
| SYNC | B | `apps/api/src/sync`, `apps/web/lib/offline-*`, écran « À synchroniser » sous Compte |
| UI | C, D, E | `components/list`, `components/shopping`, `components/ui`, manifeste, `scripts/generate-icons.mjs` |
| F (vague 2) | F | `tokens.css`, `globals.css`, `furniture.css`, réglage Apparence |

## Ordre de fusion

SCAN, SYNC, UI (le pilote résout les conflits), puis F, puis suite complète, revue `reviewer`, unslop, README, PR, CI verte, squash.
