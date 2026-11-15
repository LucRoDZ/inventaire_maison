import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env['E2E_BASE_URL'] ?? 'http://localhost:3000';
const databaseUrl =
  process.env['E2E_DATABASE_URL'] ?? 'postgres://test:test@localhost:5432/inventaire_e2e';

const offPort = 4010;

export const ADMIN_USERNAME = 'admin';
export const ADMIN_PASSWORD = 'e2e-admin-password';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium-mobile', use: { ...devices['Pixel 7'] } },
    { name: 'webkit-mobile', use: { ...devices['iPhone 14'] } },
  ],
  webServer: [
    {
      // Open Food Facts stand-in: the API is pointed at it, nothing leaves the machine.
      command: 'node e2e/fixtures/off-server.mjs',
      cwd: '..',
      url: `http://127.0.0.1:${offPort}/ready`,
      reuseExistingServer: !process.env['CI'],
      env: { OFF_FIXTURE_PORT: String(offPort) },
    },
    {
      command: 'node e2e/reset-db.mjs && npm run build && npm run start',
      cwd: '..',
      url: `${baseURL}/api/health`,
      reuseExistingServer: !process.env['CI'],
      timeout: 240_000,
      env: {
        DATABASE_URL: databaseUrl,
        SESSION_SECRET: 'e2e-session-secret-e2e-session-secret-00',
        ADMIN_USERNAME,
        ADMIN_PASSWORD,
        OFF_USER_AGENT: 'InventaireMaison-E2E/1.0',
        OFF_BASE_URL: `http://127.0.0.1:${offPort}`,
        // Replaces the camera by codes pushed with window.__e2eScan (never set in production builds).
        NEXT_PUBLIC_E2E: '1',
      },
    },
  ],
});
