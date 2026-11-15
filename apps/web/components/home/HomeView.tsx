'use client';

import type { HomeResponse } from '@inventaire/shared';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../lib/api';
import { fetchHome } from '../../lib/home-api';
import { Callout } from '../ui/Callout';
import { FurnitureCard } from './FurnitureCard';

interface HomeViewProps {
  /** Test seam. */
  load?: () => Promise<HomeResponse>;
}

/** The house: one card per piece of furniture, 2 columns on a phone and 4 on a computer. */
export function HomeView({ load = fetchHome }: HomeViewProps) {
  const [home, setHome] = useState<HomeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loader = useRef(load);

  useEffect(() => {
    loader
      .current()
      .then(setHome)
      .catch((caught: unknown) =>
        setError(
          caught instanceof ApiError && caught.status !== 0
            ? caught.message
            : 'Impossible de charger la maison : vérifiez la connexion.',
        ),
      );
  }, []);

  if (error) {
    return (
      <Callout role="alert" title="Un instant">
        {error}
      </Callout>
    );
  }
  if (!home) {
    return (
      <p role="status" className="text-small">
        Chargement…
      </p>
    );
  }

  const products = home.locations.reduce((sum, l) => sum + l.counts.products, 0);
  const units = home.locations.reduce((sum, l) => sum + l.counts.units, 0);
  return (
    <div className="flex flex-col gap-4">
      <header className="rounded-card bg-indigo p-4 text-white">
        <h2 className="text-card-title text-white">Ma maison</h2>
        <p className="text-small text-white">
          {products} {products > 1 ? 'articles' : 'article'} · {units}{' '}
          {units > 1 ? 'unités' : 'unité'}
        </p>
      </header>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {home.locations.map((location) => (
          <li key={location.id} className="flex">
            <div className="flex w-full flex-col">
              <FurnitureCard location={location} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
