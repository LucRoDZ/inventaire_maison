'use client';

import type { CategoryDto, LocationDto, ProductDetailDto } from '@inventaire/shared';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { MovementList } from '../../../../components/product/MovementList';
import { ProductEdit } from '../../../../components/product/ProductEdit';
import { StockByLocation } from '../../../../components/product/StockByLocation';
import { Callout } from '../../../../components/ui/Callout';
import { ApiError } from '../../../../lib/api';
import { getProduct } from '../../../../lib/products-api';
import { fetchCategories, fetchLocations } from '../../../../lib/stock-api';

type State =
  | { name: 'loading' }
  | { name: 'missing' }
  | { name: 'error' }
  | { name: 'ready'; product: ProductDetailDto };

export default function ProduitPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<State>({ name: 'loading' });
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [locations, setLocations] = useState<LocationDto[]>([]);
  const [version, setVersion] = useState(0);

  const load = useCallback(async () => {
    if (!/^\d{1,10}$/.test(id)) {
      setState({ name: 'missing' });
      return;
    }
    try {
      setState({ name: 'ready', product: await getProduct(Number(id)) });
    } catch (error) {
      setState(
        error instanceof ApiError && error.status === 404 ? { name: 'missing' } : { name: 'error' },
      );
    }
  }, [id]);

  useEffect(() => {
    void load();
    fetchCategories()
      .then(setCategories)
      .catch(() => undefined);
    fetchLocations()
      .then(setLocations)
      .catch(() => undefined);
  }, [load]);

  return (
    <main className="flex flex-col gap-4">
      <Link
        href="/inventaire"
        className="tap-target text-indigo-mid inline-flex items-center gap-1 font-bold"
      >
        <ChevronLeft size={18} aria-hidden="true" />
        Inventaire
      </Link>
      {state.name === 'loading' ? (
        <p role="status" className="text-small">
          Chargement…
        </p>
      ) : null}
      {state.name === 'missing' ? (
        <>
          <h1 className="text-title">Produit introuvable</h1>
          <Callout role="note" title="Ce produit n’existe pas">
            Il a peut-être été saisi avec une mauvaise adresse.
          </Callout>
        </>
      ) : null}
      {state.name === 'error' ? (
        <Callout role="alert" title="Un instant">
          Impossible de charger le produit : vérifiez la connexion.
        </Callout>
      ) : null}
      {state.name === 'ready' ? (
        <>
          <h1 className="text-title">{state.product.name}</h1>
          {state.product.barcode ? (
            <p className="text-small">Code-barres : {state.product.barcode}</p>
          ) : null}
          <section aria-labelledby="stock" className="flex flex-col gap-2">
            <h2 id="stock" className="text-label">
              En stock
            </h2>
            <StockByLocation stock={state.product.stock} />
          </section>
          <section aria-labelledby="modifier" className="flex flex-col gap-2">
            <h2 id="modifier" className="text-label">
              Modifier
            </h2>
            {categories.length > 0 && locations.length > 0 ? (
              <ProductEdit
                key={state.product.id}
                product={state.product}
                categories={categories}
                locations={locations}
                onSaved={() => {
                  void load();
                  setVersion((v) => v + 1);
                }}
              />
            ) : (
              <p role="status" className="text-small">
                Chargement…
              </p>
            )}
          </section>
          <section aria-labelledby="historique" className="flex flex-col gap-2">
            <h2 id="historique" className="text-label">
              Historique
            </h2>
            <MovementList key={version} productId={state.product.id} />
          </section>
        </>
      ) : null}
    </main>
  );
}
