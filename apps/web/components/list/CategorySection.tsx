'use client';

import type { RemovalReason, StockListItemDto } from '@inventaire/shared';
import { Check, ChevronDown, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { SwipeRow } from '../ui/SwipeRow';
import { StockCard } from './StockCard';

interface CategorySectionProps {
  name: string;
  items: StockListItemDto[];
  onChange: (item: StockListItemDto, delta: 1 | -1) => void;
  /** Swipe: one unit of the line goes out, as consumed or as thrown away (like the − button). */
  onRemove?: (item: StockListItemDto, reason: RemovalReason) => void;
  /** Batch mode: the ids of the lines ticked, and how to tick one. */
  selection?: { ids: ReadonlySet<number>; onToggle: (item: StockListItemDto) => void };
}

/** Collapsible group of the lines of one category. */
export function CategorySection({
  name,
  items,
  onChange,
  onRemove,
  selection,
}: CategorySectionProps) {
  const [open, setOpen] = useState(true);
  return (
    <section className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="tap-target text-label flex items-center justify-between"
      >
        <span>
          {name} <span className="text-grey font-normal tabular-nums">({items.length})</span>
        </span>
        <ChevronDown
          size={18}
          aria-hidden="true"
          className={`transition-transform duration-200 ease-out ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open ? (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <SwipeRow
                disabled={!onRemove || selection !== undefined}
                right={{
                  label: 'Consommé',
                  icon: Check,
                  tone: 'consumed',
                  run: () => onRemove?.(item, 'consumed'),
                }}
                left={{
                  label: 'Jeté',
                  icon: Trash2,
                  tone: 'wasted',
                  run: () => onRemove?.(item, 'wasted'),
                }}
              >
                <StockCard
                  item={item}
                  onChange={onChange}
                  selection={
                    selection
                      ? {
                          selected: selection.ids.has(item.id),
                          onToggle: () => selection.onToggle(item),
                        }
                      : undefined
                  }
                />
              </SwipeRow>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
