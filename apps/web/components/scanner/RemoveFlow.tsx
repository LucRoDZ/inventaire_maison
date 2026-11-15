'use client';

import type {
  ScanResponse,
  StockAdjustInput,
  StockAdjustResponse,
  StockRemoveResponse,
} from '@inventaire/shared';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../lib/api';
import { useOnline } from '../../lib/online';
import { fetchScan, OFFLINE_MESSAGE, resolveScan } from '../../lib/scan-flow';
import type { ScanResult } from '../../lib/scanner/types';
import { adjustStock, removeOne } from '../../lib/stock-api';
import { UndoToast } from '../add/UndoToast';
import { Button } from '../ui/Button';
import { Callout } from '../ui/Callout';

/** One code read in removal mode; `id` changes for every read, even of the same code. */
export interface RemoveRequest {
  id: number;
  result: ScanResult;
}

interface RemoveFlowProps {
  request: RemoveRequest | null;
  /** « Produit inconnu »: the user may switch to the add mode with that code. */
  onSwitchToAdd: (result: ScanResult) => void;
  /** Test seams. */
  api?: {
    fetchScan?: (code: string, options?: { catalogOnly?: boolean }) => Promise<ScanResponse>;
    removeOne?: (productId: number) => Promise<StockRemoveResponse>;
    adjust?: (input: StockAdjustInput) => Promise<StockAdjustResponse>;
  };
}

type Feedback =
  | { kind: 'removed'; message: string; undo: () => Promise<unknown> }
  | { kind: 'not_in_stock'; name: string }
  | { kind: 'unknown'; result: ScanResult }
  | { kind: 'problem'; title: string; text: string };

/**
 * Removal mode: a scanned code takes one unit out of stock. It never creates a product: the
 * lookup is catalog-only, an unknown code only proposes to switch to the add mode.
 */
export function RemoveFlow({ request, onSwitchToAdd, api = {} }: RemoveFlowProps) {
  const online = useOnline();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const handled = useRef<number | null>(null);
  const onlineRef = useRef(online);
  const apiRef = useRef(api);
  useEffect(() => {
    onlineRef.current = online;
    apiRef.current = api;
  });

  useEffect(() => {
    if (!request || handled.current === request.id) return;
    handled.current = request.id;
    setFeedback(null);
    const { result } = request;
    const seams = apiRef.current;
    const remove = seams.removeOne ?? removeOne;
    const adjust = seams.adjust ?? adjustStock;

    void (async () => {
      const outcome = await resolveScan(result.code, result.format, {
        online: onlineRef.current,
        fetchScan: seams.fetchScan ?? fetchScan,
        catalogOnly: true,
      });
      switch (outcome.kind) {
        case 'invalid':
          return setFeedback({ kind: 'problem', title: 'Code invalide', text: outcome.message });
        case 'offline':
          return setFeedback({
            kind: 'problem',
            title: OFFLINE_MESSAGE,
            text: 'Le retrait est indisponible hors connexion.',
          });
        case 'error':
          return setFeedback({
            kind: 'problem',
            title: 'Retrait impossible',
            text: outcome.message,
          });
        case 'unknown':
          return setFeedback({ kind: 'unknown', result });
        case 'product':
          break;
      }
      try {
        const done = await remove(outcome.product.id);
        const { movement } = done;
        setFeedback({
          kind: 'removed',
          message: `Retiré : 1 × ${done.product.name}, ${done.location.name}`,
          undo: () =>
            adjust({
              productId: movement.productId,
              locationId: movement.locationId,
              shelfId: movement.shelfId,
              expiryDate: movement.expiryDate,
              delta: 1,
              reason: 'correction',
            }),
        });
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          setFeedback({ kind: 'not_in_stock', name: outcome.product.name });
        } else {
          setFeedback({
            kind: 'problem',
            title: 'Retrait impossible',
            text:
              error instanceof ApiError && error.status !== 0
                ? error.message
                : 'Vérifiez la connexion et réessayez.',
          });
        }
      }
    })();
  }, [request]);

  const undo = async () => {
    const current = feedback;
    setFeedback(null);
    if (current?.kind !== 'removed') return;
    try {
      await current.undo();
    } catch (error) {
      setFeedback({
        kind: 'problem',
        title: 'Annulation impossible',
        text: error instanceof ApiError && error.status !== 0 ? error.message : 'Réessayez.',
      });
    }
  };

  if (!feedback) return null;
  switch (feedback.kind) {
    case 'removed':
      return (
        <UndoToast
          message={feedback.message}
          onUndo={() => void undo()}
          onExpire={() => setFeedback(null)}
        />
      );
    case 'not_in_stock':
      return (
        <Callout role="alert" title="Pas en stock">
          {feedback.name} n’est pas en stock : rien n’a été retiré.
        </Callout>
      );
    case 'unknown':
      return (
        <div className="flex flex-col gap-3">
          <Callout role="alert" title="Produit inconnu">
            Ce code n’est pas au catalogue. Rien n’a été créé.
          </Callout>
          <Button
            variant="add"
            className="self-start"
            onClick={() => onSwitchToAdd(feedback.result)}
          >
            Passer en mode Ajouter
          </Button>
        </div>
      );
    case 'problem':
      return (
        <Callout role="alert" title={feedback.title}>
          {feedback.text}
        </Callout>
      );
  }
}
