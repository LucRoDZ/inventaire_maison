'use client';

import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Scroll positions kept while the application runs (module scope: it survives a client-side
 * navigation, a switch of view, a return from an open piece of furniture). Never written to disk.
 */
const positions = new Map<string, number>();

/** How long a remembered position may wait for the content (loaded later) to be tall enough. */
const RESTORE_WINDOW_MS = 3000;

interface ScrollZoneProps {
  /** Name of the region (« Liste des meubles »…). */
  label: string;
  /** Key of the remembered scroll position; none: the zone starts at the top. */
  memoryKey?: string;
  children: ReactNode;
  className?: string;
}

/**
 * The only part of a screen that scrolls, between the fixed header and the bottom bar. A named
 * region the keyboard can reach and scroll. A 1 px line appears at its top once it has left the
 * top. Its scroll position is remembered under `memoryKey` and given back when it comes again,
 * as soon as the content is tall enough.
 */
export function ScrollZone({ label, memoryKey, children, className = '' }: ScrollZoneProps) {
  const zone = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  /** Set by the first scroll of the person: a remembered position never overrides it. */
  const touched = useRef(false);

  useLayoutEffect(() => {
    const node = zone.current;
    const target = memoryKey ? (positions.get(memoryKey) ?? 0) : 0;
    if (!node || target <= 0) return;
    const restore = () => {
      if (touched.current) return true;
      if (node.scrollHeight - node.clientHeight < target) return false;
      node.scrollTop = target;
      setScrolled(true);
      return true;
    };
    if (restore() || typeof ResizeObserver === 'undefined') return;
    // The content arrives later (data): try again each time it changes size.
    const content = node.firstElementChild;
    const observer = new ResizeObserver(() => {
      if (restore()) observer.disconnect();
    });
    if (content) observer.observe(content);
    const timer = setTimeout(() => observer.disconnect(), RESTORE_WINDOW_MS);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [memoryKey]);

  useEffect(() => {
    const node = zone.current;
    if (!node) return;
    const stop = () => {
      touched.current = true;
    };
    // A scroll by the person (finger, wheel, keys): from then on the zone is theirs.
    node.addEventListener('wheel', stop, { passive: true });
    node.addEventListener('touchmove', stop, { passive: true });
    node.addEventListener('keydown', stop);
    node.addEventListener('pointerdown', stop);
    return () => {
      node.removeEventListener('pointerdown', stop);
      node.removeEventListener('wheel', stop);
      node.removeEventListener('touchmove', stop);
      node.removeEventListener('keydown', stop);
    };
  }, []);

  return (
    <div
      ref={zone}
      role="region"
      aria-label={label}
      tabIndex={0}
      data-scroll-zone=""
      data-scrolled={scrolled ? 'true' : undefined}
      onScroll={(event) => {
        const top = event.currentTarget.scrollTop;
        if (memoryKey) positions.set(memoryKey, top);
        setScrolled(top > 0);
      }}
      className={`scroll-zone min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 ${className}`}
    >
      <div className="flex flex-col gap-4 pt-1 pb-6">{children}</div>
    </div>
  );
}

interface ScreenProps {
  /** The `h1` of the screen. */
  title: ReactNode;
  /** A link back to the parent screen, as an icon before the title. */
  back?: { href: string; label: string };
  /** Buttons at the right of the title (44 px each). */
  actions?: ReactNode;
  /** More rows of the fixed header, under the title. */
  header?: ReactNode;
  /** Name of the scroll region; the title when it is text. */
  zoneLabel?: string;
  memoryKey?: string;
  children: ReactNode;
}

/**
 * A screen of the application: a fixed header (title, actions, more rows) and one zone that
 * scrolls under it. The page itself never scrolls.
 */
export function Screen({
  title,
  back,
  actions,
  header,
  zoneLabel,
  memoryKey,
  children,
}: ScreenProps) {
  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 flex-col gap-2 px-4 pt-3 pb-2">
        <div className="flex min-h-11 items-center gap-1">
          {back ? (
            <Link
              href={back.href}
              aria-label={`Retour : ${back.label}`}
              className="tap-target text-indigo -ml-3 inline-flex shrink-0 items-center justify-center rounded-full"
            >
              <ChevronLeft size={24} aria-hidden="true" />
            </Link>
          ) : null}
          <h1
            className={`${back ? 'text-subtitle' : 'text-title'} line-clamp-2 min-w-0 flex-1 break-words`}
          >
            {title}
          </h1>
          {actions ? <div className="-mr-3 flex shrink-0 items-center">{actions}</div> : null}
        </div>
        {header}
      </header>
      <ScrollZone
        key={memoryKey}
        label={zoneLabel ?? (typeof title === 'string' ? title : 'Contenu')}
        memoryKey={memoryKey}
      >
        {children}
      </ScrollZone>
    </main>
  );
}
