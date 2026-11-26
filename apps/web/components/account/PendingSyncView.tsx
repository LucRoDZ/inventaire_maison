'use client';

import type { ProductDto } from '@inventaire/shared';
import { useCallback, useEffect, useState } from 'react';
import { fetchScan } from '../../lib/scan-flow';
import {
  conflictMessage,
  getQueue,
  syncNow,
  usePendingCount,
  type QueuedOp,
  type UnknownBarcode,
} from '../../lib/offline';
import { useOnline } from '../../lib/online';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

type Review =
  | { code: string; kind: 'product'; product: ProductDto }
  | { code: string; kind: 'unknown' }
  | { code: string; kind: 'error'; message: string };

const describeOp = (item: QueuedOp): string =>
  item.op.kind === 'add'
    ? `Ajout de ${item.op.quantity} unité(s), produit n° ${item.op.productId}`
    : `Retrait de ${item.op.quantity} unité(s), produit n° ${item.op.productId}`;

/** The waiting operations: retry or abandon each one, and identify the codes scanned offline. */
export function PendingSyncView() {
  const online = useOnline();
  const count = usePendingCount();
  const [ops, setOps] = useState<QueuedOp[]>([]);
  const [unknown, setUnknown] = useState<UnknownBarcode[]>([]);
  const [review, setReview] = useState<Review | null>(null);

  const load = useCallback(async () => {
    const queue = getQueue();
    setOps(await queue.list());
    setUnknown(await queue.listUnknown());
  }, []);

  // `count` changes with every change of the queue.
  useEffect(() => {
    void load();
  }, [load, count]);

  const identify = async (code: string) => {
    try {
      const response = await fetchScan(code);
      setReview(
        response.status === 'unknown'
          ? { code, kind: 'unknown' }
          : { code, kind: 'product', product: response.product },
      );
    } catch {
      setReview({ code, kind: 'error', message: 'Impossible de joindre le serveur, réessayez.' });
    }
  };

  const confirm = async (product: ProductDto, code: string) => {
    const queue = getQueue();
    await queue.queueOp({ kind: 'add', productId: product.id, quantity: 1 });
    await queue.dropUnknown(code);
    setReview(null);
    await syncNow();
  };

  if (count === 0) {
    return <p className="text-grey">Rien à synchroniser.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {!online ? (
        <p role="status" className="text-small text-grey">
          Hors ligne : les opérations partiront dès le retour de la connexion.
        </p>
      ) : null}

      {ops.length > 0 ? (
        <section aria-labelledby="pending-ops" className="flex flex-col gap-2">
          <h2 id="pending-ops" className="text-card-title">
            Opérations
          </h2>
          <ul className="flex flex-col gap-2">
            {ops.map((item) => (
              <li key={item.seq}>
                <Card className="flex flex-col gap-2 p-4">
                  <p className="font-semibold">{describeOp(item)}</p>
                  <p className="text-small text-grey">
                    {item.status === 'failed'
                      ? conflictMessage(item)
                      : 'En attente de synchronisation.'}
                  </p>
                  {item.status === 'failed' ? (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={async () => {
                          await getQueue().retry(item.seq);
                          await syncNow();
                        }}
                      >
                        Réessayer
                      </Button>
                      <Button variant="secondary" onClick={() => getQueue().abandon(item.seq)}>
                        Abandonner
                      </Button>
                    </div>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {unknown.length > 0 ? (
        <section aria-labelledby="pending-unknown" className="flex flex-col gap-2">
          <h2 id="pending-unknown" className="text-card-title">
            Codes à identifier
          </h2>
          <ul className="flex flex-col gap-2">
            {unknown.map((item) => (
              <li key={item.code}>
                <Card className="flex flex-col gap-2 p-4">
                  <p className="font-semibold">{item.code}</p>
                  {review?.code === item.code ? (
                    <ReviewBlock
                      review={review}
                      onConfirm={(product) => confirm(product, item.code)}
                      onCancel={() => setReview(null)}
                    />
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        disabled={!online}
                        onClick={() => identify(item.code)}
                      >
                        Identifier
                      </Button>
                      <Button variant="secondary" onClick={() => getQueue().dropUnknown(item.code)}>
                        Abandonner
                      </Button>
                    </div>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function ReviewBlock({
  review,
  onConfirm,
  onCancel,
}: {
  review: Review;
  onConfirm: (product: ProductDto) => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {review.kind === 'product' ? (
        <>
          <p>
            Produit trouvé : <strong>{review.product.name}</strong>. Vérifiez avant de l’ajouter au
            stock (1 unité, lieu habituel).
          </p>
          <div className="flex gap-2">
            <Button onClick={() => onConfirm(review.product)}>Ajouter au stock</Button>
            <Button variant="secondary" onClick={onCancel}>
              Annuler
            </Button>
          </div>
        </>
      ) : (
        <>
          <p role={review.kind === 'error' ? 'alert' : undefined}>
            {review.kind === 'error'
              ? review.message
              : 'Ce code n’est pas au catalogue. Scannez-le depuis l’écran Scanner pour créer le produit.'}
          </p>
          <Button variant="secondary" onClick={onCancel}>
            Fermer
          </Button>
        </>
      )}
    </div>
  );
}
