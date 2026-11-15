export interface CategorySeed {
  name: string;
  /** Lucide icon name (kebab-case). */
  icon: string;
  isFallback?: boolean;
}

/** Display order is the array order. "Autre" is the fallback category. */
export const CATEGORY_SEEDS: readonly CategorySeed[] = [
  { name: 'Boissons', icon: 'cup-soda' },
  { name: 'Alcools et vins', icon: 'wine' },
  { name: 'Viandes', icon: 'beef' },
  { name: 'Poissons et fruits de mer', icon: 'fish' },
  { name: 'Produits laitiers et œufs', icon: 'milk' },
  { name: 'Fruits et légumes', icon: 'apple' },
  { name: 'Pâtes, riz et féculents', icon: 'wheat' },
  { name: 'Conserves', icon: 'archive' },
  { name: 'Épicerie sucrée', icon: 'candy' },
  { name: 'Biscuits et snacks', icon: 'cookie' },
  { name: 'Condiments et sauces', icon: 'droplets' },
  { name: 'Surgelés', icon: 'snowflake' },
  { name: 'Petit-déjeuner', icon: 'coffee' },
  { name: 'Hygiène et entretien', icon: 'spray-can' },
  { name: 'Autre', icon: 'package', isFallback: true },
];
