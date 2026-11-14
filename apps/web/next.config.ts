import path from 'node:path';
import withSerwistInit from '@serwist/next';
import type { NextConfig } from 'next';

const apiInternalUrl = process.env['API_INTERNAL_URL'] ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
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
