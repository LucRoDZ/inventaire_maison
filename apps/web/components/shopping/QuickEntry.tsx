'use client';

import {
  SHOPPING_LABEL_MAX_LENGTH,
  parseQuickEntry,
  type ProductDto,
  type QuickEntry as ParsedEntry,
  type ShoppingItemCreateInput,
} from '@inventaire/shared';
import { Plus } from 'lucide-react';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { searchProducts } from '../../lib/products-api';
import { Button } from '../ui/Button';

const SUGGESTION_DELAY_MS = 300;
const SUGGESTION_MIN_CHARS = 2;

interface QuickEntryProps {
  /** Adds a line; rejects with a message to show under the field. */
  onAdd: (input: ShoppingItemCreateInput) => Promise<void>;
  /** Test seam. */
  search?: (query: string, limit?: number) => Promise<ProductDto[]>;
}

const base = (entry: ParsedEntry): ShoppingItemCreateInput => ({
  quantity: entry.quantity,
  amount: entry.amount,
  unit: entry.unit,
});

/**
 * « 3 pommes », « 500 g de farine »: one field, read by `parseQuickEntry`. Enter adds a free
 * line. A catalogue product that looks like the text is only suggested under the field: the line
 * goes to that product only when it is tapped, never on its own.
 */
export function QuickEntry({ onAdd, search = searchProducts }: QuickEntryProps) {
  const inputId = useId();
  const errorId = useId();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<ProductDto[]>([]);
  const [busy, setBusy] = useState(false);
  const entry = parseQuickEntry(text);
  const name = entry?.name ?? '';

  useEffect(() => {
    if (name.length < SUGGESTION_MIN_CHARS) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      search(name, 3)
        .then((found) => {
          if (!cancelled) setSuggestions(found);
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]); // A suggestion is an extra: never an error.
        });
    }, SUGGESTION_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `search` is a fixed seam.
  }, [name]);

  const add = async (input: ShoppingItemCreateInput) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    // A free line is drawn by the list at once: the field empties with it, and gets its text back
    // if the server refuses. A catalogue product waits for the answer.
    const previous = text;
    const optimistic = !input.productId;
    if (optimistic) {
      setText('');
      setSuggestions([]);
    }
    try {
      await onAdd(input);
      if (!optimistic) {
        setText('');
        setSuggestions([]);
      }
    } catch (caught) {
      if (optimistic) setText(previous);
      setError(caught instanceof Error ? caught.message : 'Ajout impossible.');
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!entry) {
      setError('Écrivez ce qu’il faut acheter.');
      return;
    }
    void add({ ...base(entry), label: entry.name });
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor={inputId} className="text-label">
            Ajouter un article
          </label>
          <input
            id={inputId}
            value={text}
            maxLength={SHOPPING_LABEL_MAX_LENGTH}
            onChange={(event) => setText(event.target.value)}
            placeholder="3 pommes, 500 g de farine…"
            autoComplete="off"
            aria-invalid={error !== null}
            aria-describedby={error ? errorId : undefined}
            className="tap-target border-line text-ink w-full rounded-xl border bg-white px-3 text-base"
          />
        </div>
        <Button type="submit" disabled={busy} aria-label="Ajouter à la liste">
          <Plus size={20} aria-hidden="true" />
          Ajouter
        </Button>
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-small text-alert">
          {error}
        </p>
      ) : null}
      {entry && suggestions.length > 0 ? (
        <div className="flex flex-col gap-1" aria-label="Produits du catalogue" role="group">
          <p className="text-help">
            Un produit du catalogue ? Touchez-le, ou ajoutez la ligne libre.
          </p>
          <ul className="flex flex-wrap gap-2">
            {suggestions.map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  onClick={() => void add({ ...base(entry), productId: product.id })}
                  className="tap-target border-line text-indigo hover:bg-lavender rounded-full border bg-white px-4 font-semibold transition-colors duration-150"
                >
                  {product.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </form>
  );
}
