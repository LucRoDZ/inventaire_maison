# Phase 5 : thème clair, scanner plein écran, ajout rapide, rupture → courses

Branche `phase-5`. Pour reprendre : lire ce tableau, puis `git log main..phase-5`.

## Avancement

| Tâche | Worker | Statut | Commit |
| --- | --- | --- | --- |
| Étape 0 : branche, contrat, ce plan | pilote | fait | |
| W1 · T1.1 à T1.3, T1.5 thème sombre retiré | pilote | fait | 8feceb0 |
| W1 · T1.4 purge de l'ancien réglage | pilote | fait | d56a94d |
| W3 · bouton Ajouter, feuille, barre à 3 onglets | worker | fait | e99528a, be8a8f5, 05b5d30, 546ebab, fe1a7d6 |
| W2 · polish du thème clair | worker | fait | e8e6261 |
| W4 · scanner plein écran | worker | fait | 66cfe02, 2c7b10e |
| Contrat vague 2 : types partagés (`productTotal`, `onShoppingList`, `ifAbsent`, opération `shop`) | pilote | fait | 6566e3f |
| W5a · rupture → courses, API | worker | fait | 410d082, b2a985b, 6123834, 876d108 |
| W5b · rupture → courses, web | worker | fait | 120ebb7, b04a94c, 83c6d75, 71b0aa5, b442a01 |
| W6 · documentation, manifeste, service worker | pilote | fait | 793c0a5 |
| Clôture : suite complète, revue (corrigée), PR #29 | pilote | en cours | |

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
- P5.5 : « Ajouter à nouveau » en ligne ajoute au lieu habituel et s'annule par une `correction` sur la même ligne (comme le scanner) ; hors ligne, l'opération passe par la file et l'annulation la retire tant qu'elle attend.
- P5.6 : identité révisée à la demande de la phase (W2) : fond de page `--surface`, cartes de liste à filet sans ombre, ombres teintées indigo à trois niveaux ; cahier des charges et `CLAUDE.md` mis à jour.
- P5.7 : le scanner assombrit la `theme-color` tant qu'il est ouvert (barre d'état d'Android) ; sur iPhone, le style de la barre d'état vaut pour toute l'application (`black-translucent` rendrait illisible l'heure sur les écrans clairs) : la barre reste claire au-dessus du viseur.
- P5.8 : l'invitation rupture s'affiche en haut de l'écran, jamais sur le toast de retrait du bas ; le minuteur ne se met en pause qu'au survol d'une souris ou au focus clavier.
- P5.9 : « Ajouter à nouveau » ne met jamais en file un ajout en ligne qui a échoué (la réponse a pu se perdre après application) : message d'erreur à la place ; verrou contre le double appui.
- P5.10 : insertions de courses concurrentes (`shop`, `ifAbsent`, ligne automatique) en `ON CONFLICT DO NOTHING` : jamais de 500 ni de doublon.
- P5.11 : e2e complets et axe lancés par la CI (chromium-mobile et webkit-mobile, 360×740 et 390×844), pas en local (règle de `CLAUDE.md`) ; pas de captures jointes, le rendu réel est à vérifier sur téléphone.

## Reste (mineur, non corrigé)

- Quantité proposée par l'invitation : toujours 1 (`ProductDto` n'a pas de quantité habituelle).
- Sur iPhone installé, barre d'état claire au-dessus du scanner (P5.7).
