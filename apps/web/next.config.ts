import path from 'node:path';
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
        source: '/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Permissions-Policy', value: 'camera=(self)' },
        ],
      },
    ];
  },
};

export default nextConfig;
