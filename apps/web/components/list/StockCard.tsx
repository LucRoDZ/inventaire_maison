import type { StockListItemDto } from '@inventaire/shared';
import { Minus, Plus } from 'lucide-react';
import { Card } from '../ui/Card';
import { categoryIcon } from '../ui/CategoryIcon';
import { FadeImage } from '../ui/FadeImage';
import { IconBadge } from '../ui/IconBadge';
import { ExpiryBadge } from './ExpiryBadge';

interface StockCardProps {
  item: StockListItemDto;
  onChange: (item: StockListItemDto, delta: 1 | -1) => void;
  /** Batch mode: a checkbox replaces the quantity buttons. */
  selection?: { selected: boolean; onToggle: () => void };
}

/** One stock line (product, shelf, date): − and + act on this very line. */
export function StockCard({ item, onChange, selection }: StockCardProps) {
  const { product } = item;
  const place = [item.location.name, item.shelf?.name].filter(Boolean).join(', ');
  return (
    <Card className="flex items-center gap-3">
      {product.imageUrl ? (
        <FadeImage src={product.imageUrl} className="h-12 w-12 shrink-0 rounded-xl object-cover" />
      ) : (
        <IconBadge icon={categoryIcon(item.category.icon)} />
      )}
      <div className="min-w-0 flex-1">
        <h3 className="text-ink truncate font-semibold">{product.name}</h3>
        <p className="text-small truncate">{[product.brand, place].filter(Boolean).join(' · ')}</p>
        <ExpiryBadge expiry={item.expiry} />
      </div>
      {selection ? (
        <>
          <span className="text-ink font-semibold tabular-nums">× {item.quantity}</span>
          <label className="tap-target flex shrink-0 cursor-pointer items-center justify-center">
            <input
              type="checkbox"
              aria-label={`Sélectionner ${product.name}`}
              checked={selection.selected}
              onChange={selection.onToggle}
              className="accent-indigo h-6 w-6"
            />
          </label>
        </>
      ) : (
        <div
          role="group"
          aria-label={`Quantité de ${product.name}`}
          className="flex items-center gap-1"
        >
          <button
            type="button"
            aria-label={`Retirer une unité de ${product.name}`}
            onClick={() => onChange(item, -1)}
            className="tap-target text-indigo hover:bg-lavender inline-flex items-center justify-center rounded-full transition-colors duration-150"
          >
            <Minus size={18} aria-hidden="true" />
          </button>
          <output
            aria-label="Quantité"
            className="text-ink min-w-8 text-center font-semibold tabular-nums"
          >
            {item.quantity}
          </output>
          <button
            type="button"
            aria-label={`Ajouter une unité de ${product.name}`}
            onClick={() => onChange(item, 1)}
            className="tap-target text-indigo hover:bg-lavender inline-flex items-center justify-center rounded-full transition-colors duration-150"
          >
            <Plus size={18} aria-hidden="true" />
          </button>
        </div>
      )}
    </Card>
  );
}
