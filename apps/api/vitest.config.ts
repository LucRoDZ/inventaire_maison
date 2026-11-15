import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    globals: false,
    fileParallelism: false,
    // Setup hooks create and migrate a PostgreSQL database: 10 s is too short on a loaded machine.
    hookTimeout: 30_000,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
  },
});
