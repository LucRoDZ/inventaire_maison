# TASKS.md : suivi d'avancement

> Règles : lis `CLAUDE.md` d'abord. Une tâche = implémenter, tester, commit, cocher.
> Une tâche n'est cochée que si son critère « Fin » est constaté et que `npm run lint`, `npm run typecheck` et `npm test` passent.
> Après chaque `git push` : `gh pr checks`, et correction avant de continuer.
> Tâche bloquée : note la commande et l'erreur dans « Problèmes bloquants ». Si une tâche suivante en dépend, écris le marqueur d'arrêt et arrête-toi ; ne saute pas la tâche.
> Phase terminée : écris seul sur la dernière ligne de ce fichier `STOP: validation requise` et arrête-toi. Lucas supprime cette ligne pour lancer la phase suivante.
> Tout est terminé : écris seul sur la dernière ligne `ALL DONE`.
> Ces deux marqueurs ne doivent jamais commencer une autre ligne de ce fichier.
> Phases 0, 1, 1.5, « Foyers isolés et meubles » (terminées) et l'ancienne Phase 2 (reprise dans la Phase 3) : `docs/archive/TASKS-phases-0-1.md`, à ne pas lire sauf demande.

## Phase 3 : Confort et refonte (branche `phase-3-confort-refonte`)

> Plan, vagues et tableau d'avancement : `docs/phase-3.md`.

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
