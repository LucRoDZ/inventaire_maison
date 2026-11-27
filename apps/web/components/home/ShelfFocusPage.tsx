'use client';

import type {
  CategoryDto,
  HomeLocationDto,
  HomeResponse,
  HomeTileDto,
  LocationDto,
} from '@inventaire/shared';
import { ChevronLeft, Plus } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { fetchHome } from '../../lib/home-api';
import {
  filtersToQuery,
  isFiltering,
  tileMatches,
  useHomeFilters,
  withKnownFilters,
} from '../../lib/home-filters';
import {
  TRAY_SEGMENT,
  arrivedFromFurniture,
  closeFocus,
  forgetArrival,
} from '../../lib/shelf-focus';
import { fetchCategories, fetchLocations } from '../../lib/stock-api';
import { Button } from '../ui/Button';
import { Callout } from '../ui/Callout';
import { ErrorMessage } from '../ui/ErrorMessage';
import { ProductSheet } from './ProductSheet';
import { ProductTile } from './ProductTile';
import { scanHref } from './ShelfRow';

/** The shelf (or the tray) of the URL, among the furniture's. */
function pickShelf(location: HomeLocationDto, segment: string) {
  if (segment === TRAY_SEGMENT) {
    return { id: null, name: 'Non rangé', tiles: location.unshelved };
  }
  const shelf = location.shelves.find((s) => String(s.id) === segment);
  return shelf ? { id: shelf.id, name: shelf.name, tiles: shelf.tiles } : null;
}

function ShelfFocus() {
  const { lieu, etagere } = useParams<{ lieu: string; etagere: string }>();
  const router = useRouter();
  const [urlFilters] = useHomeFilters();
  const [home, setHome] = useState<HomeResponse | null>(null);
  const [locations, setLocations] = useState<LocationDto[]>([]);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<HomeTileDto | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const filters = withKnownFilters(urlFilters, categoriesLoaded ? categories : null, null);

  const load = useCallback(() => {
    fetchHome()
      .then((loaded) => {
        setHome(loaded);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    load();
    fetchLocations()
      .then(setLocations)
      .catch(() => undefined);
    fetchCategories()
      .then((loaded) => {
        setCategories(loaded);
        setCategoriesLoaded(true);
      })
      .catch(() => undefined);
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const location = home?.locations.find((l) => String(l.id) === lieu);
  const shelf = location ? pickShelf(location, etagere) : null;
  const shelfId = shelf?.id ?? (etagere === TRAY_SEGMENT ? null : Number(etagere));
  const furnitureHref = `/inventaire/${lieu}${filtersToQuery(filters)}`;

  // Read once when the page opens, then forgotten: a later visit (after a system back gesture,
  // or from « Voir dans le meuble ») never inherits it.
  const fromFurniture = useRef(arrivedFromFurniture());
  useEffect(() => forgetArrival(), []);

  const back = () => {
    const go = fromFurniture.current ? () => router.back() : () => router.replace(furnitureHref);
    closeFocus(Number.isNaN(shelfId) ? null : shelfId, go);
  };

  // The sheet follows the line through reloads; it closes when the line is gone.
  const current =
    shelf && selected ? shelf.tiles.find((t) => t.stockItemId === selected.stockItemId) : undefined;
  const dimmed = isFiltering(filters) ? (tile: HomeTileDto) => !tileMatches(tile, filters) : null;
  const title = location && shelf ? `${location.name} · ${shelf.name}` : 'Étagère';
  const addHref = location && shelf ? scanHref(location.id, shelf.id ?? undefined) : null;
  const ready = Boolean(home) || failed;

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-1 px-4">
        <button
          type="button"
          onClick={back}
          aria-label="Retour au meuble"
          className="tap-target text-indigo -ml-2 inline-flex shrink-0 items-center justify-center active:opacity-50"
        >
          <ChevronLeft size={26} aria-hidden="true" />
        </button>
        {ready ? (
          <h1 className="text-card-title min-w-0 flex-1 truncate">{title}</h1>
        ) : (
          <span className="flex-1" />
        )}
        {addHref && shelf && shelf.tiles.length > 0 ? (
          <Link
            href={addHref}
            aria-label={`Ajouter un produit sur ${shelf.name}`}
            className="tap-target text-indigo -mr-2 inline-flex shrink-0 items-center justify-center"
          >
            <Plus size={22} aria-hidden="true" />
          </Link>
        ) : null}
      </header>
      <div
        role="region"
        aria-label={shelf ? `Produits : ${shelf.name}` : 'Produits'}
        tabIndex={0}
        data-focus-zone=""
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pb-6"
      >
        {failed ? (
          <ErrorMessage
            message="Impossible de charger l’étagère : vérifiez la connexion."
            onRetry={load}
          />
        ) : null}
        {home && !shelf ? (
          <div className="flex flex-col items-center gap-4 pt-10">
            <Callout role="alert" title="Étagère introuvable">
              Cette étagère n’existe pas ou plus.
            </Callout>
            <Button onClick={() => router.replace(`/inventaire${location ? `/${lieu}` : ''}`)}>
              Retour au meuble
            </Button>
          </div>
        ) : null}
        {shelf && shelf.tiles.length === 0 ? (
          <div className="flex flex-col items-center gap-4 pt-16">
            <p className="text-help">Vide</p>
            {addHref ? (
              <Link
                href={addHref}
                className="bg-indigo tap-target text-white inline-flex items-center justify-center rounded-full px-6 font-semibold"
              >
                Ajouter
              </Link>
            ) : null}
          </div>
        ) : null}
        {shelf && shelf.tiles.length > 0 ? (
          <ul className="grid grid-cols-2 justify-items-center gap-4 pt-2 min-[400px]:grid-cols-3">
            {shelf.tiles.map((tile) => (
              <li key={tile.stockItemId} className="[--fx-tile:96px]">
                <ProductTile
                  tile={tile}
                  onSelect={setSelected}
                  dimmed={dimmed ? dimmed(tile) : false}
                />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {notice ? (
        <div className="absolute inset-x-0 bottom-2 z-20 px-4">
          <Callout role="status" title="C’est fait" className="shadow-raised">
            {notice}
          </Callout>
        </div>
      ) : null}
      {location && shelf && current ? (
        <ProductSheet
          key={current.stockItemId}
          tile={current}
          place={{
            locationId: location.id,
            locationName: location.name,
            shelfId: shelf.id,
            shelfName: shelf.id === null ? null : shelf.name,
          }}
          locations={locations}
          onChanged={(message) => {
            if (message) setNotice(message);
            load();
          }}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </main>
  );
}

/** Full-screen view of one shelf: its products in a vertical grid, without the bottom bar. */
export function ShelfFocusPage() {
  return (
    <Suspense>
      <ShelfFocus />
    </Suspense>
  );
}
