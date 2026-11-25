import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ensureFurniture, renderFurniture, TAG } from './furniture-fixtures';
import { ensureAccountInOwnHousehold, furnitureSettled, householdOf, signIn } from './helpers';

// Render of the open furniture (captures of Lucas): a frame that fits its content, shelves of one
// height, drawers with their handle in its own space, no frost, no visible scrollbar.

const SIZES = [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
] as const;

/** Everything measured in the page for one open furniture. */
async function measure(page: Page) {
  return page.evaluate(() => {
    type Box = { left: number; top: number; right: number; bottom: number };
    const box = (el: Element): Box => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    };
    const overlap = (a: Box, b: Box) =>
      a.left < b.right - 0.5 &&
      b.left < a.right - 0.5 &&
      a.top < b.bottom - 0.5 &&
      b.top < a.bottom - 0.5;
    const scene = document.querySelector('.fx-scene')!;
    const body = document.querySelector('.fx-body')!;
    const shelves = document.querySelector('.fx-shelves')!;
    const rows = [
      ...shelves.querySelectorAll(':scope > .fx-row, :scope > .fx-tray-row:not(.fx-tray-empty)'),
    ].map((row) => Math.round(row.getBoundingClientRect().height * 10) / 10);

    // The handle of a drawer is its ::before: its box from the computed style.
    const handleHits: string[] = [];
    for (const drawer of document.querySelectorAll<HTMLElement>('section.fx-drawer')) {
      const style = getComputedStyle(drawer);
      const handle = getComputedStyle(drawer, '::before');
      const r = drawer.getBoundingClientRect();
      const left = r.left + parseFloat(style.borderLeftWidth) + parseFloat(handle.left);
      const top = r.top + parseFloat(style.borderTopWidth) + parseFloat(handle.top);
      const h: Box = {
        left,
        top,
        right: left + parseFloat(handle.width),
        bottom: top + parseFloat(handle.height),
      };
      const busy = drawer.querySelectorAll('h3, .fx-count, .text-help, a, button, .fx-pile-card');
      for (const el of busy) {
        if (overlap(h, box(el)))
          handleHits.push(`${drawer.getAttribute('aria-label')} : ${el.textContent?.trim()}`);
      }
    }

    // A dotted or dashed outline only around the empty zone of a shelf that is not a drawer.
    const dotted = [...scene.querySelectorAll<HTMLElement>('*')]
      .filter((el) => {
        const s = getComputedStyle(el);
        return [s.borderTopStyle, s.borderBottomStyle, s.borderLeftStyle, s.borderRightStyle].some(
          (v) => v === 'dashed' || v === 'dotted',
        );
      })
      .filter((el) => !(el.matches('.fx-zone-empty') && !el.closest('.fx-drawer')))
      .map((el) => el.className.toString().slice(0, 40));

    const scrollbars = [...document.querySelectorAll<HTMLElement>('.fx-tiles')].filter((ul) => {
      const s = getComputedStyle(ul) as CSSStyleDeclaration & { scrollbarWidth?: string };
      // Space taken by a scrollbar, or a scrollbar style that is not hidden where it is supported.
      return (
        ul.offsetHeight - ul.clientHeight > 0 ||
        (s.scrollbarWidth !== undefined && s.scrollbarWidth !== '' && s.scrollbarWidth !== 'none')
      );
    }).length;

    const small = [...scene.querySelectorAll<HTMLElement>('a[href], button')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.width < 43.5 || r.height < 43.5);
      })
      .map((el) => el.getAttribute('aria-label') ?? '');

    const doors = [...scene.querySelectorAll('.fx-door')].map((door) => {
      const d = box(door);
      const b = box(body);
      return {
        width: Math.round(d.right - d.left),
        top: Math.round(d.top - b.top),
        bottom: Math.round(d.bottom - b.bottom),
      };
    });

    return {
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      rows,
      frame: body.getBoundingClientRect().height,
      content: shelves.getBoundingClientRect().height,
      handleHits,
      dotted,
      scrollbars,
      small,
      doors,
      frost: document.querySelectorAll('.fx-frost').length,
      light: [...document.querySelectorAll('.fx-light')].map((l) =>
        Number(getComputedStyle(l).opacity),
      ),
      lightHeight: Math.max(
        0,
        ...[...document.querySelectorAll('.fx-light')].map((l) => l.getBoundingClientRect().height),
      ),
      kind: scene.getAttribute('data-kind'),
    };
  });
}

// One worker for this file: the furniture is built once per project.
test.describe.configure({ mode: 'default' });

test.describe('rendu des meubles ouverts', () => {
  let ids: [string, number][] = [];

  test.beforeEach(async ({ page }, testInfo) => {
    const tag = TAG[testInfo.project.name as keyof typeof TAG];
    // Its own account and household per browser: the furniture of the admin stays untouched.
    const account = `rendu-${tag.toLowerCase()}`;
    await ensureAccountInOwnHousehold(
      testInfo.project.use.baseURL!,
      account,
      'mot-de-passe-rendu',
      `Rendu ${tag}`,
    );
    await signIn(page, account, 'mot-de-passe-rendu');
    const householdId = await householdOf(account);
    ids = [];
    for (const spec of renderFurniture(tag)) {
      const id = await ensureFurniture(
        page,
        testInfo.project.use.baseURL!,
        spec,
        'Rutabaga',
        householdId,
      );
      ids.push([spec.name, id]);
    }
  });

  for (const size of SIZES) {
    test(`${size.width} × ${size.height} : cadre ajusté, rangées égales, tiroirs nets, sans défilement`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      for (const [name, id] of ids) {
        await page.goto(`/inventaire/${id}`);
        await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
        await furnitureSettled(page);
        const m = await measure(page);
        const label = `${name} à ${size.width} × ${size.height}`;

        expect(m.scrollHeight, label).toBeLessThanOrEqual(m.innerHeight);
        // Every shelf (and a tray with products) has the same height.
        expect(Math.max(...m.rows) - Math.min(...m.rows), label).toBeLessThanOrEqual(1);
        // The frame fits its content: no big empty space inside.
        expect(m.frame, label).toBeLessThanOrEqual(m.content + 24);
        expect(m.handleHits, label).toEqual([]);
        expect(m.dotted, label).toEqual([]);
        expect(m.scrollbars, label).toBe(0);
        expect(m.small, label).toEqual([]);
        expect(m.frost, label).toBe(0);
        // The light: none in the freezer, elsewhere a thin bar at 0.6 at most.
        if (m.kind === 'freezer') expect(m.light, label).toEqual([]);
        else {
          expect(m.light, label).toEqual([0.6]);
          expect(m.lightHeight, label).toBeLessThanOrEqual(4);
        }
        // Each door: a slat of 20 px at most, exactly as high as the body.
        for (const door of m.doors) {
          expect(door.width, label).toBeLessThanOrEqual(20);
          expect(Math.abs(door.top), label).toBeLessThanOrEqual(1);
          expect(Math.abs(door.bottom), label).toBeLessThanOrEqual(1);
        }
      }
    });
  }

  test('congélateur : tiroir vide sans « 0 article », tiroir garni avec son nombre d’articles', async ({
    page,
  }, testInfo) => {
    const tag = TAG[testInfo.project.name as keyof typeof TAG];
    const id = (name: string) => ids.find(([n]) => n === name)![1];
    await page.goto(`/inventaire/${id(`Glacière vide ${tag}`)}`);
    const empty = page.getByRole('region', { name: 'Tiroir 1' });
    await expect(empty.getByText('Vide')).toBeVisible();
    await expect(page.getByText(/0 article/)).toHaveCount(0);
    await expect(
      empty.getByRole('link', { name: 'Ajouter un produit sur Tiroir 1' }),
    ).toBeVisible();

    await page.goto(`/inventaire/${id(`Glacière garnie ${tag}`)}`);
    const filled = page.getByRole('region', { name: 'Tiroir 1' });
    await expect(filled.getByText('2 articles')).toBeVisible();
    await expect(filled.getByRole('button', { name: /^Rutabaga .*, quantité 2$/ })).toBeVisible();
  });

  test('axe à 360 px sur chaque meuble de rendu', async ({ page }) => {
    await page.setViewportSize(SIZES[0]);
    for (const [name, id] of ids) {
      await page.goto(`/inventaire/${id}`);
      await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
      await furnitureSettled(page);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(
        results.violations.map(
          (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
        ),
        name,
      ).toEqual([]);
    }
  });
});
