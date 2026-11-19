'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import {
  applyPendingUpdate,
  isAppAssetError,
  isBusy,
  isChunkLoadError,
  isTextEntry,
  isUpdatePending,
  markDirty,
  markUpdatePending,
  reloadOnceAfterChunkError,
  resetDirty,
} from '../../lib/silent-update';

interface RegisterSWProps {
  /** Off in development so that Hot Reload is not served from a cache. */
  enabled?: boolean;
  /** Test seams. */
  reload?: () => void;
  navigate?: (href: string) => void;
}

const browserReload = () => window.location.reload();
const browserNavigate = (href: string) => window.location.assign(href);

declare global {
  interface Window {
    /** End-to-end builds only: behaves as if a new version had just taken over the page. */
    __e2eUpdateReady?: () => void;
  }
}

const sessionStore = (): Storage | null => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

/** An ordinary click on a link to another screen of the app (no new tab, no modifier). */
function internalLink(event: MouseEvent): HTMLAnchorElement | null {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const link = (event.target as Element | null)?.closest?.('a[href]');
  if (!(link instanceof HTMLAnchorElement)) return null;
  if (link.target && link.target !== '_self') return null;
  if (link.hasAttribute('download')) return null;
  const url = new URL(link.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  if (url.pathname === window.location.pathname) return null;
  return link;
}

/**
 * Registers the service worker and keeps the app up to date without a word: it looks for a new
 * version at launch and each time the app comes back to the foreground; once a new version has
 * taken over, the page switches to it at the next navigation, never during an action (camera,
 * unsaved text, drag, open sheet). It also reloads once, silently, when a chunk of an older
 * deployment is missing. It renders nothing.
 */
export function RegisterSW({
  enabled = process.env.NODE_ENV === 'production',
  reload = browserReload,
  navigate = browserNavigate,
}: RegisterSWProps) {
  const pathname = usePathname();
  const previous = useRef(pathname);
  // The latest seams, read by listeners installed once.
  const seams = useRef({ reload, navigate });
  useEffect(() => {
    seams.current = { reload, navigate };
  });

  // Service worker: register, look for updates at launch and on return to the foreground.
  useEffect(() => {
    if (!enabled || !('serviceWorker' in navigator)) return;
    let cancelled = false;
    let onVisible: (() => void) | null = null;
    void import('@serwist/window').then(({ Serwist }) => {
      if (cancelled) return;
      const sw = new Serwist('/sw.js', { scope: '/', type: 'classic' });
      // A worker of an older version may still wait for a tap that no longer exists.
      sw.addEventListener('waiting', () => sw.messageSkipWaiting());
      sw.addEventListener('controlling', (event) => {
        if (event.isUpdate) markUpdatePending();
      });
      void sw.register();
      onVisible = () => {
        if (document.visibilityState === 'visible') void sw.update();
      };
      document.addEventListener('visibilitychange', onVisible);
    });
    return () => {
      cancelled = true;
      if (onVisible) document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled]);

  // What a reload must never cut short: typed text not yet saved.
  useEffect(() => {
    const onInput = (event: Event) => {
      if (isTextEntry(event.target)) markDirty();
    };
    document.addEventListener('input', onInput, true);
    document.addEventListener('submit', resetDirty, true);
    return () => {
      document.removeEventListener('input', onInput, true);
      document.removeEventListener('submit', resetDirty, true);
    };
  }, []);

  // A click on a link while a new version waits: a full navigation instead of a client one, so
  // the next screen opens directly in the new version.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!isUpdatePending() || isBusy()) return;
      const link = internalLink(event);
      if (!link) return;
      event.preventDefault();
      seams.current.navigate(link.href);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  // Any other navigation (programmatic, or a click while busy): the new screen is fresh, so the
  // reload happens there if nothing has started yet.
  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    resetDirty();
    applyPendingUpdate(seams.current.reload);
  }, [pathname]);

  // A page opened before a deployment asks for a chunk that is gone: reload once, silently.
  useEffect(() => {
    const recover = () =>
      reloadOnceAfterChunkError(sessionStore(), Date.now(), seams.current.reload);
    const onError = (event: Event) => {
      if (isAppAssetError(event.target) || isChunkLoadError((event as ErrorEvent).error)) recover();
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      if (isChunkLoadError(event.reason)) recover();
    };
    window.addEventListener('error', onError, true);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError, true);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_E2E !== '1') return;
    window.__e2eUpdateReady = markUpdatePending;
    return () => {
      delete window.__e2eUpdateReady;
    };
  }, []);

  return null;
}
