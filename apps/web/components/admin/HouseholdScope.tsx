'use client';

import type { HouseholdDto } from '@inventaire/shared';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { fetchHouseholds } from '../../lib/households-api';
import { Callout } from '../ui/Callout';

interface HouseholdScopeProps {
  /** Renders the screen for the chosen household (keyed by it: nothing leaks between two). */
  children: (household: { id: number; name: string }) => ReactNode;
  /** Test seam. */
  load?: () => Promise<HouseholdDto[]>;
}

const select = 'tap-target border-line text-ink w-full rounded-xl border bg-white px-3 text-base';

/**
 * Admin console: the household whose categories or mappings are shown, chosen at the top of the
 * screen and kept in the address (`?foyer=`). Every read and write below names it explicitly.
 */
export function HouseholdScope({ children, load = fetchHouseholds }: HouseholdScopeProps) {
  const id = useId();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [households, setHouseholds] = useState<HouseholdDto[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    load()
      .then(setHouseholds)
      .catch(() => setFailed(true));
  }, [load]);

  if (failed) {
    return (
      <Callout role="alert">Impossible de charger les foyers : vérifiez la connexion.</Callout>
    );
  }
  if (!households) {
    return (
      <p role="status" className="text-small">
        Chargement…
      </p>
    );
  }
  const wanted = Number(params.get('foyer'));
  const chosen = households.find((h) => h.id === wanted) ?? households[0];
  if (!chosen) return <Callout>Aucun foyer pour l’instant.</Callout>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-label">
          Foyer concerné
        </label>
        <select
          id={id}
          className={select}
          value={chosen.id}
          onChange={(event) => router.replace(`${pathname}?foyer=${event.target.value}`)}
        >
          {households.map((household) => (
            <option key={household.id} value={household.id}>
              {household.name}
            </option>
          ))}
        </select>
        <p className="text-help">
          Les changements ne concernent que ce foyer ; les autres gardent leur propre copie.
        </p>
      </div>
      <div key={chosen.id}>{children({ id: chosen.id, name: chosen.name })}</div>
    </div>
  );
}
