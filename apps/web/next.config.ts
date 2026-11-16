import path from 'node:path';
import withSerwistInit from '@serwist/next';
import type { NextConfig } from 'next';

const apiInternalUrl = process.env['API_INTERNAL_URL'] ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  // Always defined, so that webpack drops the fake scan engine (end-to-end tests only) from
  // every other build instead of emitting it as an unused chunk.
  env: { NEXT_PUBLIC_E2E: process.env['NEXT_PUBLIC_E2E'] === '1' ? '1' : '0' },
  async redirects() {
    // The « À classer » screen was removed: old bookmarks and installed shortcuts land on the inventory.
    return [{ source: '/a-classer', destination: '/inventaire', permanent: false }];
  },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiInternalUrl}/api/:path*` }];
  },
  async headers() {
    return [
      {
        // The worker itself must always be revalidated so that updates are noticed.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Permissions-Policy', value: 'camera=(self)' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  // Inactive in `npm run dev`.
  disable: process.env.NODE_ENV === 'development',
});

export default withSerwist(nextConfig);
