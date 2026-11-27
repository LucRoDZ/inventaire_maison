import { expect, test } from '@playwright/test';
import { ensureAccountInOwnHousehold, signIn } from './helpers';

test.use({ viewport: { width: 360, height: 740 } });

const TAG = { 'chromium-mobile': 'a', 'webkit-mobile': 'b' } as const;

test('Plus : la ligne « Installer l’application » est un bouton d’au moins 44 px', async ({
  page,
  baseURL,
}, testInfo) => {
  const tag = TAG[testInfo.project.name as keyof typeof TAG];
  const account = `install-${tag}`;
  await ensureAccountInOwnHousehold(baseURL!, account, 'install-mot-de-passe', `Install ${tag}`);
  await signIn(page, account, 'install-mot-de-passe');
  await page.goto('/plus');
  const row = page.getByRole('button', { name: /Installer l’application/ });
  await expect(row).toBeVisible();
  const box = await row.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
});
