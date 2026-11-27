import type { MouseEvent } from 'react';

/** `[etagere]` of the focus route for the « Non rangé » tray. */
export const TRAY_SEGMENT = 'non-range';

/** Route of the focus page of a shelf (or of the tray); the query carries the furniture filters. */
export const focusHref = (locationId: number, shelfId: number | null, query = ''): string =>
  `/inventaire/${locationId}/etagere/${shelfId ?? TRAY_SEGMENT}${query}`;

/** Key of a shelf for the transition: its id, or the tray segment. */
const keyOf = (shelfId: number | null): string => String(shelfId ?? TRAY_SEGMENT);

let focusedKey: string | null = null;
/** True once the focus page was reached from the furniture in this session: back is then `router.back()`. */
let cameFromFurniture = false;
let latest = 0;
const NAME = 'shelf-focus';

export const arrivedFromFurniture = (): boolean => cameFromFurniture;
export const forgetArrival = (): void => {
  cameFromFurniture = false;
};

const canAnimate = (): boolean =>
  typeof document !== 'undefined' &&
  typeof document.startViewTransition === 'function' &&
  !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Soft zoom between a shelf and its focus page (View Transitions, instant when unsupported or
 * with reduced motion). `data-focus-dir` stays on <html> until the latest transition ends.
 * `navigate` starts the navigation; the transition waits for the URL to change, then two frames.
 */
function transition(dir: 'open' | 'close', navigate: () => void): void {
  if (!canAnimate()) {
    navigate();
    return;
  }
  const root = document.documentElement;
  const id = ++latest;
  root.dataset.focusDir = dir;
  const started = document.startViewTransition(
    () =>
      new Promise<void>((resolve) => {
        const before = window.location.href;
        navigate();
        let frames = 0;
        const tick = () => {
          if (window.location.href !== before || ++frames > 40) {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          } else {
            requestAnimationFrame(tick);
          }
        };
        tick();
      }),
  );
  started.finished
    .catch(() => undefined)
    .finally(() => {
      if (latest !== id) return;
      delete root.dataset.focusDir;
      document
        .querySelectorAll<HTMLElement>('[data-shelf-key]')
        .forEach((node) => (node.style.viewTransitionName = ''));
    });
}

/** Click on the « Ouvrir l’étagère » link: the link navigates by itself, the zoom starts from the shelf. */
export function openFocus(event: MouseEvent<HTMLElement>, shelfId: number | null): void {
  focusedKey = keyOf(shelfId);
  if (event.defaultPrevented || event.button !== 0) return;
  // A new tab or window: this page stays where it is.
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  cameFromFurniture = true;
  const shelf = event.currentTarget.closest<HTMLElement>('[data-shelf-key]');
  if (shelf && canAnimate()) shelf.style.viewTransitionName = NAME;
  transition('open', () => undefined);
}

/** Closing from the page: the zone shrinks back to its shelf. */
export function closeFocus(shelfId: number | null, navigate: () => void): void {
  focusedKey = keyOf(shelfId);
  transition('close', navigate);
}

/** Furniture side of the return: the shelf we come from is the target of the zoom. */
export function nameReturnShelf(node: HTMLElement, shelfId: number | null): void {
  if (document.documentElement.dataset.focusDir !== 'close') return;
  if (focusedKey === keyOf(shelfId)) node.style.viewTransitionName = NAME;
}

/** Scroll position of the furniture, kept while the application runs. */
const furnitureScroll = new Map<number, number>();
export const rememberFurnitureScroll = (locationId: number, top: number): void => {
  furnitureScroll.set(locationId, top);
};
export const furnitureScrollOf = (locationId: number): number =>
  furnitureScroll.get(locationId) ?? 0;
