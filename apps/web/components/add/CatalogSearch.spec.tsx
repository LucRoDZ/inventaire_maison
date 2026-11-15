import type { ProductDto } from '@inventaire/shared';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogSearch, SEARCH_DELAY_MS } from './CatalogSearch';

const tomatoes = { id: 3, name: 'Tomates grappe', brand: 'Primeur' } as ProductDto;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(results: ProductDto[] | Error) {
  const search = vi.fn<(query: string) => Promise<ProductDto[]>>(async () => {
    if (results instanceof Error) throw results;
    return results;
  });
  const onPick = vi.fn();
  const onCreate = vi.fn();
  const onClose = vi.fn();
  render(<CatalogSearch search={search} onPick={onPick} onCreate={onCreate} onClose={onClose} />);
  return { search, onPick, onCreate, onClose };
}

const type = (text: string) =>
  fireEvent.change(screen.getByLabelText('Nom du produit'), { target: { value: text } });

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(SEARCH_DELAY_MS);
  });
}

describe('CatalogSearch', () => {
  it('waits for two characters before searching', async () => {
    const { search } = setup([]);
    type('t');
    await settle();
    expect(search).not.toHaveBeenCalled();
    expect(screen.getByText(/au moins 2 caractères/)).toBeInTheDocument();
  });

  it('debounces: only the last text is searched', async () => {
    const { search } = setup([tomatoes]);
    type('to');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SEARCH_DELAY_MS - 50);
    });
    type('tom');
    await settle();
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith('tom');
  });

  it('lists the results and hands the tapped one over', async () => {
    const { onPick } = setup([tomatoes]);
    type('tomates');
    await settle();
    fireEvent.click(screen.getByRole('button', { name: /Tomates grappe/ }));
    expect(onPick).toHaveBeenCalledWith(tomatoes);
  });

  it('offers « Créer ce produit » with the typed name when nothing matches', async () => {
    const { onCreate } = setup([]);
    type('  Poireaux ');
    await settle();
    expect(screen.getByText(/Aucun produit trouvé pour « Poireaux »/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Créer ce produit' }));
    expect(onCreate).toHaveBeenCalledWith('Poireaux');
  });

  it('says so when the search fails', async () => {
    setup(new Error('réseau'));
    type('tomates');
    await settle();
    expect(screen.getByRole('alert')).toHaveTextContent('La recherche a échoué');
  });

  it('closes with Fermer', () => {
    const { onClose } = setup([]);
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalled();
  });
});
