'use client';

import type { StatsDto } from '@inventaire/shared';
import { useEffect, useRef, useState } from 'react';
import { ApiError, apiFetch } from '../../lib/api';
import { Callout } from '../ui/Callout';

export const fetchStats = (): Promise<StatsDto> => apiFetch<StatsDto>('/stats');

/** 0.2 gives « 20 % »; null (nothing removed yet) gives a dash. */
export const formatWasteRate = (rate: number | null): string =>
  rate === null ? '–' : `${Math.round(rate * 100)} %`;

const units = (n: number) => `${n} ${n > 1 ? 'unités' : 'unité'}`;

interface StatsViewProps {
  /** Test seam. */
  load?: () => Promise<StatsDto>;
}

/**
 * The last 30 days: what was eaten, what was thrown away, the waste rate and the five most
 * wasted products (a table, with a plain CSS bar in each row; no chart library).
 */
export function StatsView({ load = fetchStats }: StatsViewProps) {
  const [stats, setStats] = useState<StatsDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loader = useRef(load);

  useEffect(() => {
    loader
      .current()
      .then(setStats)
      .catch((caught: unknown) =>
        setError(
          caught instanceof ApiError && caught.status !== 0
            ? caught.message
            : 'Impossible de charger les statistiques : vérifiez la connexion.',
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
  if (!stats) {
    return (
      <p role="status" className="text-small">
        Chargement…
      </p>
    );
  }

  const empty = stats.consumed === 0 && stats.wasted === 0;
  const max = Math.max(1, ...stats.topWasted.map((row) => row.units));
  const figure = 'rounded-card border-line shadow-card flex flex-col border bg-white p-4';

  return (
    <div className="flex flex-col gap-4">
      <p className="text-small">Les {stats.days} derniers jours.</p>
      {empty ? (
        <Callout role="note" title="Pas encore de statistiques">
          Elles apparaissent dès que des produits sont retirés du stock, comme consommés ou comme
          jetés.
        </Callout>
      ) : null}
      <dl className="grid grid-cols-2 gap-2">
        <div className={figure}>
          <dt className="text-small">Consommé</dt>
          <dd className="text-stat text-indigo tabular-nums">{stats.consumed}</dd>
        </div>
        <div className={figure}>
          <dt className="text-small">Jeté</dt>
          <dd className="text-stat text-indigo tabular-nums">{stats.wasted}</dd>
        </div>
        <div className={`${figure} col-span-2`}>
          <dt className="text-small">Taux de gaspillage</dt>
          <dd className="text-stat text-indigo tabular-nums">{formatWasteRate(stats.wasteRate)}</dd>
          <dd className="text-help">Jeté, sur tout ce qui a quitté le stock.</dd>
        </div>
      </dl>

      <section aria-labelledby="top-jetes" className="flex flex-col gap-2">
        <h2 id="top-jetes" className="text-card-title">
          Les plus jetés
        </h2>
        {stats.topWasted.length === 0 ? (
          <p className="text-body">Rien n’a été jeté sur la période.</p>
        ) : (
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Produits les plus jetés, en unités</caption>
            <thead>
              <tr className="text-label">
                <th scope="col" className="py-1 pr-2 font-normal">
                  Produit
                </th>
                <th scope="col" className="py-1 text-right font-normal">
                  Jetés
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.topWasted.map((row) => (
                <tr key={row.productId} className="border-line border-t align-top">
                  <th scope="row" className="text-ink w-full py-2 pr-2 font-semibold">
                    <span className="block truncate">{row.name}</span>
                    <span aria-hidden="true" className="bg-lavender mt-1 block h-2 rounded-full">
                      <span
                        className="bg-indigo block h-2 rounded-full"
                        style={{ width: `${Math.max(4, Math.round((row.units / max) * 100))}%` }}
                      />
                    </span>
                  </th>
                  <td className="text-ink py-2 text-right whitespace-nowrap tabular-nums">
                    {units(row.units)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
