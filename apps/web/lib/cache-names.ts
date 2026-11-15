/** Runtime caches of the service worker. The precache is managed by Serwist and versioned by revision. */
export const PAGES_CACHE = 'pages-v1';
export const API_CACHE = 'api-get-v1';
export const IMAGES_CACHE = 'product-images-v1';
export const RUNTIME_CACHES = [PAGES_CACHE, API_CACHE, IMAGES_CACHE] as const;
