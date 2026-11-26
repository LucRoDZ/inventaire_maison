# TASKS.md : suivi d'avancement

> Règles (détail dans `CLAUDE.md`, « Méthode de travail ») : une tâche = un commit ; vérification ciblée (typecheck de l'espace de travail touché, tests des fichiers touchés, eslint et prettier sur les fichiers modifiés, au plus un e2e) ; suite complète seulement en fin de phase et en CI (`gh pr checks` après chaque push).
> Coche une tâche avec le hash court de son commit, sans compte rendu. Une ligne par décision réelle.
> Tâche bloquée : commande et erreur dans « Problèmes bloquants » ; si une tâche suivante en dépend, écris le marqueur d'arrêt et arrête-toi.
> Phase terminée : écris seul sur la dernière ligne de ce fichier `STOP: validation requise` et arrête-toi. Tout est terminé : `ALL DONE` seul sur la dernière ligne. Ces deux marqueurs ne commencent jamais une autre ligne.
> Phases terminées : `docs/archive/TASKS-phases-0-1.md` et `docs/archive/TASKS-phase-3.md`, à ne pas lire sauf demande.

## Phase 4 : Finition premium (branche `phase-4-premium`)

> Plan, vagues et tableau d'avancement : `docs/phase-4.md`.

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
