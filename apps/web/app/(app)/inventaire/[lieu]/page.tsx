'use client';

import type { HomeResponse } from '@inventaire/shared';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { OpenFurniture } from '../../../../components/home/OpenFurniture';
import { Callout } from '../../../../components/ui/Callout';
import { fetchHome } from '../../../../lib/home-api';

export default function MeublePage() {
  const { lieu } = useParams<{ lieu: string }>();
  const [home, setHome] = useState<HomeResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetchHome()
      .then(setHome)
      .catch(() => setFailed(true));
  }, []);

  const location = home?.locations.find((l) => String(l.id) === lieu);
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
      {location ? (
        <>
          <h1 className="text-title">{location.name}</h1>
          <OpenFurniture location={location} />
        </>
      ) : null}
    </main>
  );
}
