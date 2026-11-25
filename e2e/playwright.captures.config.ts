import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/**
 * Screenshots of every screen for the finishing audit (docs/audit-finition.md), outside the test
 * suite: `npx playwright test -c playwright.captures.config.ts` with CAPTURE_DIR set.
 */
export default defineConfig({
  ...base,
  testDir: './captures',
  fullyParallel: false,
  workers: 1,
  projects: [base.projects![0]!],
});
