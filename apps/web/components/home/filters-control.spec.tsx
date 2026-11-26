import type { CategoryDto } from '@inventaire/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  clearPanelFilters,
  filterSummary,
  NO_FILTER,
  type HomeFilters,
} from '../../lib/home-filters';
import { FilterReminder, FiltersControl, type FiltersMode } from './FiltersControl';

const categories: CategoryDto[] = [
  { id: 3, name: 'Produits laitiers', icon: 'milk', isFallback: false },
  { id: 4, name: 'Épicerie', icon: 'wheat', isFallback: false },
] as CategoryDto[];
const locations = [
  { id: 10, name: 'Frigo', count: 6 },
  { id: 11, name: 'Cave', count: 2 },
];

/** The control with its state kept like the URL would keep it. */
function Harness({
  initial = NO_FILTER,
  mode = 'home',
}: {
  initial?: HomeFilters;
  mode?: FiltersMode;
}) {
  const [filters, setFilters] = useState(initial);
  const view = mode === 'list' ? 'list' : 'home';
  return (
    <>
      <FiltersControl
        mode={mode}
        filters={filters}
        onChange={setFilters}
        categories={categories}
        locations={locations}
        total={8}
      />
      <FilterReminder
        summary={filterSummary(filters, view, categories, locations)}
        onClear={() => setFilters(clearPanelFilters(filters, view))}
      />
      <output data-testid="state">{JSON.stringify(filters)}</output>
      <button type="button">Ailleurs</button>
    </>
  );
}

const state = () => JSON.parse(screen.getByTestId('state').textContent!) as HomeFilters;

describe('FiltersControl', () => {
  it('is a 44 px icon button named « Filtres », closed at first, without a badge', () => {
    render(<Harness />);
    const button = screen.getByRole('button', { name: 'Filtres' });
    expect(button).toHaveClass('tap-target');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('filters-badge')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('house: a modal sheet with one named checkbox per category, no furniture nor order', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Filtres' }));
    const sheet = screen.getByRole('dialog', { name: 'Filtres' });
    expect(sheet).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'Filtres' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    const group = within(sheet).getByRole('group', { name: 'Catégories' });
    expect(within(group).getAllByRole('checkbox')).toHaveLength(2);
    expect(within(group).getByRole('checkbox', { name: 'Produits laitiers' })).not.toBeChecked();
    expect(within(sheet).queryByRole('group', { name: 'Meuble' })).toBeNull();
    expect(within(sheet).queryByRole('group', { name: 'Tri' })).toBeNull();
    expect(within(sheet).queryByRole('searchbox')).toBeNull();
    expect(within(sheet).getByRole('button', { name: 'Appliquer' })).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Réinitialiser' })).toBeInTheDocument();
  });

  it('list: furniture as radio buttons with their counts, categories and order', async () => {
    render(<Harness mode="list" />);
    await userEvent.click(screen.getByRole('button', { name: 'Filtres' }));
    const sheet = screen.getByRole('dialog', { name: 'Filtres' });
    const furniture = within(sheet).getByRole('group', { name: 'Meuble' });
    expect(
      within(furniture)
        .getAllByRole('radio')
        .map((r) => r.closest('label')!.textContent),
    ).toEqual(['Tout8', 'Frigo6', 'Cave2']);
    expect(within(furniture).getByRole('radio', { name: /Tout/ })).toBeChecked();
    expect(within(sheet).getByRole('group', { name: 'Catégories' })).toBeInTheDocument();
    expect(
      within(within(sheet).getByRole('group', { name: 'Tri' })).getByRole('radio', { name: 'Nom' }),
    ).toBeChecked();
  });

  it('applies only on « Appliquer »: badge, reminder and state', async () => {
    render(<Harness mode="list" />);
    await userEvent.click(screen.getByRole('button', { name: 'Filtres' }));
    let sheet = screen.getByRole('dialog');
    await userEvent.click(within(sheet).getByRole('radio', { name: /Frigo/ }));
    await userEvent.click(within(sheet).getByRole('checkbox', { name: 'Épicerie' }));
    // Closed without applying: nothing changes.
    await userEvent.keyboard('{Escape}');
    expect(state()).toEqual(NO_FILTER);

    await userEvent.click(screen.getByRole('button', { name: 'Filtres' }));
    sheet = screen.getByRole('dialog');
    await userEvent.click(within(sheet).getByRole('radio', { name: /Frigo/ }));
    await userEvent.click(within(sheet).getByRole('checkbox', { name: 'Épicerie' }));
    await userEvent.click(within(sheet).getByRole('radio', { name: 'Date limite' }));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Appliquer' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(state()).toEqual({ q: '', categoryIds: [4], locationId: 10, sort: 'expiry' });
    const button = screen.getByRole('button', { name: 'Filtres' });
    expect(button).toHaveFocus();
    expect(button).toHaveAccessibleDescription('2 filtres actifs');
    expect(within(button).getByTestId('filters-badge')).toHaveTextContent('2');
    expect(screen.getByTestId('filter-reminder')).toHaveTextContent('Frigo · Épicerie');
  });

  it('« Réinitialiser » clears the filters of the panel and keeps the search', async () => {
    render(
      <Harness
        mode="list"
        initial={{ q: 'lait', categoryIds: [3], locationId: 11, sort: 'added' }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Filtres' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Réinitialiser' }),
    );
    expect(state()).toEqual({ ...NO_FILTER, q: 'lait' });
    expect(screen.queryByTestId('filters-badge')).toBeNull();
    expect(screen.queryByTestId('filter-reminder')).toBeNull();
  });

  it('open furniture: the search is in the sheet and has the focus', async () => {
    render(<Harness mode="furniture" />);
    await userEvent.click(screen.getByRole('button', { name: 'Filtres' }));
    const sheet = screen.getByRole('dialog');
    const search = within(sheet).getByRole('searchbox', { name: 'Nom ou marque' });
    expect(search).toHaveFocus();
    await userEvent.type(search, 'lait');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Appliquer' }));
    expect(state().q).toBe('lait');
    expect(screen.getByTestId('filters-badge')).toHaveTextContent('1');
  });

  it('closes on Échap, on « Fermer » and on a tap beside it, focus back on the button', async () => {
    render(<Harness />);
    const button = screen.getByRole('button', { name: 'Filtres' });
    await userEvent.click(button);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(button);
    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(button).toHaveFocus();

    await userEvent.click(button);
    await userEvent.click(screen.getByRole('dialog').parentElement!);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the focus inside the sheet with Tab and Maj+Tab', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Filtres' }));
    const sheet = screen.getByRole('dialog');
    const close = within(sheet).getByRole('button', { name: 'Fermer' });
    const apply = within(sheet).getByRole('button', { name: 'Appliquer' });
    apply.focus();
    await userEvent.tab();
    expect(close).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(apply).toHaveFocus();
  });
});

describe('FilterReminder', () => {
  it('does not exist without a filter', () => {
    const { container } = render(<FilterReminder summary="" onClear={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('is a 32 px line with a 44 px « Effacer » button', async () => {
    const onClear = vi.fn();
    render(<FilterReminder summary="Frigo · Boissons" onClear={onClear} />);
    const line = screen.getByTestId('filter-reminder');
    expect(line).toHaveClass('h-8');
    expect(line).toHaveTextContent('Frigo · Boissons');
    const clear = screen.getByRole('button', { name: 'Effacer les filtres' });
    expect(clear).toHaveClass('tap-target');
    expect(clear).toHaveTextContent('Effacer');
    await userEvent.click(clear);
    expect(onClear).toHaveBeenCalledOnce();
  });
});
