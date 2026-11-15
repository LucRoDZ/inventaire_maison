'use client';

import type { MovementHistoryItemDto, MovementHistoryResponse } from '@inventaire/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { describeMovement } from '../../lib/movement-labels';
import { fetchMovements } from '../../lib/products-api';
import { Button } from '../ui/Button';
import { Callout } from '../ui/Callout';

interface MovementListProps {
  productId: number;
  /** Test seam. */
  load?: (productId: number, cursor: string | null) => Promise<MovementHistoryResponse>;
}

/** The history of the product, newest first, loaded page by page: who, how many, where, why, when. */
export function MovementList({
  productId,
  load = (id, cursor) => fetchMovements(id, { cursor }),
}: MovementListProps) {
  const loader = useRef(load);
  const [items, setItems] = useState<MovementHistoryItemDto[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const page = useCallback(
    async (cursor: string | null) => {
      setBusy(true);
      setFailed(false);
      try {
        const response = await loader.current(productId, cursor);
        setItems((current) => (cursor ? [...(current ?? []), ...response.items] : response.items));
        setNext(response.nextCursor);
      } catch {
        setFailed(true);
      } finally {
        setBusy(false);
      }
    },
    [productId],
  );

  useEffect(() => {
    void page(null);
  }, [page]);

  if (items === null && !failed) {
    return (
      <p role="status" className="text-small">
        Chargement de l’historique…
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {items?.length === 0 ? <p className="text-body">Aucun mouvement pour l’instant.</p> : null}
      <ol className="flex flex-col gap-2">
        {items?.map((item) => {
          const sentence = describeMovement(item);
          return (
            <li key={item.id} className="border-line rounded-xl border bg-white p-3">
              <p className="text-body text-ink">{sentence.headline}</p>
              <p className="text-small">{sentence.detail}</p>
            </li>
          );
        })}
      </ol>
      {failed ? (
        <Callout role="alert" title="Historique indisponible">
          Impossible de charger l’historique : vérifiez la connexion.
        </Callout>
      ) : null}
      {next || failed ? (
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => void page(failed ? (next ?? null) : next)}
        >
          {failed ? 'Réessayer' : 'Voir plus'}
        </Button>
      ) : null}
    </div>
  );
}
