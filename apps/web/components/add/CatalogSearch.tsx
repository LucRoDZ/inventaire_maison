'use client';

import type { ProductDto } from '@inventaire/shared';
import { Plus, Search } from 'lucide-react';
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
        className="rounded-card mx-auto flex max-h-[85dvh] w-full max-w-xl flex-col gap-4 rounded-b-none bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        <h2 id={titleId} className="text-title shrink-0">
          Ajouter sans code-barres
        </h2>
        <label className="text-label flex shrink-0 flex-col gap-1">
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

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain">
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
            <p role="status" className="text-body">
              Aucun produit trouvé pour « {state.query} ».
            </p>
          ) : null}

          {state.name === 'done' ? (
            <div className={state.results.length > 0 ? 'border-line border-t pt-3' : ''}>
              <button
                type="button"
                onClick={() => onCreate(state.query)}
                className={`tap-target flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 text-left ${
                  state.results.length === 0
                    ? 'bg-indigo text-white'
                    : 'border-line text-ink border bg-white'
                }`}
              >
                <Plus size={18} aria-hidden="true" className="shrink-0" />
                <span className="flex flex-col">
                  <span className="text-card-title">Créer « {state.query} »</span>
                  {hasDuplicate(state.results, state.query) ? (
                    <span className="text-small">Un produit porte déjà ce nom</span>
                  ) : null}
                </span>
              </button>
            </div>
          ) : null}
        </div>

        <Button variant="secondary" onClick={onClose} className="shrink-0">
          Fermer
        </Button>
      </div>
    </div>
  );
}

function hasDuplicate(results: ProductDto[], query: string): boolean {
  const wanted = query.trim().toLowerCase();
  return results.some((product) => product.name.trim().toLowerCase() === wanted);
}
