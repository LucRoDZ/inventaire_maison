'use client';

import type { CategoryDto, LocationDto, ProductDetailDto } from '@inventaire/shared';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { MergeProduct } from '../../../../components/product/MergeProduct';
import { MovementList } from '../../../../components/product/MovementList';
import { ProductEdit } from '../../../../components/product/ProductEdit';
import { StockByLocation } from '../../../../components/product/StockByLocation';
import { Callout } from '../../../../components/ui/Callout';
import { Screen } from '../../../../components/ui/Screen';
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
  const router = useRouter();
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
    <Screen
      title={
        state.name === 'ready'
          ? state.product.name
          : state.name === 'missing'
            ? 'Produit introuvable'
            : 'Produit'
      }
      zoneLabel="Fiche du produit"
      back={{ href: '/inventaire', label: 'Inventaire' }}
    >
      {state.name === 'loading' ? (
        <p role="status" className="text-small">
          Chargement…
        </p>
      ) : null}
      {state.name === 'missing' ? (
        <Callout role="note" title="Ce produit n’existe pas">
          Il a peut-être été saisi avec une mauvaise adresse.
        </Callout>
      ) : null}
      {state.name === 'error' ? (
        <Callout role="alert" title="Un instant">
          Impossible de charger le produit : vérifiez la connexion.
        </Callout>
      ) : null}
      {state.name === 'ready' ? (
        <>
          {state.product.barcode ? (
            <p className="text-small">Code-barres : {state.product.barcode}</p>
          ) : null}
          <section aria-labelledby="stock" className="flex flex-col gap-2">
            <h2 id="stock" className="text-card-title">
              En stock
            </h2>
            <StockByLocation stock={state.product.stock} />
          </section>
          <section aria-labelledby="modifier" className="flex flex-col gap-2">
            <h2 id="modifier" className="text-card-title">
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
          <section aria-labelledby="doublon" className="flex flex-col items-start gap-2">
            <h2 id="doublon" className="text-card-title">
              Doublon
            </h2>
            <p className="text-small">
              Ce produit existe deux fois dans le catalogue ? Fusionnez-le avec l’autre.
            </p>
            <MergeProduct
              product={state.product}
              onMerged={(result) => router.replace(`/produits/${result.kept.id}`)}
            />
          </section>
          <section aria-labelledby="historique" className="flex flex-col gap-2">
            <h2 id="historique" className="text-card-title">
              Historique
            </h2>
            <MovementList key={version} productId={state.product.id} />
          </section>
        </>
      ) : null}
    </Screen>
  );
}
