'use client';

import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { ScrollZone } from './Screen';
import { ListSkeleton } from './Skeleton';

interface FullPageListProps {
  /** The only `h1` of the page. */
  title: string;
  /** Back button (arrow, 44 px, left of the title). Without it: tab variant, title as in `Screen`. */
  onBack?: () => void;
  /** Buttons at the right of the title (44 px each). */
  actions?: ReactNode;
  /** Fixed row under the title (search, sort). */
  toolbar?: ReactNode;
  /** Fixed row under the toolbar. */
  header?: ReactNode;
  /** Content of the scroll zone. */
  children: ReactNode;
  /** Fixed bottom area (primary action); keeps the bottom safe area. */
  footer?: ReactNode;
  /** Shown instead of the children when `isEmpty` is true. */
  emptyState?: ReactNode;
  isEmpty?: boolean;
  /** Skeletons instead of the children. */
  loading?: boolean;
  memoryKey?: string;
  /** Name of the scroll region; the title by default. */
  zoneLabel?: string;
  /** The children draw their own cards: no frame around them. */
  bare?: boolean;
}

/**
 * A full page list: fixed title, toolbar and header, one white card that scrolls, fixed footer.
 * The children are the rows (a `SelectableRow` each); the card draws the frame.
 */
export function FullPageList({
  title,
  onBack,
  actions,
  toolbar,
  header,
  children,
  footer,
  emptyState,
  isEmpty = false,
  loading = false,
  memoryKey,
  zoneLabel,
  bare = false,
}: FullPageListProps) {
  const showEmpty = !loading && isEmpty && emptyState !== undefined;
  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 flex-col gap-2 px-4 pt-3 pb-2">
        <div className="flex min-h-11 items-center gap-1">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              aria-label="Retour"
              className="tap-target text-indigo -ml-3 inline-flex shrink-0 items-center justify-center rounded-full"
            >
              <ChevronLeft size={24} aria-hidden="true" />
            </button>
          ) : null}
          <h1
            className={`${onBack ? 'text-subtitle text-center' : 'text-title'} line-clamp-2 min-w-0 flex-1 break-words`}
          >
            {title}
          </h1>
          {actions ? (
            <div className="-mr-3 flex shrink-0 items-center">{actions}</div>
          ) : onBack ? (
            <span aria-hidden="true" className="size-11 -mr-3 shrink-0" />
          ) : null}
        </div>
        {toolbar}
        {header}
      </header>
      <ScrollZone key={memoryKey} label={zoneLabel ?? title} memoryKey={memoryKey}>
        {loading ? (
          <ListSkeleton rows={6} rowClassName="h-14" />
        ) : showEmpty ? (
          emptyState
        ) : (
          <div
            className={
              bare
                ? 'flex flex-col gap-4'
                : 'border-line rounded-card bg-surface-raised flex flex-col overflow-hidden border'
            }
          >
            {children}
          </div>
        )}
      </ScrollZone>
      {footer ? (
        <footer className="border-line bg-surface shrink-0 border-t px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          {footer}
        </footer>
      ) : null}
    </main>
  );
}
