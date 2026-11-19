'use client';

import type {
  CategoryDto,
  HomeLocationDto,
  HomeResponse,
  HomeTileDto,
  LocationDto,
} from '@inventaire/shared';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { DndProvider } from '../../../../components/home/dnd/DndProvider';
import { OpenFurniture } from '../../../../components/home/OpenFurniture';
import { ProductSheet } from '../../../../components/home/ProductSheet';
import { Callout } from '../../../../components/ui/Callout';
import { applyMove, findTile, type Destination } from '../../../../lib/drop';
import { ApiError } from '../../../../lib/api';
import { fetchHome } from '../../../../lib/home-api';
import { HomeFilters } from '../../../../components/home/HomeFilters';
import {
  filtersToQuery,
  isFiltering,
  tileMatches,
  useHomeFilters,
} from '../../../../lib/home-filters';
import { fetchCategories, fetchLocations, moveStock } from '../../../../lib/stock-api';

/** The shelf (or the tray) holding a line of the furniture. */
function placeOf(location: HomeLocationDto, tile: HomeTileDto) {
  const shelf = location.shelves.find((s) =>
    s.tiles.some((t) => t.stockItemId === tile.stockItemId),
  );
  return {
    locationId: location.id,
    locationName: location.name,
    shelfId: shelf?.id ?? null,
    shelfName: shelf?.name ?? null,
  };
}

function Meuble() {
  const { lieu } = useParams<{ lieu: string }>();
  const [home, setHome] = useState<HomeResponse | null>(null);
  const [locations, setLocations] = useState<LocationDto[]>([]);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [filters, setFilters] = useHomeFilters();
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<HomeTileDto | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

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
      .then(setCategories)
      .catch(() => undefined);
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  /** Optimistic: the tile jumps at once; if the server refuses it goes back and a message says why. */
  const drop = async (stockItemId: number, to: Destination) => {
    if (!home) return;
    const before = home;
    const found = findTile(before, stockItemId);
    if (!found) return;
    setProblem(null);
    setHome(applyMove(before, stockItemId, to));
    try {
      await moveStock({
        stockItemId,
        toLocationId: to.toLocationId,
        toShelfId: to.toShelfId,
        quantity: found.tile.quantity,
      });
      const target = before.locations.find((l) => l.id === to.toLocationId);
      const shelf = target?.shelves.find((s) => s.id === to.toShelfId);
      setNotice(
        `Déplacé : ${found.tile.quantity} × ${found.tile.name} vers ${target?.name ?? ''}${
          shelf ? `, ${shelf.name.charAt(0).toLowerCase()}${shelf.name.slice(1)}` : ''
        }`,
      );
      load();
    } catch (caught) {
      setHome(before);
      setProblem(
        caught instanceof ApiError && caught.status !== 0
          ? caught.message
          : 'Déplacement impossible : vérifiez la connexion.',
      );
    }
  };

  const location = home?.locations.find((l) => String(l.id) === lieu);
  // The sheet follows the line through reloads; it closes when the line is gone.
  const current =
    location && selected
      ? [...location.shelves.flatMap((s) => s.tiles), ...location.unshelved].find(
          (t) => t.stockItemId === selected.stockItemId,
        )
      : undefined;

  return (
    <main className="fx-fit flex flex-col gap-1">
      <Link
        href={`/inventaire${filtersToQuery(filters)}`}
        className="tap-target text-indigo-mid inline-flex items-center gap-1 font-bold"
      >
        <ChevronLeft size={18} aria-hidden="true" />
        Maison
      </Link>
      {failed ? (
        <Callout role="alert" title="Un instant">
          Impossible de charger le meuble : vérifiez la connexion.
        </Callout>
      ) : null}
      {home && !location ? (
        <Callout role="alert" title="Meuble introuvable">
          Ce meuble n’existe pas.
        </Callout>
      ) : null}
      {location && home ? (
        <DndProvider home={home} onMove={(id, to) => void drop(id, to)}>
          <h1 className="text-title">{location.name}</h1>
          <HomeFilters filters={filters} onChange={setFilters} categories={categories} />
          <OpenFurniture
            location={location}
            onSelect={setSelected}
            isDimmed={isFiltering(filters) ? (tile) => !tileMatches(tile, filters) : undefined}
          />
        </DndProvider>
      ) : null}
      {notice || problem ? (
        // Above the bottom bar, over the furniture: a message never takes height from the shelves.
        <div className="fixed inset-x-0 bottom-[calc(var(--fx-nav-h)+0.5rem+env(safe-area-inset-bottom))] z-20 mx-auto flex max-w-xl flex-col gap-2 px-4">
          {notice ? (
            <Callout role="status" title="C’est fait" className="shadow-card">
              {notice}
            </Callout>
          ) : null}
          {problem ? (
            <Callout role="alert" title="Déplacement impossible" className="shadow-card">
              {problem}
            </Callout>
          ) : null}
        </div>
      ) : null}
      {location && current ? (
        <ProductSheet
          key={current.stockItemId}
          tile={current}
          place={placeOf(location, current)}
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

export default function MeublePage() {
  return (
    <Suspense>
      <Meuble />
    </Suspense>
  );
}
