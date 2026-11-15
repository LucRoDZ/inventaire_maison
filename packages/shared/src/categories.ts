/** Closed list of Lucide icons a category can use (kebab-case names). */
export const CATEGORY_ICONS = [
  'cup-soda',
  'wine',
  'beer',
  'martini',
  'coffee',
  'beef',
  'drumstick',
  'ham',
  'fish',
  'milk',
  'egg',
  'apple',
  'carrot',
  'cherry',
  'citrus',
  'salad',
  'leaf',
  'wheat',
  'bean',
  'nut',
  'archive',
  'candy',
  'cake-slice',
  'cookie',
  'popcorn',
  'croissant',
  'pizza',
  'sandwich',
  'soup',
  'ice-cream-cone',
  'droplets',
  'flame',
  'snowflake',
  'utensils',
  'shopping-basket',
  'baby',
  'pill',
  'spray-can',
  'package',
] as const;
export type CategoryIcon = (typeof CATEGORY_ICONS)[number];

export const CATEGORY_NAME_MAX_LENGTH = 40;

/** Open Food Facts category tag: language code, colon, slug (e.g. `en:waters`). */
export const OFF_TAG_PATTERN = /^[a-z]{2}:[a-z0-9]+(-[a-z0-9]+)*$/;

export interface CategoryDto {
  id: number;
  name: string;
  icon: CategoryIcon;
  sortOrder: number;
  isFallback: boolean;
}

export interface OffCategoryMapDto {
  id: number;
  offTag: string;
  categoryId: number;
}
