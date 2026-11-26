'use client';

import type { ProductDto } from '@inventaire/shared';
import { Search } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { searchProducts } from '../../lib/products-api';
import { Button } from '../ui/Button';

export const SEARCH_MIN_CHARS = 2;
export const SEARCH_DELAY_MS = 300;

interface CatalogSearchProps {
  /** A result was tapped: the add sheet opens (reason `manual`). */
  onPick: (product: ProductDto) => void;
  /** Nothing matched: the creation form opens, without barcode, with this name. */
  onCreate: (name: string) => void;
  onClose: () => void;
  /** Test seam. */
  search?: (query: string) => Promise<ProductDto[]>;
}

type State =
  | { name: 'idle' }
  | { name: 'loading' }
  | { name: 'done'; query: string; results: ProductDto[] }
  | { name: 'error' };

/** Finds a product by name (fruit, vegetables, butcher: no barcode). */
export function CatalogSearch({
  onPick,
  onCreate,
  onClose,
  search = searchProducts,
}: CatalogSearchProps) {
  const titleId = useId();
  const [text, setText] = useState('');
  const [state, setState] = useState<State>({ name: 'idle' });
  const query = text.trim();

  useEffect(() => {
    if (query.length < SEARCH_MIN_CHARS) {
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
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `search` is a fixed seam.
  }, [query]);

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-indigo/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.key === 'Escape' && onClose()}
        className="rounded-card mx-auto flex max-h-[90dvh] w-full max-w-xl flex-col gap-4 overflow-y-auto rounded-b-none bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        <h2 id={titleId} className="text-title">
          Ajouter sans code-barres
        </h2>
        <label className="text-label flex flex-col gap-1">
          Nom du produit
          <span className="relative">
            <Search
              size={18}
              aria-hidden="true"
              className="text-indigo-mid absolute top-1/2 left-3 -translate-y-1/2"
            />
            <input
              autoFocus
              value={text}
              onChange={(event) => setText(event.target.value)}
              autoComplete="off"
              placeholder="Tomates, poulet, pommes…"
              className="tap-target border-line text-ink w-full rounded-xl border bg-white pr-3 pl-10"
            />
          </span>
        </label>

        {state.name === 'idle' && query.length > 0 ? (
          <p className="text-small">Tapez au moins {SEARCH_MIN_CHARS} caractères.</p>
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

        {state.name === 'done' && state.results.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {state.results.map((product) => (
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

        {state.name === 'done' && state.results.length === 0 ? (
          <div className="flex flex-col gap-3">
            <p role="status" className="text-body">
              Aucun produit trouvé pour « {state.query} ».
            </p>
            <Button variant="primary" onClick={() => onCreate(state.query)}>
              Créer ce produit
            </Button>
          </div>
        ) : null}

        <Button variant="secondary" onClick={onClose}>
          Fermer
        </Button>
      </div>
    </div>
  );
}
