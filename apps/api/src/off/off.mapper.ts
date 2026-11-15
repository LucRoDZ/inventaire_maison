export interface OffProduct {
  /** `product_name_fr`, else `product_name`, else null (a card without a name is poor data). */
  name: string | null;
  brand: string | null;
  quantity: string | null;
  imageUrl: string | null;
  /** Open Food Facts category tags, from the most generic to the most specific. */
  categoriesTags: string[];
  /** The raw product object, kept for `products.off_payload`. */
  payload: Record<string, unknown>;
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Maps the `product` object of an Open Food Facts response; null if it is not an object. */
export function mapOffProduct(raw: unknown): OffProduct | null {
  if (!isRecord(raw)) return null;
  const tags = Array.isArray(raw.categories_tags)
    ? raw.categories_tags.filter((tag): tag is string => typeof tag === 'string')
    : [];
  const brands = text(raw.brands);
  return {
    name: text(raw.product_name_fr) ?? text(raw.product_name),
    brand: brands ? (text(brands.split(',')[0]) ?? null) : null,
    quantity: text(raw.quantity),
    imageUrl: text(raw.image_front_url),
    categoriesTags: tags,
    payload: raw,
  };
}
