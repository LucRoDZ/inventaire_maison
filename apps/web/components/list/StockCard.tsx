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
  /** Tapping the card (not the − and +) opens the product: an invisible button under the controls. */
  onOpen?: (item: StockListItemDto) => void;
  /** A line « Garde-manger · Étagère 3 » (or « Non rangé ») under the name. */
  placeLine?: boolean;
}

/** One stock line (product, shelf, date): − and + act on this very line. */
export function StockCard({
  item,
  onChange,
  selection,
  onOpen,
  placeLine = false,
}: StockCardProps) {
  const { product } = item;
  const place = [item.location.name, item.shelf?.name].filter(Boolean).join(', ');
  const where = `${item.location.name} · ${item.shelf?.name ?? 'Non rangé'}`;
  return (
    <article
      data-expiry={item.expiry?.status}
      className={`bg-surface-raised border-line relative flex items-center gap-3 rounded-[14px] border p-3 shadow-none ${
        item.expiry
          ? `ring-2 ring-inset ${item.expiry.status === 'expired' ? 'ring-alert' : 'ring-expiry-soon-ring'}`
          : ''
      }`}
    >
      {onOpen ? (
        <button
          type="button"
          onClick={() => onOpen(item)}
          aria-label={`Ouvrir ${product.name}`}
          className="absolute inset-0 rounded-[inherit]"
        />
      ) : null}
      {product.imageUrl ? (
        <FadeImage
          src={product.imageUrl}
          className={`h-14 w-14 shrink-0 rounded-[10px] object-cover ${onOpen ? 'pointer-events-none relative' : ''}`}
        />
      ) : (
        <IconBadge icon={categoryIcon(item.category.icon)} />
      )}
      <div className={`min-w-0 flex-1 ${onOpen ? 'pointer-events-none relative' : ''}`}>
        <h3 className="text-body text-ink truncate font-semibold">{product.name}</h3>
        <p className="text-small text-grey truncate">
          {placeLine ? (product.brand ?? '') : [product.brand, place].filter(Boolean).join(' · ')}
        </p>
        {placeLine ? <p className="text-small text-grey truncate">{where}</p> : null}
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
        <div className="relative">
          <QuantityControl
            value={item.quantity}
            min={Number.NEGATIVE_INFINITY}
            label={`Quantité de ${product.name}`}
            valueLabel="Quantité"
            decreaseLabel={`Retirer une unité de ${product.name}`}
            increaseLabel={`Ajouter une unité de ${product.name}`}
            onStep={(delta) => onChange(item, delta)}
          />
        </div>
      )}
    </article>
  );
}
