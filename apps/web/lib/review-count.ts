import { useSyncExternalStore } from 'react';
import { apiFetch } from './api';

let count = 0;
const listeners = new Set<() => void>();

export function setReviewCount(value: number): void {
  if (value === count) return;
  count = value;
  listeners.forEach((listener) => listener());
}

/** Number of products in stock waiting for a category confirmation (badge of the tab). */
export function useReviewCount(): number {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => count,
    () => 0,
  );
}

/** Asks the API; a failure leaves the previous value (the badge is not worth an error). */
export async function refreshReviewCount(): Promise<void> {
  try {
    const items = await apiFetch<unknown[]>('/products?needsReview=true&limit=100');
    setReviewCount(items.length);
  } catch {
    // keep the previous value
  }
}
