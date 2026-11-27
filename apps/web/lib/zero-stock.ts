/** What a removal answer must say for the out-of-stock prompt to be worth showing. */
export interface RemovalAnswer {
  productTotal: number;
  onShoppingList: boolean;
}

export interface OutOfStockInvite {
  productId: number;
  name: string;
  quantity: number;
}

/**
 * The invitation « Plus de X, l'ajouter aux courses ? »: only when the last unit left the whole
 * household and the product has no line on the list yet (automatic threshold line included).
 */
export function outOfStockInvite(
  response: RemovalAnswer | null | undefined,
  product: { id: number; name: string; usualQuantity?: number | null },
): OutOfStockInvite | null {
  if (!response || response.productTotal !== 0 || response.onShoppingList) return null;
  const usual = product.usualQuantity;
  return {
    productId: product.id,
    name: product.name,
    quantity: usual && usual > 0 ? usual : 1,
  };
}

type Listener = () => void;

let current: OutOfStockInvite | null = null;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((listener) => listener());

/** One invitation at a time: a new one replaces the one on screen. */
export const outOfStockStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get: (): OutOfStockInvite | null => current,
  show(invite: OutOfStockInvite): void {
    current = invite;
    emit();
  },
  /** The removal was undone: the invitation about that product goes away. */
  dismissFor(productId: number): void {
    if (current?.productId !== productId) return;
    current = null;
    emit();
  },
  clear(): void {
    if (current === null) return;
    current = null;
    emit();
  },
};

/** Shows the invitation if the answer of the server calls for it. Returns whether it did. */
export function inviteAfterRemoval(
  response: RemovalAnswer | null | undefined,
  product: { id: number; name: string; usualQuantity?: number | null },
): boolean {
  const invite = outOfStockInvite(response, product);
  if (invite) outOfStockStore.show(invite);
  return invite !== null;
}
