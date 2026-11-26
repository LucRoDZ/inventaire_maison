'use client';

import type { ProductDto } from '@inventaire/shared';
import { Search } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { searchProducts } from '../../lib/products-api';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';

const MIN_CHARS = 2;
const DELAY_MS = 300;

interface ProductPickerProps {
  title: string;
  /** One line under the title. */
  help?: string;
  /** A product that must not be offered (the one being merged). */
  excludeId?: number;
  onPick: (product: ProductDto) => void;
  onClose: () => void;
  /** Test seam. */
  search?: (query: string) => Promise<ProductDto[]>;
}

type State =
  | { name: 'idle' }
  | { name: 'loading' }
  | { name: 'done'; query: string; results: ProductDto[] }
  | { name: 'error' };

/** Searches the catalogue by name and returns the product the person taps. */
export function ProductPicker({
  title,
  help,
  excludeId,
  onPick,
  onClose,
  search = searchProducts,
}: ProductPickerProps) {
  const titleId = useId();
  const inputId = useId();
  const [text, setText] = useState('');
  const [state, setState] = useState<State>({ name: 'idle' });
  const query = text.trim();

  useEffect(() => {
    if (query.length < MIN_CHARS) {
      setState({ name: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ name: 'loading' });
    const timer = setTimeout(() => {
      search(query)
        .then((results) => {
          if (!cancelled) setState({ name: 'done', query, results });
        })
        .catch(() => {
          if (!cancelled) setState({ name: 'error' });
        });
    }, DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `search` is a fixed seam.
  }, [query]);

  const results =
    state.name === 'done' ? state.results.filter((product) => product.id !== excludeId) : [];

  return (
    <BottomSheet labelledBy={titleId} onClose={onClose} layer="top">
      <h2 id={titleId} className="text-card-title">
        {title}
      </h2>
      {help ? <p className="text-small">{help}</p> : null}
      <div className="flex flex-col gap-1">
        <label htmlFor={inputId} className="text-label">
          Nom du produit
        </label>
        <span className="relative">
          <Search
            size={18}
            aria-hidden="true"
            className="text-indigo-mid absolute top-1/2 left-3 -translate-y-1/2"
          />
          <input
            id={inputId}
            value={text}
            onChange={(event) => setText(event.target.value)}
            autoComplete="off"
            className="tap-target border-line text-ink w-full rounded-xl border bg-white pr-3 pl-10 text-base"
          />
        </span>
      </div>
      {state.name === 'idle' && query.length > 0 ? (
        <p className="text-small">Tapez au moins {MIN_CHARS} caractères.</p>
      ) : null}
      {state.name === 'loading' ? (
        <p role="status" className="text-small">
          Recherche…
        </p>
      ) : null}
      {state.name === 'error' ? (
        <p role="alert" className="text-small text-alert">
          La recherche a échoué : vérifiez la connexion et réessayez.
        </p>
      ) : null}
      {state.name === 'done' && results.length === 0 ? (
        <p role="status" className="text-body">
          Aucun produit trouvé pour « {state.query} ».
        </p>
      ) : null}
      {results.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {results.map((product) => (
            <li key={product.id}>
              <button
                type="button"
                onClick={() => onPick(product)}
                className="tap-target border-line text-ink flex w-full flex-col items-start rounded-xl border bg-white px-3 py-2 text-left"
              >
                <span className="text-card-title">{product.name}</span>
                {product.brand ? <span className="text-small">{product.brand}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Button variant="secondary" onClick={onClose}>
        Fermer
      </Button>
    </BottomSheet>
  );
}
