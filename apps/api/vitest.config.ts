import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    globals: false,
    fileParallelism: false,
    // Hooks create, migrate and drop PostgreSQL databases; DROP DATABASE waits for a checkpoint,
    // which can take over 30 s right after the heavier suites on a loaded machine.
    hookTimeout: 120_000,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
  },
});
