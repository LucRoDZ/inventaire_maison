'use client';

import type { StockListItemDto } from '@inventaire/shared';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { StockCard } from './StockCard';

interface CategorySectionProps {
  name: string;
  items: StockListItemDto[];
  onChange: (item: StockListItemDto, delta: 1 | -1) => void;
}

/** Collapsible group of the lines of one category. */
export function CategorySection({ name, items, onChange }: CategorySectionProps) {
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
          {name} ({items.length})
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
              <StockCard item={item} onChange={onChange} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
