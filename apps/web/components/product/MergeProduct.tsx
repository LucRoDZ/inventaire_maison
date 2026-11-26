'use client';

import type { ProductDto, ProductMergeResponse } from '@inventaire/shared';
import { useId, useState } from 'react';
import { ApiError } from '../../lib/api';
import { mergeProduct } from '../../lib/products-api';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { Callout } from '../ui/Callout';
import { ProductPicker } from './ProductPicker';

interface MergeProductProps {
  product: Pick<ProductDto, 'id' | 'name'>;
  /** Merged: the screen goes to the kept product. */
  onMerged: (result: ProductMergeResponse) => void;
  /** Test seams. */
  api?: {
    merge?: (id: number, intoProductId: number) => Promise<ProductMergeResponse>;
    search?: (query: string) => Promise<ProductDto[]>;
  };
}

type Step = { name: 'idle' } | { name: 'pick' } | { name: 'confirm'; target: ProductDto };

/**
 * « Fusionner avec… »: for two catalogue entries that are the same product. The person picks the
 * product to keep, then reads what will be merged before confirming (it cannot be undone).
 */
export function MergeProduct({ product, onMerged, api = {} }: MergeProductProps) {
  const [step, setStep] = useState<Step>({ name: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const titleId = useId();
  const descId = useId();

  const confirm = async (target: ProductDto) => {
    setBusy(true);
    setError(null);
    try {
      const result = await (api.merge ?? mergeProduct)(product.id, target.id);
      setStep({ name: 'idle' });
      onMerged(result);
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status !== 0
          ? caught.message
          : 'Fusion impossible : vérifiez la connexion.',
      );
    }
    setBusy(false);
  };

  return (
    <>
      <Button variant="outline" onClick={() => setStep({ name: 'pick' })}>
        Fusionner avec…
      </Button>
      {step.name === 'pick' ? (
        <ProductPicker
          title="Fusionner avec quel produit ?"
          help={`Choisissez le produit à garder : « ${product.name} » sera fusionné dedans.`}
          excludeId={product.id}
          search={api.search}
          onPick={(target) => setStep({ name: 'confirm', target })}
          onClose={() => setStep({ name: 'idle' })}
        />
      ) : null}
      {step.name === 'confirm' ? (
        <BottomSheet
          role="alertdialog"
          labelledBy={titleId}
          describedBy={descId}
          onClose={() => setStep({ name: 'idle' })}
          layer="top"
        >
          <h2 id={titleId} className="text-card-title">
            Fusionner ces deux produits ?
          </h2>
          <p id={descId} className="text-body">
            Le stock et les lignes de courses de « {product.name} » passent à « {step.target.name}{' '}
            ». « {product.name} » disparaît du catalogue ; son journal d’origine est conservé. Cette
            action ne se défait pas.
          </p>
          {error ? (
            <Callout role="alert" title="Un instant">
              {error}
            </Callout>
          ) : null}
          <Button disabled={busy} onClick={() => void confirm(step.target)}>
            Fusionner dans « {step.target.name} »
          </Button>
          <Button variant="secondary" onClick={() => setStep({ name: 'pick' })}>
            Choisir un autre produit
          </Button>
        </BottomSheet>
      ) : null}
    </>
  );
}
