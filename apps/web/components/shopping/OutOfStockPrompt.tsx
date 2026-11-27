'use client';

import type { ShoppingItemCreateInput, ShoppingItemDto } from '@inventaire/shared';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ApiError } from '../../lib/api';
import { queueOp } from '../../lib/offline/runtime';
import type { NewSyncOp } from '../../lib/offline/queue';
import { addShoppingItem } from '../../lib/shopping-api';
import { outOfStockStore, type OutOfStockInvite } from '../../lib/zero-stock';

export const OUT_OF_STOCK_DURATION_MS = 8000;
const RESULT_DURATION_MS = 3000;

interface OutOfStockPromptProps {
  /** Test seams. */
  api?: {
    add?: (input: ShoppingItemCreateInput) => Promise<ShoppingItemDto>;
    queue?: (op: NewSyncOp) => Promise<unknown>;
  };
}

/**
 * Non-blocking invitation after the last unit of a product left the household: « Ajouter » puts it
 * on the shopping list (through the offline queue when the network is out). Mounted once per
 * layout; the content comes only from the store, fed by answers of the API.
 */
export function OutOfStockPrompt({ api = {} }: OutOfStockPromptProps) {
  const invite = useSyncExternalStore(outOfStockStore.subscribe, outOfStockStore.get, () => null);
  if (!invite) return null;
  // A new product gets a fresh state and a fresh delay.
  return <Prompt key={`${invite.productId}:${invite.name}`} invite={invite} api={api} />;
}

function Prompt({
  invite,
  api,
}: {
  invite: OutOfStockInvite;
  api: NonNullable<OutOfStockPromptProps['api']>;
}) {
  const [result, setResult] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    if (paused && result === null) return;
    const timer = setTimeout(
      () => outOfStockStore.dismissFor(invite.productId),
      result === null ? OUT_OF_STOCK_DURATION_MS : RESULT_DURATION_MS,
    );
    return () => clearTimeout(timer);
  }, [paused, result, invite.productId]);

  const add = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const input = { productId: invite.productId, quantity: invite.quantity };
    try {
      if (!navigator.onLine) throw new ApiError(0, 'Hors connexion');
      await (api.add ?? addShoppingItem)({ ...input, ifAbsent: true });
      setResult('Ajouté aux courses');
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setResult('Déjà dans vos courses');
      } else if (error instanceof ApiError && error.status === 0) {
        try {
          await (api.queue ?? queueOp)({ kind: 'shop', ...input });
          setResult('Ajouté aux courses à la reconnexion');
        } catch {
          setResult('Ajout impossible : réessayez depuis les courses.');
        }
      } else {
        setResult('Ajout impossible : réessayez depuis les courses.');
      }
    }
    setBusy(false);
  };

  return (
    <div
      role="status"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="rounded-card shadow-card bg-indigo fixed inset-x-4 bottom-[calc(9rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-xl flex-col gap-2 p-4 text-white"
    >
      {result === null ? (
        <>
          <p>{`Plus de ${invite.name}, l’ajouter aux courses ?`}</p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => outOfStockStore.dismissFor(invite.productId)}
              className="tap-target px-3 font-semibold text-white underline underline-offset-4"
            >
              Non merci
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void add()}
              className="tap-target bg-amber text-indigo rounded-xl px-4 font-semibold disabled:opacity-50"
            >
              Ajouter
            </button>
          </div>
        </>
      ) : (
        <p>{result}</p>
      )}
    </div>
  );
}
