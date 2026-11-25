'use client';

import {
  MAX_LOCATIONS_PER_HOUSEHOLD,
  type CategoryDto,
  type HomeResponse,
  type LocationDto,
} from '@inventaire/shared';
import { Plus } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../lib/api';
import { fetchHome } from '../../lib/home-api';
import {
  filtersToQuery,
  isFiltering,
  locationMatches,
  useHomeFilters,
} from '../../lib/home-filters';
import { fetchCategories } from '../../lib/stock-api';
import { CreateFurnitureSheet } from '../furniture/CreateFurnitureSheet';
import { Button } from '../ui/Button';
import { Callout } from '../ui/Callout';
import { FurnitureCard, furnitureCardId } from './FurnitureCard';
import { HomeFilters } from './HomeFilters';

interface HomeViewProps {
  /** Test seam. */
  load?: () => Promise<HomeResponse>;
}

/** Search parameter set after a creation elsewhere (screen « Meubles »): focus that new card. */
export const NEW_FURNITURE_PARAM = 'nouveau';

/**
 * The house: one card per piece of furniture, 2 columns on a phone (the page scrolls when there
 * are many) and 4 on a computer, then a last tile to add one. No furniture: a message and a single
 * button. After a creation, the focus goes to the new card and a polite message says it.
 */
export function HomeView({ load = fetchHome }: HomeViewProps) {
  const router = useRouter();
  const params = useSearchParams();
  const [home, setHome] = useState<HomeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [filters, setFilters] = useHomeFilters();
  const [creating, setCreating] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  /** The card to focus once the house is drawn again. */
  const [focusId, setFocusId] = useState<number | null>(() => {
    const fromUrl = Number(params.get(NEW_FURNITURE_PARAM));
    return Number.isInteger(fromUrl) && fromUrl > 0 ? fromUrl : null;
  });
  const loader = useRef(load);

  const reload = useCallback(() => {
    loader
      .current()
      .then((loaded) => {
        setHome(loaded);
        setError(null);
      })
      .catch((caught: unknown) =>
        setError(
          caught instanceof ApiError && caught.status !== 0
            ? caught.message
            : 'Impossible de charger la maison : vérifiez la connexion.',
        ),
      );
  }, []);

  useEffect(() => {
    reload();
    fetchCategories()
      .then(setCategories)
      .catch(() => undefined);
  }, [reload]);

  // Once the new card is drawn: focus it, say it, and forget the parameter of the URL.
  useEffect(() => {
    if (focusId === null || !home) return;
    const location = home.locations.find((l) => l.id === focusId);
    // The house may not be loaded again yet: wait for the card to exist.
    if (!location) return;
    document.getElementById(furnitureCardId(focusId))?.focus();
    setAnnouncement(`Meuble « ${location.name} » ajouté à la maison.`);
    setFocusId(null);
    if (params.has(NEW_FURNITURE_PARAM)) {
      const rest = new URLSearchParams(params);
      rest.delete(NEW_FURNITURE_PARAM);
      const query = rest.toString();
      router.replace(`/inventaire${query ? `?${query}` : ''}`, { scroll: false });
    }
  }, [focusId, home, params, router]);

  const onCreated = (location: LocationDto) => {
    setCreating(false);
    setFocusId(location.id);
    reload();
  };

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
  const atLimit = home.locations.length >= MAX_LOCATIONS_PER_HOUSEHOLD;
  const sheet = creating ? (
    <CreateFurnitureSheet
      existingNames={home.locations.map((l) => l.name)}
      onCreated={onCreated}
      onClose={() => setCreating(false)}
    />
  ) : null;
  const live = (
    <p aria-live="polite" className="sr-only">
      {announcement}
    </p>
  );

  if (home.locations.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {live}
        <section className="border-line rounded-card shadow-card flex flex-col items-start gap-3 border bg-white p-4">
          <h2 className="text-card-title">Aucun meuble pour l’instant</h2>
          <p className="text-body">
            Ajoutez votre garde-manger, votre frigo ou votre cave pour y ranger vos produits.
          </p>
          <Button variant="add" onClick={() => setCreating(true)}>
            <Plus size={20} aria-hidden="true" />
            Ajouter votre premier meuble
          </Button>
        </section>
        {sheet}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {live}
      <header className="rounded-card bg-indigo p-4 text-white">
        <h2 className="text-card-title text-white">Ma maison</h2>
        <p className="text-small text-white">
          {products} {products > 1 ? 'articles' : 'article'} · {units}{' '}
          {units > 1 ? 'unités' : 'unité'}
        </p>
      </header>
      <HomeFilters filters={filters} onChange={setFilters} categories={categories} />
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {home.locations.map((location) => (
          <li key={location.id} className="flex">
            <div className="flex w-full flex-col">
              <FurnitureCard
                location={location}
                query={filtersToQuery(filters)}
                highlighted={isFiltering(filters) && locationMatches(location, filters)}
              />
            </div>
          </li>
        ))}
        <li className="flex">
          {atLimit ? (
            <p className="border-lavender-line rounded-card text-small flex w-full items-center justify-center border-2 border-dashed p-3 text-center">
              {MAX_LOCATIONS_PER_HOUSEHOLD} meubles au plus : la maison est complète.
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="tap-target border-lavender-line rounded-card text-indigo flex w-full flex-col items-center justify-center gap-2 border-2 border-dashed bg-white p-3 font-bold"
            >
              <span
                aria-hidden="true"
                className="bg-lavender text-indigo inline-flex h-11 w-11 items-center justify-center rounded-full"
              >
                <Plus size={22} />
              </span>
              Ajouter un meuble
            </button>
          )}
        </li>
      </ul>
      {sheet}
    </div>
  );
}
