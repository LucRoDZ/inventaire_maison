# Phase 5 : thème clair, scanner plein écran, ajout rapide, rupture → courses

Branche `phase-5`. Pour reprendre : lire ce tableau, puis `git log main..phase-5`.

## Avancement

| Tâche | Worker | Statut | Commit |
| --- | --- | --- | --- |
| Étape 0 : branche, contrat, ce plan | pilote | fait | |
| W1 · T1.1 à T1.3, T1.5 thème sombre retiré | pilote | fait | |
| W1 · T1.4 purge de l'ancien réglage | pilote | fait | |
| W3 · bouton Ajouter, feuille, barre à 3 onglets | worker | à faire | |
| W2 · polish du thème clair | worker | à faire | |
| W4 · scanner plein écran | worker | à faire | |
| Contrat vague 2 : types partagés (`productTotal`, `onShoppingList`, `ifAbsent`, opération `shop`) | pilote | fait | |
| W5a · rupture → courses, API | worker | à faire | |
| W5b · rupture → courses, web | worker | à faire | |
| W6 · documentation, manifeste, service worker | pilote | à faire | |
| Clôture : suite complète, revue, PR | pilote | à faire | |

## Contrat (figé)

- Aucune migration sauf preuve qu'elle est indispensable (alors une seule, écrite par le pilote avant les vagues).
- Isolation des foyers inchangée : tout nouvel endpoint passe par `TenantDb` et le contexte de foyer ; le test « chaque table avec `household_id` a la RLS » reste vert.
- Coût récurrent nul.
- Indigo Ambre : jetons seulement (`check-colors`), pas de dégradé, un seul accent ambre, cibles de 44 px, `prefers-reduced-motion`, interface en français, un seul `h1` par écran, axe sans violation.
- Sélecteurs e2e à garder : lien `/^Frigo/`, région « Étagère 1 », bouton « nom, quantité n », « Déplacer vers… », bascule Maison/Liste. Un libellé changé met à jour son test dans la même tâche.
- Les fichiers de deux workers d'une même vague sont disjoints.
- Vague 2 (rupture → courses), sans migration :
  - `StockAdjustResponse` et `StockRemoveResponse` gagnent `productTotal` (unités restantes du produit dans le foyer, tous lieux) et `onShoppingList` (une ligne ouverte ou cochée existe, après `syncAutoShopping`), calculés dans la même transaction.
  - `ShoppingItemCreateInput.ifAbsent` : produit déjà sur la liste (ouverte ou cochée) → 409 « Déjà dans vos courses », rien ne change.
  - `SyncOp` gagne `kind: 'shop'` (même sens qu'`ifAbsent`, déjà présent → `applied` sans effet) pour la file hors ligne.

## Décisions

- P5.1 : thème clair uniquement ; `color-scheme: light`, une seule `theme-color` (`#ffffff`, aussi dans le manifeste) ; le réglage « Apparence » et `data-theme` disparaissent, la clé `inventaire.theme` est effacée au démarrage.
- P5.3 : `/` redirige vers `/inventaire` (le Scanner n'est plus un onglet).
- P5.4 : pas d'invitation quand le produit est déjà sur la liste (ligne automatique du seuil minimum comprise) ; hors ligne, le total n'est pas connu, donc pas d'invitation après un retrait mis en file ; « Ajouter » hors connexion passe par l'opération `shop` de la file.
- P5.2 : W1 fait par le pilote (surtout des suppressions) avant les workers, pour que W2 parte d'un `tokens.css` sans bloc sombre.
