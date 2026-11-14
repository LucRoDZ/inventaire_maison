import { expect, test } from '@playwright/test';

test('la page d’accueil charge et expose son titre', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Inventaire maison');
});

test('le manifeste et les icônes sont servis sans session', async ({ request }) => {
  const manifestResponse = await request.get('/manifest.webmanifest');
  expect(manifestResponse.status()).toBe(200);
  const manifest = await manifestResponse.json();
  expect(manifest.display).toBe('standalone');

  for (const icon of manifest.icons as { src: string }[]) {
    const response = await request.get(icon.src);
    expect(response.status(), icon.src).toBe(200);
    expect(response.headers()['content-type']).toContain('image/png');
  }
  expect((await request.get('/icons/apple-touch-icon.png')).status()).toBe(200);
});

test('robots.txt interdit tout et les en-têtes de confidentialité sont présents', async ({
  request,
}) => {
  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain('Disallow: /');

  const login = await request.get('/connexion');
  expect(login.headers()['x-robots-tag']).toContain('noindex');
  expect(login.headers()['permissions-policy']).toBe('camera=(self)');
});

test('la page expose les balises iOS et viewport-fit=cover', async ({ page }) => {
  await page.goto('/connexion');
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveCount(1);
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute(
    'content',
    'Inventaire',
  );
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    'content',
    /viewport-fit=cover/,
  );
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    '/manifest.webmanifest',
  );
});
