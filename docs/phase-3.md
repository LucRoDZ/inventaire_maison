# Phase 3 : confort et refonte

## Avancement

| Étape | État | Détail |
| --- | --- | --- |
| Étape 0 : processus | fait | archive, règles, agents, CI |
| Contrat (K.1 à K.4) | fait | migration 0004, types partagés, navigation, ce plan |
| Vague 1 : API-A | fait | 8a675df |
| Vague 1 : API-B | fait | 43c400c à 285adf1 |
| Vague 1 : WEB | fait | b1fbb34 à cca39e2 |
| Vague 2 : fusion | fait | 1fca388, correctif 3d03a30 |
| Vague 3 : suite complète, revue | fait | 191 e2e verts, revue corrigée (194a040) |
| Finition, clôture | fait | unslop, README, PR #27 |

## Contrat (ne change pas sans le pilote)

- Migration unique `apps/api/drizzle/0004_phase3_comfort.sql` : `settings` (clé = foyer, `expiry_alert_days` 0 à 30, défaut 3), `shopping_items` (produit ou libellé, une seule ligne ouverte par produit), `push_subscriptions` (compte + foyer, unique par foyer et `endpoint`), `categories.shelf_life_days`, `products.min_quantity`, `amount`, `unit`, `merged_into_id`, raisons `consumed` et `wasted`. RLS activée et forcée sur les trois tables.
- Types : `packages/shared/src/comfort.ts`, `quick-entry.ts` (signatures ; implémentation en B2 et C1), ajouts dans `stock.ts`, `products.ts`, `categories.ts`.
- Variables : `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (vides : notifications désactivées).
- Dépendances déjà installées : `web-push`, `@nestjs/schedule`.

## Routes

| Route | Qui | Rôle |
| --- | --- | --- |
| `GET /settings` | API-A | seuil du foyer de la session |
| `GET`, `PATCH /admin/households/:id/settings` | API-A | console, admin seul (404 sinon) |
| `GET /stock?expiry=today\|soon\|expired` | API-A | filtre d'échéance, seuil du foyer ; `tri=expiry` existe |
| `GET /stock/summary` | API-A | quatre compteurs (`StockSummaryDto`) |
| `POST /stock/adjust`, `/stock/remove` avec `consumed` ou `wasted` | API-A | raison par défaut `consumed` pour `remove` |
| `GET /stats` | API-A | 30 jours (`StatsDto`) |
| `PATCH /admin/households/:id/categories/:cid` avec `shelfLifeDays` | API-A | durée suggérée |
| `GET /push/public-key`, `POST`, `DELETE /push/subscriptions` | API-A | Web Push ; résumé quotidien planifié à 8 h Europe/Paris |
| `GET`, `POST /shopping`, `PATCH`, `DELETE /shopping/:id` | API-B | liste de courses |
| `POST /shopping/clear-checked`, `/shopping/store-checked` | API-B | vider, ranger |
| `GET /shopping/recent` | API-B | récemment consommés (12, 30 jours) |
| `PATCH /products/:id` avec `minQuantity`, `amount`, `unit` | API-B | seuil minimum, contenance ; ajout et retrait automatiques |
| `POST /products/:id/merge` | API-B | fusion (tout compte du foyer) |
| `POST /products/:id/barcode` | API-B | rattacher un code-barres |

## Vagues et ordre de fusion

1. Vague 1, trois agents `worker` en parallèle, chacun dans son worktree : API-A, API-B, WEB (le WEB travaille sur les types du contrat, avec des mocks).
2. Vague 2 (pilote) : rebase et fusion dans l'ordre API-A, API-B, WEB, conflits résolus par le pilote.
3. Vague 3 : suite complète et e2e (chromium-mobile, webkit-mobile), revue `reviewer` (isolation, accessibilité, identité visuelle).
4. Finition `unslop` des nouveaux écrans, README, PR, CI verte, fusion en squash.
