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

  it('offers « Créer « … » » with the typed name when nothing matches', async () => {
    const { onCreate } = setup([]);
    type('  Poireaux ');
    await settle();
    expect(screen.getByText(/Aucun produit trouvé pour « Poireaux »/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Créer « Poireaux »/ }));
    expect(onCreate).toHaveBeenCalledWith('Poireaux');
  });

  it('always ends the results with the create line, separated', async () => {
    const { onCreate } = setup([tomatoes]);
    type('tomat');
    await settle();
    const create = screen.getByRole('button', { name: /Créer « tomat »/ });
    expect(create.closest('div')).toHaveClass('border-t');
    expect(screen.queryByText('Un produit porte déjà ce nom')).toBeNull();
    const buttons = screen.getAllByRole('button');
    expect(buttons.indexOf(create)).toBeGreaterThan(
      buttons.indexOf(screen.getByRole('button', { name: /Tomates grappe/ })),
    );
    fireEvent.click(create);
    expect(onCreate).toHaveBeenCalledWith('tomat');
  });

  it('keeps the create line on an exact duplicate, with a hint', async () => {
    setup([tomatoes]);
    type(' tomates GRAPPE ');
    await settle();
    expect(screen.getByRole('button', { name: /Créer « tomates GRAPPE »/ })).toBeInTheDocument();
    expect(screen.getByText('Un produit porte déjà ce nom')).toBeInTheDocument();
  });

  it('scrolls 30 results in their own zone, with « Fermer » outside', async () => {
    const many = Array.from(
      { length: 30 },
      (_, i) => ({ id: i, name: `Produit ${i}` }) as ProductDto,
    );
    setup(many);
    type('produit');
    await settle();
    const zone = screen.getByRole('list').parentElement!;
    expect(zone).toHaveClass('overflow-y-auto', 'min-h-0', 'flex-1');
    expect(zone).toContainElement(screen.getByRole('button', { name: /Créer « produit »/ }));
    expect(zone).not.toContainElement(screen.getByRole('button', { name: 'Fermer' }));
    expect(screen.getByRole('dialog')).toHaveClass('max-h-[85dvh]');
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
