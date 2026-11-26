import type { StockSummaryDto } from '@inventaire/shared';

/** What the app icon counts: products expired or about to be (« soon » includes today). */
export function badgeCount(summary: Pick<StockSummaryDto, 'soon' | 'expired'>): number {
  return Math.max(0, summary.soon + summary.expired);
}

interface BadgeTarget {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
}

/**
 * Shows the count on the app icon, and clears it at 0. Guarded: where the Badging API does not
 * exist (or refuses), nothing happens. Works from a page (`navigator`) and from the service worker.
 */
export async function applyBadge(
  count: number,
  target: BadgeTarget = typeof navigator === 'undefined' ? {} : (navigator as BadgeTarget),
): Promise<void> {
  try {
    if (count > 0 && typeof target.setAppBadge === 'function') await target.setAppBadge(count);
    else if (typeof target.clearAppBadge === 'function') await target.clearAppBadge();
    else if (typeof target.setAppBadge === 'function') await target.setAppBadge(0);
  } catch {
    // The badge is a courtesy: never an error.
  }
}

/** Reads the summary and updates the badge; a failure leaves the badge as it was. */
export async function refreshBadge(
  fetchSummary: () => Promise<Pick<StockSummaryDto, 'soon' | 'expired'>>,
  target?: BadgeTarget,
): Promise<void> {
  let summary;
  try {
    summary = await fetchSummary();
  } catch {
    return;
  }
  await applyBadge(badgeCount(summary), target);
}
