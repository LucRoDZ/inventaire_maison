'use client';

import { useEffect } from 'react';
import { refreshBadge } from '../../lib/badge';
import { fetchStockSummary } from '../../lib/stock-api';

/** Keeps the number on the app icon right: on open and each time the app becomes visible again. */
export function AppBadge({
  fetchSummary = fetchStockSummary,
}: {
  fetchSummary?: typeof fetchStockSummary;
}) {
  useEffect(() => {
    void refreshBadge(fetchSummary);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshBadge(fetchSummary);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [fetchSummary]);
  return null;
}
