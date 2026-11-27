import type { StockListItemDto } from '@inventaire/shared';
import { categoryIcon } from '../ui/CategoryIcon';
import { FadeImage } from '../ui/FadeImage';
import { IconBadge } from '../ui/IconBadge';
import { QuantityControl } from '../ui/QuantityControl';
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
    <article className="bg-surface-raised border-line flex items-center gap-3 rounded-[14px] border p-3 shadow-none">
      {product.imageUrl ? (
        <FadeImage
          src={product.imageUrl}
          className="h-14 w-14 shrink-0 rounded-[10px] object-cover"
        />
      ) : (
        <IconBadge icon={categoryIcon(item.category.icon)} />
      )}
      <div className="min-w-0 flex-1">
        <h3 className="text-body text-ink truncate font-semibold">{product.name}</h3>
        <p className="text-small text-grey truncate">
          {[product.brand, place].filter(Boolean).join(' · ')}
        </p>
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
        <QuantityControl
          value={item.quantity}
          min={Number.NEGATIVE_INFINITY}
          label={`Quantité de ${product.name}`}
          valueLabel="Quantité"
          decreaseLabel={`Retirer une unité de ${product.name}`}
          increaseLabel={`Ajouter une unité de ${product.name}`}
          onStep={(delta) => onChange(item, delta)}
        />
      )}
    </article>
  );
}
