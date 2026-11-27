'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface BottomSheetProps {
  /** `alertdialog` for a confirmation of a rare, structuring action. */
  role?: 'dialog' | 'alertdialog';
  /** Id of the visible title. */
  labelledBy: string;
  /** Id of the text that says what happens (alert dialogs). */
  describedBy?: string;
  onClose: () => void;
  /** Receives the focus at once, before any animation; else the first focusable element. */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Gives the focus back to the element that had it before opening (default). */
  restoreFocus?: boolean;
  /** A tap on the dimmed background closes the sheet (default). */
  closeOnBackdrop?: boolean;
  /** Stacking order: a sheet opened from another sheet goes above it. */
  layer?: 'base' | 'top';
  /** The whole panel scrolls (default); false when the content scrolls a zone of its own. */
  scrollable?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * The bottom sheet of the application (pattern of the product sheet), as a modal dialog: the focus
 * goes inside at once, stays inside (Tab and Maj+Tab go round), Échap closes, and the focus goes
 * back to where it was. It slides up from the bottom; `prefers-reduced-motion` cuts the movement
 * (global rule). The content decides its own buttons.
 */
export function BottomSheet({
  role = 'dialog',
  labelledBy,
  describedBy,
  onClose,
  initialFocus,
  restoreFocus = true,
  closeOnBackdrop = true,
  layer = 'base',
  scrollable = true,
  children,
  className = '',
}: BottomSheetProps) {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  /** Set while the sheet goes away: the focus may then leave it. */
  const closing = useRef(false);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  // Before paint: the focus is in the sheet as soon as it exists, never after its animation.
  useLayoutEffect(() => {
    opener.current = document.activeElement;
    const target =
      initialFocus?.current ??
      panel.current?.querySelector<HTMLElement>(FOCUSABLE) ??
      panel.current;
    target?.focus({ preventScroll: true });
    return () => {
      closing.current = true;
      const back = opener.current;
      if (restoreFocus && back instanceof HTMLElement && back.isConnected) {
        back.focus({ preventScroll: true });
      }
    };
    // The opener is read once, at opening.
  }, []);

  // A focus that escapes (a click outside, a script) is brought back.
  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      const node = panel.current;
      if (closing.current || !node?.isConnected || node.contains(event.target as Node)) return;
      // Only the topmost sheet keeps the focus.
      const sheets = document.querySelectorAll('[data-bottom-sheet]');
      if (sheets[sheets.length - 1] !== node) return;
      node.querySelector<HTMLElement>(FOCUSABLE)?.focus({ preventScroll: true });
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, []);

  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close.current();
      return;
    }
    if (event.key !== 'Tab' || !panel.current) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (item) => !item.closest('[inert]'),
    );
    const first = items[0];
    const last = items.at(-1);
    if (!first || !last) {
      event.preventDefault();
      return;
    }
    if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === panel.current)
    ) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className={`sheet-backdrop bg-ink/30 fixed inset-0 flex items-end ${layer === 'top' ? 'z-50' : 'z-40'}`}
      onClick={closeOnBackdrop ? () => close.current() : undefined}
    >
      <div
        ref={panel}
        data-bottom-sheet=""
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={keyDown}
        className={`sheet-panel rounded-card mx-auto flex max-h-[90dvh] w-full max-w-xl flex-col gap-4 ${scrollable ? 'overflow-y-auto' : 'overflow-hidden'} rounded-b-none bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] outline-none ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
