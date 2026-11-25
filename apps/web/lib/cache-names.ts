/** Runtime caches of the service worker. The precache is managed by Serwist and versioned by revision. */
export const PAGES_CACHE = 'pages-v1';
/**
 * Caches of earlier versions (API reads, product pictures). The API is network only since the
 * households (decision A.5): the service worker deletes them at activation, the app on logout.
 */
export const API_CACHE = 'api-get-v1';
export const IMAGES_CACHE = 'product-images-v1';
export const RETIRED_CACHES = [API_CACHE, IMAGES_CACHE] as const;
/** Everything removed on logout and on sign-in (another account may follow on the same device). */
export const RUNTIME_CACHES = [PAGES_CACHE, ...RETIRED_CACHES] as const;
