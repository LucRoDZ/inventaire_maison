# Foyers isolés et meubles modulables : note de conception

25 novembre 2026 · branche `feat/foyers-et-meubles`

Deux changements livrés ensemble : (A) chaque foyer ne voit que ses données, avec une défense en profondeur ; (B) les meubles se créent et se suppriment. Les décisions D1 à D6 de la demande de Lucas font foi ; les choix pris en route sont dans `TASKS.md` (« Décisions prises », marqués « à confirmer »).

## 1. Modèle de données

```
households (id, name unique sans casse, created_at)
   │ 1
   ├──< users (household_id NOT NULL)              hors RLS, filtré dans le code
   ├──< locations (household_id)                   RLS
   │       └──< shelves (location_id, household_id) RLS, FK composite vers locations
   ├──< categories (household_id)                  RLS
   │       └──< off_category_map (category_id, household_id)  RLS, FK composite
   ├──< products (household_id)                    RLS, FK composites vers categories et locations
   ├──< stock_items (household_id)                 RLS, FK composites vers products et locations
   └──< stock_movements (household_id)             RLS, FK composite vers products, lieu en entier simple
```

- `household_id integer NOT NULL`, index sur chaque table de données, clé étrangère vers `households(id) ON DELETE CASCADE` (la suppression d'un foyer sans compte emporte ses données ; `users` n'a pas de cascade : un foyer qui a des comptes ne peut pas être supprimé).
- Valeur par défaut `NULLIF(current_setting('app.household_id', true), '')::int` : une insertion faite sans contexte de foyer échoue (`NOT NULL`), elle ne tombe jamais dans un foyer par hasard. Les services posent tout de même `household_id` explicitement.
- Clés étrangères composites : chaque parent référencé a une unicité `(id, household_id)` ; l'enfant référence `(parent_id, household_id)`. Une étagère, une ligne de stock, une correspondance ou un produit ne peut donc jamais pointer vers un objet d'un autre foyer, même si l'application se trompait. Le lieu habituel d'un produit utilise `ON DELETE SET NULL (default_location_id)` (PostgreSQL 15+) pour ne remettre à nul que la colonne du lieu.
- Unicités par foyer : code-barres `(household_id, barcode)`, nom de catégorie `(household_id, lower(name))`, une seule catégorie de repli par foyer, tag Open Food Facts `(household_id, off_tag)`, nom de meuble `(household_id, lower(name))`.
- Journal : `stock_movements.location_id` devient un entier simple (plus de clé étrangère) et le mouvement garde un instantané `location_name` et `shelf_name`. L'historique affiche le nom actuel s'il existe encore, sinon l'instantané : il reste lisible après la suppression d'un meuble ou d'une étagère.
- Images : `IMAGES_DIR/h<foyer>/<32 hex>.webp`. La route `GET /api/images/:fichier` cherche d'abord, dans le foyer de la session, le produit qui porte ce fichier ; sinon 404.

## 2. Flux d'une requête

```
HTTP ──► middleware « contexte » : AsyncLocalStorage.run({}, next)      (un magasin vide par requête)
     ──► OriginGuard ──► SessionGuard : session valide → req.user (+ householdId), magasin.householdId = …
     ──► RolesGuard : route @Roles('admin') et compte membre → 404
     ──► contrôleur ──► service de données ──► TenantDb.run(tx => …)
                                                   BEGIN
                                                   SELECT set_config('app.household_id', '<id>', true)
                                                   … requêtes filtrées « WHERE household_id = <id> » …
                                                   COMMIT
```

- `TenantDb` est le seul accès aux tables de données. `run()` lit le foyer du contexte (erreur 500 s'il manque : on échoue en refusant) ; un appel imbriqué réutilise la transaction ouverte. `forHousehold(id)` sert à la seule console d'administration (catégories et correspondances d'un foyer choisi, nombre de meubles) ; `withNewHousehold()` crée un foyer et copie le modèle dans la même transaction.
- `set_config(…, true)` est local à la transaction : la connexion rendue au pool ne garde aucun foyer.
- Le filtre applicatif (`eq(table.householdId, id)`) reste la règle ; RLS est le filet. Une ressource d'un autre foyer est introuvable pour les deux : réponse **404**, jamais 403.
- Un test parcourt `apps/api/src` et échoue si un fichier qui injecte `DB` ou `PG_POOL` touche une table de données (seuls `users`, `sessions`, `login_attempts` et `households` restent en accès direct).

## 3. Rôles PostgreSQL

| Rôle | Variable | Usage |
| --- | --- | --- |
| propriétaire (`inventaire`, celui de l'image Postgres) | `DATABASE_MIGRATION_URL` | migrations au démarrage de l'API, création et droits du rôle applicatif, déplacement des anciennes images |
| `inventaire_app` | `DATABASE_URL` | exécution : `NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`, droits minimum table par table |

- Au démarrage, le migrateur (connexion propriétaire) applique les migrations, puis crée le rôle s'il n'existe pas et lui pose le mot de passe lu dans `DATABASE_URL` (variable `APP_DB_PASSWORD` dans Compose), puis révoque et réaccorde ses droits table par table : `stock_movements` en lecture et insertion seulement (le journal n'est jamais modifié), `products` sans suppression, `users` sans suppression. Une nouvelle table sans droits déclarés fait échouer un test.
- L'API refuse de démarrer si le rôle de `DATABASE_URL` est superutilisateur ou a `BYPASSRLS`.
- RLS : `ENABLE` et `FORCE ROW LEVEL SECURITY` sur les sept tables de données, une politique `USING` et `WITH CHECK` sur `household_id = NULLIF(current_setting('app.household_id', true), '')::int`. Sans contexte : aucune ligne. Les cascades de clés étrangères (suppression d'un foyer vide) s'exécutent sous le propriétaire de la table et ne sont pas filtrées, ce qui est voulu.

## 4. Migration `0003_households.sql` (écrite à la main)

1. Crée `households` ; crée « Famille » seulement si la base contient déjà des comptes ou des données (base vide : le démarrage crée le premier foyer avec l'admin).
2. Ajoute `household_id` à `users` et aux sept tables, rattache tout à « Famille », passe la colonne en `NOT NULL`, ajoute index et clés étrangères.
3. Remplace les unicités globales par des unicités par foyer (dédoublonne d'abord les noms de meuble identiques à la casse près).
4. Remplace les clés étrangères simples par des composites ; retire celle du lieu dans le journal, ajoute et remplit `location_name`, `shelf_name`.
5. Active et force RLS, crée les politiques.

Le migrateur Drizzle applique les migrations en attente dans une seule transaction : un échec n'en laisse rien. Relancée, elle est ignorée (journal Drizzle). Testée sur une base peuplée avec le schéma `0002` (`migration-0003.spec.ts`).

## 5. Création d'un foyer

Une transaction : le foyer, puis les catégories, les correspondances Open Food Facts et les quatre meubles du modèle (Garde-manger, Frigo, Congélateur, Cave, avec leurs étagères), et, depuis la console, le compte créé avec lui. Le modèle est celui du seed (`database/seed/*.ts`). Trois points d'entrée : l'amorçage de l'admin initial sur une base vide, la console d'administration, le script `npm run household:create -- --name "…" --admin "pseudo"`.

## 6. Retour arrière

- **Avant** : sauvegarde obligatoire (`/opt/scripts/backup-inventaire.sh` sur le VPS, ou `scripts/backup-db.sh`), avec les images.
- **Code seul** (la migration est passée, l'application ne convient pas) : il n'existe pas de migration descendante. On restaure la sauvegarde prise juste avant, puis on redéploie l'ancien commit : `git checkout <commit précédent> && ./deploy.sh --no-backup`, puis `scripts/restore-db.sh --force <sauvegarde>`. L'ancien code ne fonctionne pas sur le nouveau schéma (colonnes `NOT NULL` sans valeur côté ancien code, RLS) : ne jamais redéployer l'ancien commit sans restaurer la base.
- **Images** : les fichiers sont déplacés dans `h<foyer>/` au démarrage ; la route sait encore lire l'ancien emplacement. La sauvegarde des images (`scripts/backup-images.sh`) les restitue telles qu'avant.
- Le rôle `inventaire_app` laissé en place par un retour arrière est inoffensif (aucun droit sur l'ancien schéma restauré ; on peut le supprimer avec `DROP ROLE inventaire_app`).

## 7. Meubles modulables

- `POST /locations` `{ name, kind, shelfCount? }`, `PATCH /locations/:id`, `DELETE /locations/:id?moveStockTo=:id`, ouverts aux deux rôles, dans le foyer de la session. 12 meubles par foyer, 8 étagères par meuble (constantes de `packages/shared`), nom unique sans tenir compte de la casse (409).
- Suppression d'un meuble qui contient du stock : `moveStockTo` obligatoire, stock versé dans le plateau « Non rangé » de la destination (quantités additionnées, deux mouvements `move` par ligne), lieux habituels remis à « aucun », le tout dans une transaction.
- Menu « ⋯ » d'un meuble : « Ajouter une étagère » (en bas, nommée d'après le type : Étagère n, Tiroir n, Rangée n ; grisé à 8) et « Supprimer une étagère » (choix par numéro de ligne, ligne 1 = haut, confirmation, produits versés sur « Non rangé »).
- Interface : tuile « Ajouter un meuble » en fin de grille, feuille de création (composant `BottomSheet` commun avec la fiche produit : focus piégé, Échap, focus rendu, `prefers-reduced-motion`), boîte `alertdialog` de suppression, sélecteurs de meuble regroupés par type à partir de 6 meubles.
