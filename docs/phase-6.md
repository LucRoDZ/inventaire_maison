# Phase 6 : pages à défilement interne, scanner allégé, création d'article

Branche `phase-6`. Pour reprendre : lire ce tableau, puis `git log main..phase-6`.

## Avancement

| Tâche | Worker | Statut | Commit |
| --- | --- | --- | --- |
| Étape 0 : branche, contrat (types, `GET /shopping/recent`, date du mouvement), ce plan | pilote | fait | 12454ca |
| W1 · `FullPageList`, `SelectableRow`, groupe `(page)` | worker | fait | 389bae9 |
| W3 · scanner sans Retirer, Réglages › Scanner, viseur à 3 boutons, « Créer un article » | worker | fait | cf70ddd, 5d5f895, a20326a |
| W4 · ligne « Créer », feuille sans code-barres qui défile, bouton Ajouter centré | worker | fait | 888ffaf, 9c3ae1e |
| W2 · page « Ajouter à nouveau », Courses sur `FullPageList` | worker | en cours | |
| W5 · Inventaire › Liste à défilement interne, compteurs compacts | worker | en cours | |
| Clôture : suite complète, revue, PR | pilote | à faire | |

## Contrat (figé à l'étape 0)

- Aucune migration, aucun nouvel endpoint. Tout accès passe par `TenantDb` ; test d'isolation inchangé et vert.
- `RecentProductDto` gagne `lastConsumedAt` (ISO), `locationName` (meuble habituel ou null), `sizeLabel`, `inStock` (unités du foyer).
- `GET /shopping/recent?limit=&days=` : `limit` 1 à 200 (12 par défaut), `days` 1 à 365 (30 par défaut). Côté web : `fetchRecentProducts({ limit, days })`. Constante `RECENT_PRODUCTS_PAGE = 50`.
- `POST /sync`, opération `add` : le mouvement prend la date `createdAt` de l'appareil si elle tombe dans les 30 derniers jours et pas dans le futur (`movementDate`), sinon l'heure du serveur. Sert à « Acheté le ».
- `StockService.adjust(input, userId, occurredAt?)`.
- `components/ui/FullPageList.tsx` : `title`, `onBack`, `toolbar?`, `header?`, `children` (zone qui défile), `footer?`, `emptyState?`, `loading?`, `memoryKey?`, `zoneLabel?`. S'appuie sur `ScrollZone` de `Screen.tsx` (mémoire de position, région nommée, filet). `SelectableRow` dans `components/ui/SelectableRow.tsx`.
- Groupe de routes `app/(page)/` : `AuthProvider`, conteneur `fixed inset-0 h-dvh flex flex-col`, pas de barre du bas. Variante onglet : le même composant dans `(app)`.
- Réglages du scanner : `lib/scanner-settings.ts`, clé `localStorage` `inventaire.scanner-settings.v1`, `{ cameraId: string | null; burst: boolean }`, rafale vraie par défaut. Écran `/plus/scanner`.
- Structure de tout écran à liste : `h-dvh flex flex-col`, en-tête `shrink-0`, zone `min-h-0 flex-1 overflow-y-auto overscroll-contain`, pied `shrink-0` ; `body` ne défile jamais.
- Sélecteurs e2e à préserver : lien `/^Frigo/`, région « Étagère 1 », bouton « nom, quantité n », « Déplacer vers… », bascule Maison/Liste.

## Décisions prises

- P6.1 : « Acheté le » date le mouvement d'ajout (historique, statistiques) ; le sélecteur va d'aujourd'hui à 30 jours en arrière. L'application n'a pas de date d'achat par ligne de stock, et aucune migration n'est permise.
- P6.2 : « Ajouter à nouveau » réutilise `GET /shopping/recent` élargi (limite, période sur 365 jours, champs d'affichage) plutôt qu'un nouvel endpoint ; tri côté client sur les lignes chargées.
- P6.3 : « Ajouter N produits » passe par la file hors ligne (une opération `add` par produit, meuble habituel choisi par le serveur). L'envoi attend la fin du toast : « Annuler » retire les opérations encore en attente, rien n'a touché le serveur.
- P6.4 : T4.2 (« Créer un article » du scanner) est fait par W3, qui possède les fichiers du scanner ; W4 garde la recherche manuelle.
- P6.5 : `FullPageList` est bâti sur `ScrollZone` ; `Screen` reste pour les écrans simples.
- P6.6 : les opérations `remove` déjà en file restent traitées par `POST /sync` ; le scanner n'en produit plus.
- P6.7 : rafale active par défaut : un produit connu avec meuble habituel s'ajoute sans fiche. Les e2e qui attendent la fiche désactivent la rafale par `localStorage` (`inventaire.scanner-settings.v1`).
- P6.8 : les compteurs de l'Inventaire passent dans l'en-tête fixe (une rangée compacte), en mode Maison comme en mode Liste.
