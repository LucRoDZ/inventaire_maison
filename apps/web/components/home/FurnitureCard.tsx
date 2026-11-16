'use client';

import type { HomeLocationDto, LocationKind } from '@inventaire/shared';
import Link from 'next/link';
import type { ComponentType, CSSProperties } from 'react';
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

interface CardDoor {
  hinge: 'left' | 'right';
  /** Rectangle of the door, in percent of the drawing. */
  box: CSSProperties;
}

const box = (left: number, top: number, width: number, height: number): CSSProperties => ({
  left: `${left}%`,
  top: `${top}%`,
  width: `${width}%`,
  height: `${height}%`,
});

/** Two swing doors sharing a rectangle, hinged on its outer edges. */
function pair(left: number, top: number, width: number, height: number): CardDoor[] {
  return [
    { hinge: 'left', box: box(left, top, width / 2, height) },
    { hinge: 'right', box: box(left + width / 2, top, width / 2, height) },
  ];
}

/** Where the doors sit on each drawing: the body of the SVG (viewBox 120 × 140), in percent. */
export const CARD_DOORS: Record<LocationKind, CardDoor[]> = {
  fridge: [{ hinge: 'left', box: box(21.7, 4.3, 56.7, 91.4) }],
  freezer: [{ hinge: 'left', box: box(13.3, 10, 73.3, 82.9) }],
  pantry: pair(11.7, 5.7, 76.7, 88.6),
  cellar: pair(8.3, 8.6, 83.3, 82.9),
  other: pair(11.7, 5.7, 76.7, 88.6),
};

/** iOS Safari only applies `:active` to an element that listens to touches. */
const listenToTouches = () => undefined;

interface FurnitureCardProps {
  location: HomeLocationDto;
  /** Surrounds the card in amber: it holds a result of the current search. */
  highlighted?: boolean;
  /** `?q=…&cat=…`: the filter follows into the opened furniture. */
  query?: string;
}

/**
 * A piece of furniture, closed. Its door tilts while the card is pressed (feedback only: the
 * navigation is immediate) and stays ajar, light on, when the search finds something inside.
 */
export function FurnitureCard({ location, highlighted = false, query = '' }: FurnitureCardProps) {
  const Drawing = DRAWINGS[location.kind];
  const { products, expiringSoon } = location.counts;
  return (
    <Link
      href={`/inventaire/${location.id}${query}`}
      data-match={highlighted ? 'true' : undefined}
      onTouchStart={listenToTouches}
      className={`fx-card border-line rounded-card shadow-card relative flex flex-col items-center gap-2 border bg-white p-3 ${
        highlighted ? 'ring-amber ring-4' : ''
      }`}
    >
      <div className="fx-card-stage" data-kind={location.kind}>
        <Drawing />
        <span className="fx-card-light" aria-hidden="true" />
        {CARD_DOORS[location.kind].map((door) => (
          <span
            key={door.hinge}
            className="fx-card-door"
            data-hinge={door.hinge}
            style={door.box}
            aria-hidden="true"
          >
            <span className="fx-door-face">
              <span className="fx-gloss" />
              <span className="fx-handle" />
            </span>
          </span>
        ))}
      </div>
      <span className="text-card-title">{location.name}</span>
      <span className="text-small">
        {products} {products > 1 ? 'articles' : 'article'}
      </span>
      {/* After the name in the document, so that the link is always read « Frigo… » first. */}
      {expiringSoon > 0 ? (
        <span className="text-help bg-amber text-indigo absolute top-2 right-2 rounded-full px-2 py-0.5 font-bold">
          {expiringSoon} {expiringSoon > 1 ? 'bientôt périmés' : 'bientôt périmé'}
        </span>
      ) : null}
    </Link>
  );
}
