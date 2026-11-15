/** Lowercase, without diacritics or ligatures: the form stored in `products.search_text`. */
export function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildSearchText(name: string, brand: string | null | undefined): string {
  return normalizeSearch(brand ? `${name} ${brand}` : name);
}
