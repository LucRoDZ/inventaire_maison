import type { CategoryDto } from '@inventaire/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { NO_FILTER, type HomeFilters } from '../../lib/home-filters';
import { FilterReminder, FiltersControl } from './FiltersControl';

const categories: CategoryDto[] = [
  { id: 3, name: 'Produits laitiers', icon: 'milk', isFallback: false },
  { id: 4, name: 'Épicerie', icon: 'wheat', isFallback: false },
] as CategoryDto[];

/** The control with its state kept like the URL would keep it. */
function Harness({ initial = NO_FILTER }: { initial?: HomeFilters }) {
  const [filters, setFilters] = useState(initial);
  return (
    <>
      <FiltersControl filters={filters} onChange={setFilters} categories={categories} />
      <FilterReminder
        filters={filters}
        categories={categories}
        onClear={() => setFilters(NO_FILTER)}
      />
      <button type="button">Ailleurs</button>
    </>
  );
}

describe('FiltersControl', () => {
  it('is a 44 px icon button named « Filtres », closed at first', () => {
    render(<Harness />);
    const button = screen.getByRole('button', { name: 'Filtres' });
    expect(button).toHaveClass('tap-target');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('filters-dot')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens a modal sheet with the search, the chips and « Effacer les filtres »', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Filtres' }));
    const sheet = screen.getByRole('dialog', { name: 'Filtres' });
    expect(sheet).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'Filtres' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    const search = within(sheet).getByRole('searchbox', { name: 'Rechercher dans la maison' });
    expect(search).toHaveFocus();
    expect(within(sheet).getByRole('button', { name: 'Produits laitiers' })).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Effacer les filtres' })).toBeDisabled();
  });

  it('marks the button as active with an amber dot, and shows the reminder', async () => {
    render(<Harness />);
    expect(screen.queryByText(/^Filtré :/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Filtres' }));
    const sheet = screen.getByRole('dialog');
    await userEvent.type(within(sheet).getByRole('searchbox'), 'lait');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Produits laitiers' }));
    const button = screen.getByRole('button', { name: 'Filtres, actifs' });
    expect(within(button).getByTestId('filters-dot')).toHaveClass('bg-amber');
    expect(screen.getByText(/^Filtré :/)).toHaveTextContent('Filtré : lait · Produits laitiers');
  });

  it('closes on Échap and gives the focus back to the button', async () => {
    render(<Harness />);
    const button = screen.getByRole('button', { name: 'Filtres' });
    await userEvent.click(button);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes on « Fermer » and on a tap beside the sheet', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Filtres' }));
    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Filtres' })).toHaveFocus();

    await userEvent.click(screen.getByRole('button', { name: 'Filtres' }));
    await userEvent.click(screen.getByRole('dialog').parentElement!);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the focus inside the sheet with Tab and Maj+Tab', async () => {
    render(<Harness initial={{ q: 'lait', categoryId: null }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Filtres, actifs' }));
    const sheet = screen.getByRole('dialog');
    const close = within(sheet).getByRole('button', { name: 'Fermer' });
    const clear = within(sheet).getByRole('button', { name: 'Effacer les filtres' });
    clear.focus();
    await userEvent.tab();
    expect(close).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(clear).toHaveFocus();
  });

  it('clears everything from the sheet', async () => {
    render(<Harness initial={{ q: 'lait', categoryId: 3 }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Filtres, actifs' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Effacer les filtres' }),
    );
    expect(screen.getByRole('button', { name: 'Filtres' })).toBeInTheDocument();
    expect(screen.queryByText(/^Filtré :/)).toBeNull();
  });
});

describe('FilterReminder', () => {
  it('does not exist without a filter', () => {
    const { container } = render(
      <FilterReminder filters={NO_FILTER} categories={categories} onClear={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('is a 32 px line with a 44 px button that clears the filter', async () => {
    const onClear = vi.fn();
    render(
      <FilterReminder
        filters={{ q: '', categoryId: 4 }}
        categories={categories}
        onClear={onClear}
      />,
    );
    const text = screen.getByText(/^Filtré :/);
    expect(text).toHaveTextContent('Filtré : Épicerie');
    expect(text.parentElement).toHaveClass('h-8');
    const clear = screen.getByRole('button', { name: 'Effacer les filtres' });
    expect(clear).toHaveClass('tap-target');
    await userEvent.click(clear);
    expect(onClear).toHaveBeenCalledOnce();
  });
});
