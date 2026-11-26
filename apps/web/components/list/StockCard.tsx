import type { StockListItemDto } from '@inventaire/shared';
import { Minus, Plus } from 'lucide-react';
import { Card } from '../ui/Card';
import { categoryIcon } from '../ui/CategoryIcon';
import { IconBadge } from '../ui/IconBadge';
import { ExpiryBadge } from './ExpiryBadge';

interface StockCardProps {
  item: StockListItemDto;
  onChange: (item: StockListItemDto, delta: 1 | -1) => void;
}

/** One stock line (product, shelf, date): − and + act on this very line. */
export function StockCard({ item, onChange }: StockCardProps) {
  const { product } = item;
  const place = [item.location.name, item.shelf?.name].filter(Boolean).join(', ');
  return (
    <Card className="flex items-center gap-3">
      {product.imageUrl ? (
        <img src={product.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
      ) : (
        <IconBadge icon={categoryIcon(item.category.icon)} />
      )}
      <div className="min-w-0 flex-1">
        <h3 className="text-ink truncate font-semibold">{product.name}</h3>
        <p className="text-small truncate">{[product.brand, place].filter(Boolean).join(' · ')}</p>
        <ExpiryBadge expiry={item.expiry} />
      </div>
      <div
        role="group"
        aria-label={`Quantité de ${product.name}`}
        className="flex items-center gap-1"
      >
        <button
          type="button"
          aria-label={`Retirer une unité de ${product.name}`}
          onClick={() => onChange(item, -1)}
          className="tap-target bg-lavender text-indigo inline-flex items-center justify-center rounded-full transition-colors duration-150 hover:bg-lavender-line"
        >
          <Minus size={18} aria-hidden="true" />
        </button>
        <output
          aria-label="Quantité"
          className="text-ink min-w-[2ch] text-center font-semibold tabular-nums"
        >
          {item.quantity}
        </output>
        <button
          type="button"
          aria-label={`Ajouter une unité de ${product.name}`}
          onClick={() => onChange(item, 1)}
          className="tap-target bg-lavender text-indigo inline-flex items-center justify-center rounded-full transition-colors duration-150 hover:bg-lavender-line"
        >
          <Plus size={18} aria-hidden="true" />
        </button>
      </div>
    </Card>
  );
}
