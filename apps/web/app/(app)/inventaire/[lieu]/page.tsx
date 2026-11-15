'use client';

import type { HomeLocationDto, HomeResponse, HomeTileDto, LocationDto } from '@inventaire/shared';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { OpenFurniture } from '../../../../components/home/OpenFurniture';
import { ProductSheet } from '../../../../components/home/ProductSheet';
import { Callout } from '../../../../components/ui/Callout';
import { fetchHome } from '../../../../lib/home-api';
import { fetchLocations } from '../../../../lib/stock-api';

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

export default function MeublePage() {
  const { lieu } = useParams<{ lieu: string }>();
  const [home, setHome] = useState<HomeResponse | null>(null);
  const [locations, setLocations] = useState<LocationDto[]>([]);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<HomeTileDto | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const location = home?.locations.find((l) => String(l.id) === lieu);
  // The sheet follows the line through reloads; it closes when the line is gone.
  const current =
    location && selected
      ? [...location.shelves.flatMap((s) => s.tiles), ...location.unshelved].find(
          (t) => t.stockItemId === selected.stockItemId,
        )
      : undefined;

  return (
    <main className="flex flex-col gap-4">
      <Link
        href="/inventaire"
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
      {notice ? (
        <Callout role="status" title="C’est fait">
          {notice}
        </Callout>
      ) : null}
      {location ? (
        <>
          <h1 className="text-title">{location.name}</h1>
          <OpenFurniture location={location} onSelect={setSelected} />
        </>
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
