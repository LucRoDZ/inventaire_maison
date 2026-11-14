'use client';

import type { Serwist } from '@serwist/window';
import { useEffect, useRef, useState } from 'react';
import { UpdateCallout } from './UpdateCallout';

interface RegisterSWProps {
  /** Off in development so that Hot Reload is not served from a cache. */
  enabled?: boolean;
}

/** Registers the service worker and offers the update once a new version is waiting. */
export function RegisterSW({ enabled = process.env.NODE_ENV === 'production' }: RegisterSWProps) {
  const [updateReady, setUpdateReady] = useState(false);
  const serwist = useRef<Serwist | null>(null);
  const refreshing = useRef(false);

  useEffect(() => {
    if (!enabled || !('serviceWorker' in navigator)) return;
    let cancelled = false;
    void import('@serwist/window').then(({ Serwist: SerwistWindow }) => {
      if (cancelled) return;
      const instance = new SerwistWindow('/sw.js', { scope: '/', type: 'classic' });
      serwist.current = instance;
      instance.addEventListener('waiting', () => setUpdateReady(true));
      instance.addEventListener('controlling', () => {
        if (refreshing.current) window.location.reload();
      });
      void instance.register();
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  if (!updateReady) return null;
  return (
    <UpdateCallout
      onRefresh={() => {
        refreshing.current = true;
        serwist.current?.messageSkipWaiting();
      }}
    />
  );
}
