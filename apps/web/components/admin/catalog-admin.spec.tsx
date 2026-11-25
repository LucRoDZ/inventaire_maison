import type { CategoryDto, OffCategoryMapDto } from '@inventaire/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import type { CategoriesApi } from '../../lib/categories-api';
import { CategoriesAdmin } from './CategoriesAdmin';
import { MappingsAdmin } from './MappingsAdmin';

const categories: CategoryDto[] = [
  { id: 1, name: 'Laitier', icon: 'milk', sortOrder: 0, isFallback: false },
  { id: 2, name: 'Boissons', icon: 'cup-soda', sortOrder: 1, isFallback: false },
  { id: 3, name: 'Autre', icon: 'package', sortOrder: 2, isFallback: true },
];
const mappings: OffCategoryMapDto[] = [
  { id: 20, offTag: 'en:cheeses', categoryId: 1 },
  { id: 21, offTag: 'en:beers', categoryId: 2 },
];

function makeApi(over: Partial<CategoriesApi> = {}): CategoriesApi {
  return {
    fetchCategories: vi.fn(async () => categories),
    createCategory: vi.fn(async (input) => ({ id: 9, sortOrder: 3, isFallback: false, ...input })),
    updateCategory: vi.fn(async (id) => categories.find((c) => c.id === id)!),
    deleteCategory: vi.fn(async () => undefined),
    fetchMappings: vi.fn(async () => mappings),
    createMapping: vi.fn(async (input) => ({ id: 30, ...input })),
    updateMapping: vi.fn(async (id) => mappings.find((m) => m.id === id)!),
    deleteMapping: vi.fn(async () => undefined),
    ...over,
  };
}

describe('CategoriesAdmin', () => {
  it('edits a name and picks an icon in the closed list', async () => {
    const api = makeApi();
    render(<CategoriesAdmin api={api} />);
    const row = await screen.findByRole('listitem', { name: 'Laitier' });
    const user = userEvent.setup();
    await user.click(within(row).getByRole('button', { name: 'Modifier' }));
    const name = within(row).getByLabelText('Nom de la catégorie');
    await user.clear(name);
    await user.type(name, 'Crèmerie');
    await user.click(within(row).getByRole('radio', { name: 'Œuf' }));
    expect(within(row).getByRole('radio', { name: 'Œuf' })).toBeChecked();
    await user.click(within(row).getByRole('button', { name: 'Enregistrer la catégorie' }));
    expect(api.updateCategory).toHaveBeenCalledWith(1, { name: 'Crèmerie', icon: 'egg' });
  });

  it('confirms before deleting and says where the products go', async () => {
    const api = makeApi();
    render(<CategoriesAdmin api={api} />);
    const row = await screen.findByRole('listitem', { name: 'Boissons' });
    const user = userEvent.setup();
    await user.click(within(row).getByRole('button', { name: 'Modifier' }));
    await user.click(within(row).getByRole('button', { name: 'Supprimer' }));
    expect(row).toHaveTextContent('Les produits iront dans Autre');
    expect(api.deleteCategory).not.toHaveBeenCalled();
    await user.click(within(row).getByRole('button', { name: 'Confirmer la suppression' }));
    expect(api.deleteCategory).toHaveBeenCalledWith(2);
  });

  it('offers no deletion for the fallback category', async () => {
    render(<CategoriesAdmin api={makeApi()} />);
    const row = await screen.findByRole('listitem', { name: 'Autre' });
    await userEvent.click(within(row).getByRole('button', { name: 'Modifier' }));
    expect(within(row).queryByRole('button', { name: 'Supprimer' })).not.toBeInTheDocument();
    expect(row).toHaveTextContent('ne peut pas être supprimée');
  });

  it('moves a category and adds one', async () => {
    const api = makeApi();
    render(<CategoriesAdmin api={api} />);
    const row = await screen.findByRole('listitem', { name: 'Boissons' });
    const user = userEvent.setup();
    await user.click(within(row).getByRole('button', { name: 'Monter Boissons' }));
    await waitFor(() => expect(api.updateCategory).toHaveBeenCalledTimes(2));
    expect(api.updateCategory).toHaveBeenCalledWith(2, { sortOrder: 0 });
    expect(api.updateCategory).toHaveBeenCalledWith(1, { sortOrder: 1 });

    const form = screen.getByRole('form', { name: 'Ajouter une catégorie' });
    await user.click(within(form).getByRole('button', { name: 'Ajouter la catégorie' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('obligatoire');
    await user.type(within(form).getByLabelText('Nom de la nouvelle catégorie'), 'Bébé');
    await user.click(within(form).getByRole('radio', { name: 'Bébé' }));
    await user.click(within(form).getByRole('button', { name: 'Ajouter la catégorie' }));
    expect(api.createCategory).toHaveBeenCalledWith({ name: 'Bébé', icon: 'baby' });
  });
});

describe('MappingsAdmin', () => {
  it('filters the tags', async () => {
    render(<MappingsAdmin api={makeApi()} />);
    await screen.findByRole('listitem', { name: 'en:cheeses' });
    await userEvent.type(screen.getByLabelText('Filtrer les tags'), 'beer');
    expect(screen.queryByRole('listitem', { name: 'en:cheeses' })).not.toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: 'en:beers' })).toBeInTheDocument();
  });

  it('adds a mapping, refusing a malformed tag', async () => {
    const api = makeApi();
    render(<MappingsAdmin api={api} />);
    const form = await screen.findByRole('form', { name: 'Ajouter une correspondance' });
    const user = userEvent.setup();
    await user.type(within(form).getByLabelText('Nouveau tag Open Food Facts'), 'cheeses');
    await user.click(within(form).getByRole('button', { name: 'Ajouter la correspondance' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('fr:slug');
    expect(api.createMapping).not.toHaveBeenCalled();
    await user.clear(within(form).getByLabelText('Nouveau tag Open Food Facts'));
    await user.type(within(form).getByLabelText('Nouveau tag Open Food Facts'), 'en:herbal-teas');
    await user.selectOptions(within(form).getByLabelText('Catégorie du nouveau tag'), 'Boissons');
    await user.click(within(form).getByRole('button', { name: 'Ajouter la correspondance' }));
    expect(api.createMapping).toHaveBeenCalledWith({ offTag: 'en:herbal-teas', categoryId: 2 });
  });

  it('reports a duplicate tag', async () => {
    const api = makeApi({ createMapping: vi.fn().mockRejectedValue(new ApiError(409, 'doublon')) });
    render(<MappingsAdmin api={api} />);
    const form = await screen.findByRole('form', { name: 'Ajouter une correspondance' });
    const user = userEvent.setup();
    await user.type(within(form).getByLabelText('Nouveau tag Open Food Facts'), 'en:cheeses');
    await user.click(within(form).getByRole('button', { name: 'Ajouter la correspondance' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('déjà associé');
  });

  it('edits and deletes a mapping', async () => {
    const api = makeApi();
    render(<MappingsAdmin api={api} />);
    const row = await screen.findByRole('listitem', { name: 'en:cheeses' });
    const user = userEvent.setup();
    await user.click(within(row).getByRole('button', { name: 'Modifier' }));
    await user.selectOptions(
      within(row).getByLabelText('Catégorie de la correspondance'),
      'Boissons',
    );
    await user.click(within(row).getByRole('button', { name: 'Enregistrer la correspondance' }));
    expect(api.updateMapping).toHaveBeenCalledWith(20, { offTag: 'en:cheeses', categoryId: 2 });
    const other = screen.getByRole('listitem', { name: 'en:beers' });
    await user.click(within(other).getByRole('button', { name: 'Supprimer' }));
    expect(api.deleteMapping).toHaveBeenCalledWith(21);
  });
});
