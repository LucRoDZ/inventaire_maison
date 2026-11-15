'use client';

import type { CategoryDto, ProductDto } from '@inventaire/shared';
import { useEffect, useState } from 'react';
import { ReviewCard } from '../../../components/review/ReviewCard';
import { Callout } from '../../../components/ui/Callout';
import { apiFetch } from '../../../lib/api';
import { setReviewCount } from '../../../lib/review-count';
import { fetchCategories, updateProductCategory } from '../../../lib/stock-api';

type State =
  | { name: 'loading' }
  | { name: 'error' }
  | { name: 'ready'; items: ProductDto[]; categories: CategoryDto[] };

export default function AClasserPage() {
  const [state, setState] = useState<State>({ name: 'loading' });

  useEffect(() => {
    let alive = true;
    Promise.all([apiFetch<ProductDto[]>('/products?needsReview=true&limit=100'), fetchCategories()])
      .then(([items, categories]) => {
        if (!alive) return;
        setState({ name: 'ready', items, categories });
        setReviewCount(items.length);
      })
      .catch(() => alive && setState({ name: 'error' }));
    return () => {
      alive = false;
    };
  }, []);

  const classify = async (product: ProductDto, categoryId: number) => {
    await updateProductCategory(product.id, categoryId);
    setState((previous) => {
      if (previous.name !== 'ready') return previous;
      const items = previous.items.filter((item) => item.id !== product.id);
      setReviewCount(items.length);
      return { ...previous, items };
    });
  };

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-title">À classer</h1>
      {state.name === 'loading' ? (
        <p role="status" className="text-small">
          Chargement…
        </p>
      ) : null}
      {state.name === 'error' ? (
        <Callout role="alert" title="Un instant">
          Impossible de charger la liste : vérifiez la connexion.
        </Callout>
      ) : null}
      {state.name === 'ready' && state.items.length === 0 ? (
        <Callout role="status" title="Tout est classé">
          Aucun produit en stock n’attend de catégorie.
        </Callout>
      ) : null}
      {state.name === 'ready'
        ? state.items.map((product) => (
            <ReviewCard
              key={product.id}
              product={product}
              categories={state.categories}
              onClassify={classify}
            />
          ))
        : null}
    </main>
  );
}
