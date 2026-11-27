# Nouveau logo et « Installer l'application »

Branche `logo`. Sources validées par l'utilisateur dans `design/icon/` (SVG et PNG 1024, indigo `#1800AD` et lavande `#EAE7FB` uniquement) ; elles ne sont jamais modifiées. Tout le reste est produit par `npm run icons` (`scripts/generate-icons.mjs`).

## Avancement

| Tâche | Qui | Statut | Commit |
| --- | --- | --- | --- |
| Sources dans `design/icon/`, décisions | pilote | fait | (ce commit) |
| Script, icônes, favicons, iOS, manifest, cache (tâches 1 à 8) | worker | fait | ea0c4da, 65c9274 |
| Ligne « Installer l'application » dans Plus (tâche 9) | worker | fait | 01c9369 |
| Suite complète, revue (corrigée), PR | pilote | en cours | |

## Sorties

| Fichier (sous `apps/web/public/icons/v3/`) | Source | Usage |
| --- | --- | --- |
| `icon-192.png`, `icon-512.png` | `principale` | manifest, `purpose: any` |
| `icon-192-maskable.png`, `icon-512-maskable.png` | `fond_indigo` | manifest, `purpose: maskable` |
| `icon-monochrome-512.png` | `monochrome`, fond retiré | manifest, `purpose: monochrome` |
| `apple-touch-icon.png` (180) | `fond_indigo` | `<head>` iOS |
| `icon.svg` | `principale` (copie) | favicon vectoriel |
| `favicon-16.png`, `favicon-32.png` | `simplifiee` | favicons PNG |
| `apps/web/public/favicon.ico` (16, 32, 48) | `simplifiee` 16 et 32, `principale` 48 | navigateurs |
| `apps/web/public/splash/v3/splash-WxH.png` | `principale` centrée sur le fond blanc de l'app | écrans de lancement iOS |

## Décisions prises

- L1 : `design/icon/` n'existait pas ; le pilote l'a créé depuis le zip fourni par l'utilisateur (les 4 SVG et les 4 PNG 1024 tels quels).
- L2 : favicons 16 et 32 px : `simplifiee`. Rendus côte à côte, `principale` devient une tache à 16 px (étagères et bocaux fondus) ; `simplifiee` garde le bocal et le cadre lisibles. À partir de 48 px, `principale`.
- L3 : `monochrome.svg` est identique à `principale.svg` (fond lavande compris). Une icône `monochrome` n'utilise que l'alpha : le script retire le rectangle de fond au rendu et rend transparentes les découpes lavande (reflet, étiquette, bandes) ; seule la silhouette indigo reste opaque (le fichier source reste intact).
- L4 : nouveaux noms versionnés (`/icons/v3/`, `/splash/v3/`) : les systèmes et le précache Serwist ne peuvent pas garder une ancienne icône sous la même adresse ; les anciens fichiers et `apps/web/assets/icon.svg` sont supprimés. Mise à jour silencieuse (le service worker en place s'en charge, aucun encadré).
- L5 : icônes `any` et `apple-touch-icon` carrées, sans coins arrondis ajoutés : le système applique son masque.
- L6 : l'interface n'affichait aucun logo (connexion, en-têtes et états vides sont textuels) : rien à remplacer, rien ajouté.
- L7 : fond des écrans de lancement : blanc, comme `background_color` du manifest (inchangé), logo centré à 28 % de la largeur comme avant.
- L8 : le dessin de `fond_indigo` dépasse le cercle de sécurité de 80 % : le script le réduit (environ 97 %) et le centre sur un carré indigo plein ; mesuré par `app/icons.spec.ts`.
- L9 : « Installer l'application » est toujours visible dans Plus ; « Application installée » (non cliquable) une fois installée. Navigateur intégré à une app sur iPhone (Instagram, Facebook) : même consigne que les autres navigateurs iOS, ouvrir dans Safari.
- L10 : `/splash/` est exclu du contrôle de session (`proxy.ts`), comme `/icons/` : sinon un iPhone sans session reçoit la page de connexion à la place de l'écran de lancement.
- L11 : `sharp` déclaré aussi à la racine (dépendance de dev), puisque `npm run icons` tourne depuis la racine.
- L12 : au tout premier rendu d'une app installée, la ligne « Installer » peut apparaître un instant avant « Application installée » (le mode autonome n'est connu qu'après le montage, pour éviter un écart de rendu serveur) : accepté.
