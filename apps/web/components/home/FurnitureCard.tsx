import type { HomeLocationDto, LocationKind } from '@inventaire/shared';
import Link from 'next/link';
import type { ComponentType } from 'react';
import { Cellar } from './furniture/Cellar';
import { Freezer } from './furniture/Freezer';
import { Fridge } from './furniture/Fridge';
import { Pantry } from './furniture/Pantry';

const DRAWINGS: Record<LocationKind, ComponentType<{ className?: string }>> = {
  pantry: Pantry,
  fridge: Fridge,
  freezer: Freezer,
  cellar: Cellar,
  other: Pantry,
};

interface FurnitureCardProps {
  location: HomeLocationDto;
  /** Surrounds the card in amber: it holds a result of the current search. */
  highlighted?: boolean;
}

export function FurnitureCard({ location, highlighted = false }: FurnitureCardProps) {
  const Drawing = DRAWINGS[location.kind];
  const { products, expiringSoon } = location.counts;
  return (
    <Link
      href={`/inventaire/${location.id}`}
      className={`border-line rounded-card shadow-card relative flex flex-col items-center gap-2 border bg-white p-3 ${
        highlighted ? 'ring-amber ring-4' : ''
      }`}
    >
      {expiringSoon > 0 ? (
        <span className="text-help bg-amber text-indigo absolute top-2 right-2 rounded-full px-2 py-0.5 font-bold">
          {expiringSoon} {expiringSoon > 1 ? 'bientôt périmés' : 'bientôt périmé'}
        </span>
      ) : null}
      <Drawing className="h-28 w-full" />
      <span className="text-card-title">{location.name}</span>
      <span className="text-small">
        {products} {products > 1 ? 'articles' : 'article'}
      </span>
    </Link>
  );
}
