import type { LocationKind } from '@inventaire/shared';
import { Package, Refrigerator, Snowflake, Warehouse, Wine, type LucideIcon } from 'lucide-react';

/** One icon per kind of furniture (Lucide, same set and stroke as the rest of the app). */
export const FURNITURE_ICONS: Record<LocationKind, LucideIcon> = {
  pantry: Warehouse,
  fridge: Refrigerator,
  freezer: Snowflake,
  cellar: Wine,
  other: Package,
};

/** Creating or deleting a piece of furniture needs the network (no offline write). */
export const OFFLINE_FURNITURE =
  'Pas de connexion : ajouter ou supprimer un meuble demande le réseau. Réessayez une fois en ligne.';
