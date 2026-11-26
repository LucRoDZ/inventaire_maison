import type { CategoryDto } from '@inventaire/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import type { CategoriesApi } from '../../lib/categories-api';
import type { SettingsApi } from '../../lib/settings-api';
import { CategoriesAdmin } from './CategoriesAdmin';
import { SettingsAdmin } from './SettingsAdmin';

const makeSettings = (over: Partial<SettingsApi> = {}): SettingsApi => ({
  fetchSettings: vi.fn(async () => ({ expiryAlertDays: 3 })),
  updateSettings: vi.fn(async (patch) => ({ expiryAlertDays: patch.expiryAlertDays ?? 3 })),
  ...over,
});

describe('SettingsAdmin', () => {
  it('shows the threshold and saves a new one', async () => {
    const api = makeSettings();
    render(<SettingsAdmin api={api} />);
    const input = await screen.findByLabelText(/Alerte « bientôt »/);
    expect(input).toHaveValue('3');
    await userEvent.clear(input);
    await userEvent.type(input, '5');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le réglage' }));
    expect(api.updateSettings).toHaveBeenCalledWith({ expiryAlertDays: 5 });
    expect(await screen.findByRole('status')).toHaveTextContent('Réglage enregistré.');
  });

  it('refuses a value out of range under the field, without calling the server', async () => {
    const api = makeSettings();
    render(<SettingsAdmin api={api} />);
    const input = await screen.findByLabelText(/Alerte « bientôt »/);
    await userEvent.clear(input);
    await userEvent.type(input, '45');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le réglage' }));
    expect(screen.getByRole('alert')).toHaveTextContent('entre 0 et 30');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(api.updateSettings).not.toHaveBeenCalled();
  });

  it('says what the server answered when saving fails', async () => {
    const api = makeSettings({
      updateSettings: vi.fn(async () => {
        throw new ApiError(500, 'Erreur du serveur');
      }),
    });
    render(<SettingsAdmin api={api} />);
    await screen.findByLabelText(/Alerte « bientôt »/);
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le réglage' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Erreur du serveur');
  });
});

describe('CategoriesAdmin shelf life', () => {
  const categories: CategoryDto[] = [
    { id: 1, name: 'Laitier', icon: 'milk', sortOrder: 0, isFallback: false, shelfLifeDays: 7 },
    { id: 2, name: 'Autre', icon: 'package', sortOrder: 1, isFallback: true, shelfLifeDays: null },
  ];
  const makeApi = (): CategoriesApi =>
    ({
      fetchCategories: vi.fn(async () => categories),
      updateCategory: vi.fn(async (id: number) => categories.find((c) => c.id === id)!),
    }) as unknown as CategoriesApi;

  it('shows the suggested duration and saves a changed one', async () => {
    const api = makeApi();
    render(<CategoriesAdmin api={api} />);
    const row = await screen.findByRole('listitem', { name: 'Laitier' });
    expect(row).toHaveTextContent('Durée suggérée : 7 jours');
    await userEvent.click(within(row).getByRole('button', { name: 'Modifier' }));
    const field = within(row).getByLabelText('Durée de conservation suggérée (jours)');
    expect(field).toHaveValue('7');
    await userEvent.clear(field);
    await userEvent.type(field, '10');
    await userEvent.click(within(row).getByRole('button', { name: 'Enregistrer la catégorie' }));
    expect(api.updateCategory).toHaveBeenCalledWith(1, {
      name: 'Laitier',
      icon: 'milk',
      shelfLifeDays: 10,
    });
  });

  it('sends null when the field is emptied, and refuses a bad value under the field', async () => {
    const api = makeApi();
    render(<CategoriesAdmin api={api} />);
    const row = await screen.findByRole('listitem', { name: 'Laitier' });
    await userEvent.click(within(row).getByRole('button', { name: 'Modifier' }));
    const field = within(row).getByLabelText('Durée de conservation suggérée (jours)');
    await userEvent.clear(field);
    await userEvent.type(field, '0');
    await userEvent.click(within(row).getByRole('button', { name: 'Enregistrer la catégorie' }));
    expect(within(row).getByRole('alert')).toHaveTextContent('entre 1 et');
    expect(api.updateCategory).not.toHaveBeenCalled();
    await userEvent.clear(field);
    await userEvent.click(within(row).getByRole('button', { name: 'Enregistrer la catégorie' }));
    expect(api.updateCategory).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ shelfLifeDays: null }),
    );
  });
});
