import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env['E2E_BASE_URL'] ?? 'http://localhost:3000';

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
  webServer: {
    command: 'npm run build && npm run start',
    cwd: '..',
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env['CI'],
    env: {
      DATABASE_URL:
        process.env['DATABASE_URL'] ?? 'postgres://test:test@localhost:5432/inventaire_test',
      SESSION_SECRET: process.env['SESSION_SECRET'] ?? 'e2e-session-secret-e2e-session-secret-00',
      ADMIN_USERNAME: process.env['ADMIN_USERNAME'] ?? 'admin',
      ADMIN_PASSWORD: process.env['ADMIN_PASSWORD'] ?? 'e2e-admin-password',
      OFF_USER_AGENT: process.env['OFF_USER_AGENT'] ?? 'InventaireMaison-E2E/1.0',
    },
    timeout: 240_000,
  },
});
