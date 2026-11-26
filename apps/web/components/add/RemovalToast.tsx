'use client';

import type { RemovalReason, StockAdjustInput, StockAdjustResponse } from '@inventaire/shared';
import { useState } from 'react';
import { ApiError } from '../../lib/api';
import { adjustStock } from '../../lib/stock-api';
import { UndoToast } from './UndoToast';

/** What a removal touched: enough to put the units back, or to record them as thrown away. */
export interface RemovalPlan {
  productId: number;
  locationId: number;
  shelfId: number | null;
  expiryDate: string | null;
  name: string;
  units: number;
  /** « Frigo »: where the units came from, said in the message. */
  place?: string;
}

interface RemovalToastProps {
  plan: RemovalPlan;
  /** The reason already recorded (« Consommé » by default). */
  reason?: RemovalReason;
  /** Called after any change made from the toast (undo, thrown away): reload what depends on it. */
  onChanged?: () => void;
  /** The toast is over (expired, undone or failed). */
  onClose: () => void;
  onError?: (message: string) => void;
  adjust?: (input: StockAdjustInput) => Promise<StockAdjustResponse>;
}

const REASON_TEXT: Record<RemovalReason, string> = { consumed: 'Consommé', wasted: 'Jeté' };

const failure = (error: unknown) =>
  error instanceof ApiError && error.status !== 0
    ? error.message
    : 'Modification impossible : vérifiez la connexion.';

/**
 * Confirmation of a removal for 5 s. « Consommé » is what was recorded; « Jeté » is the visible
 * second choice (the units are put back by a correction, then removed again as thrown away);
 * « Annuler » puts them back.
 */
export function RemovalToast({
  plan,
  reason: initial = 'consumed',
  onChanged,
  onClose,
  onError,
  adjust = adjustStock,
}: RemovalToastProps) {
  const [reason, setReason] = useState<RemovalReason>(initial);
  const key = {
    productId: plan.productId,
    locationId: plan.locationId,
    shelfId: plan.shelfId,
    expiryDate: plan.expiryDate,
  };

  const putBack = () => adjust({ ...key, delta: plan.units, reason: 'correction' });

  const undo = async () => {
    try {
      await putBack();
      onChanged?.();
    } catch (error) {
      onError?.(failure(error));
    }
    onClose();
  };

  const throwAway = async () => {
    try {
      await putBack();
      await adjust({ ...key, delta: -plan.units, reason: 'wasted' });
      setReason('wasted');
    } catch (error) {
      onError?.(failure(error));
      onClose();
    }
    onChanged?.();
  };

  return (
    <UndoToast
      message={`${REASON_TEXT[reason]} : ${plan.units} × ${plan.name}${plan.place ? `, ${plan.place}` : ''}`}
      onUndo={() => void undo()}
      onExpire={onClose}
      secondary={
        reason === 'consumed' ? { label: 'Jeté', onClick: () => void throwAway() } : undefined
      }
    />
  );
}
