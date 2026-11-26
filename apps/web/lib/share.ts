import type { ShoppingItemDto } from '@inventaire/shared';
import { shoppingQuantityText } from './shopping-api';

/** The open lines of the list as plain text, one per line, ready for a message. */
export function shoppingShareText(items: ShoppingItemDto[]): string {
  const lines = items
    .filter((item) => !item.checked)
    .map(
      (item) => `- ${item.product?.name ?? item.label ?? 'Article'} ${shoppingQuantityText(item)}`,
    );
  return ['Liste de courses', ...lines].join('\n');
}

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

/**
 * Shares a text with the system sheet when there is one (Web Share), else copies it to the
 * clipboard. The person closing the sheet is not an error.
 */
export async function shareText(title: string, text: string): Promise<ShareOutcome> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text });
      return 'shared';
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return 'cancelled';
      // Any other refusal: fall back to the clipboard below.
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
