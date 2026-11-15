'use client';

import type { CategoryDto, ProductDto } from '@inventaire/shared';
import { useState } from 'react';
import { ApiError } from '../../lib/api';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { categoryIcon } from '../ui/CategoryIcon';

interface ReviewCardProps {
  product: ProductDto;
  categories: CategoryDto[];
  /** Resolves once the category is saved; the parent then removes the card. */
  onClassify: (product: ProductDto, categoryId: number) => Promise<void>;
}

/** One product to classify: confirm the proposed category or pick another in one tap. */
export function ReviewCard({ product, categories, onClassify }: ReviewCardProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = categories.find((category) => category.id === product.categoryId);
  const Icon = categoryIcon(current?.icon ?? 'package');

  const classify = async (categoryId: number) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onClassify(product, categoryId);
    } catch (e) {
      setBusy(false);
      setError(
        e instanceof ApiError && e.status !== 0
          ? e.message
          : 'Classement impossible : vérifiez la connexion.',
      );
    }
  };

  return (
    <Card aria-label={product.name} className="flex flex-col gap-3">
      <>
        <div className="flex items-center gap-3">
          <Icon size={28} aria-hidden="true" className="text-indigo-mid" />
          <div className="min-w-0">
            <h2 className="text-body truncate font-bold">{product.name}</h2>
            {product.brand ? <p className="text-small">{product.brand}</p> : null}
          </div>
        </div>
        <p className="text-small">
          {product.categoryGuessed ? 'Catégorie proposée : ' : 'Catégorie actuelle : '}
          <strong>{current?.name ?? 'Inconnue'}</strong>
        </p>
        <Button
          variant="add"
          disabled={busy || !current}
          onClick={() => void classify(product.categoryId)}
          aria-label={`Confirmer ${current?.name ?? ''} pour ${product.name}`}
        >
          Confirmer
        </Button>
        <div
          role="group"
          aria-label={`Autre catégorie pour ${product.name}`}
          className="flex flex-wrap gap-2"
        >
          {categories
            .filter((category) => category.id !== product.categoryId)
            .map((category) => (
              <button
                key={category.id}
                type="button"
                disabled={busy}
                onClick={() => void classify(category.id)}
                className="tap-target bg-lavender text-indigo rounded-full px-3 disabled:opacity-50"
              >
                {category.name}
              </button>
            ))}
        </div>
        {error ? (
          <p role="alert" className="text-small text-alert">
            {error}
          </p>
        ) : null}
      </>
    </Card>
  );
}
