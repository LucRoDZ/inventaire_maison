# TASKS.md : suivi d'avancement

> Règles (détail dans `CLAUDE.md`, « Méthode de travail ») : une tâche = un commit ; vérification ciblée (typecheck de l'espace de travail touché, tests des fichiers touchés, eslint et prettier sur les fichiers modifiés, au plus un e2e) ; suite complète seulement en fin de phase et en CI (`gh pr checks` après chaque push).
> Coche une tâche avec le hash court de son commit, sans compte rendu. Une ligne par décision réelle.
> Tâche bloquée : commande et erreur dans « Problèmes bloquants » ; si une tâche suivante en dépend, écris le marqueur d'arrêt et arrête-toi.
> Phase terminée : écris seul sur la dernière ligne de ce fichier `STOP: validation requise` et arrête-toi. Tout est terminé : `ALL DONE` seul sur la dernière ligne. Ces deux marqueurs ne commencent jamais une autre ligne.
> Phases terminées : `docs/archive/TASKS-phases-0-1.md` `docs/archive/TASKS-phase-3.md` et `docs/archive/TASKS-phase-4.md`, à ne pas lire sauf demande.

## Phase 5 : thème clair, scanner plein écran, ajout rapide, rupture → courses (branche `phase-5`)

> Plan, contrat, tableau d'avancement et décisions P5.x : `docs/phase-5.md`.

- [x] **Vague 1** : thème clair unique, polish, bouton Ajouter et barre à 3 onglets (8feceb0, e8e6261, 546ebab).
- [x] **Vague 2** : scanner plein écran, rupture → courses (API et web), documentation (2c7b10e, 876d108, b442a01).
- [x] **Clôture** : suite complète, revue corrigée, PR #29, CI verte, fusion.

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

- P4.1 : appui long sur une ligne non retenu (la fiche ouverte au toucher couvre les actions).
- P4.2 : pas de miniatures floues côté serveur ; espace réservé neutre aux jetons qui s'estompe.
- P4.3 : vibration, lampe, zoom, pastille, View Transitions : détection de capacité, repli silencieux, rien de promis sur iPhone.
- P4.4 : `AuthUser.dataScope` = HMAC(`SESSION_SECRET`, compte et foyer), 32 caractères : la donnée de l'appareil est purgée quand il change, sans envoyer l'identifiant du foyer (D2).
- P4.5 : `idempotency_keys` sans clé primaire propre : unicité (foyer, clé) ; droits sans `UPDATE`.
- P4.6 (remplacée par P5.3) : `/` redirige vers `/inventaire`, le Scanner s'ouvre depuis « Ajouter ».
- P4.7 : B6 (mises à jour optimistes) confié à l'agent UI, propriétaire des listes et de Courses, pour éviter les conflits.
- P4.8 : View Transitions abandonnée : le meuble ouvert charge ses données après la navigation, la transition capturerait un écran vide.
- P4.9 : seules les opérations appliquées sont gardées dans `idempotency_keys` ; un conflit ou un rejet peut être renvoyé après correction avec la même clé.
- P4.10 : le glissement retire une unité, comme « − » (même chemin au clavier : « − » puis « Jeté »).
- P4.11 : la fiche rapide du scanner n'a ni date limite ni catégorie ; « Plus d'options » ouvre la fiche complète.
- P4.12 : puces de date limite dans la fiche d'ajout seulement (aucun autre formulaire n'a de date limite).
- P4.13 : sans `fake-indexeddb`, les tests de la file utilisent un stockage en mémoire derrière la même interface.
- P4.14 : le scanner plein écran garde la caméra allumée après un ajout (c'est l'écran pour scanner) ; elle s'éteint à la fermeture, en arrière-plan et à la déconnexion.
- P4.15 : « Fermer le scanner » ramène au dernier écran de l'application (mémorisé par la barre du bas), jamais à la page de connexion ; sinon à l'inventaire.
- P4.16 : la pastille d'icône compte aujourd'hui + bientôt + périmés (l'API compte « aujourd'hui » à part).
- P4.17 : jetons `--on-amber` et `--scanner-on-frame` pour le texte posé sur l'ambre et sur le cadre du scanner.
- P4.18 : `offline-sync.spec` travaille dans son propre foyer (base e2e partagée entre les specs).
- P4.19 : données de l'appareil écrites sans compte (après une déconnexion, autre onglet, réponse tardive) purgées à la connexion suivante ; catalogue jamais écrit sans compte lié.
- P4.20 : jeton `--scanner-backdrop`, seule zone sombre (le scanner est un viseur).

## Problèmes bloquants
<!-- Claude : note ici ce qui t'empêche d'avancer, avec la commande et l'erreur exacte. -->

- (note) Node 24 obligatoire (`nvm use`) : sous Node 20, `argon2` plante dans les tests API. Le conteneur local `inv-test-pg` occupe `127.0.0.1:5432`.

STOP: validation requise
