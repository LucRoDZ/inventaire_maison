import type { LocationDto } from '@inventaire/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import { furnitureNameError, reorder } from '../../lib/furniture-edit';
import { FurnitureOptions } from './FurnitureOptions';

const place = (id: number, name: string, sortOrder: number, productCount = 0): LocationDto => ({
  id,
  name,
  kind: 'pantry',
  icon: 'warehouse',
  sortOrder,
  shelves: [],
  productCount,
});
const house = [place(1, 'Garde-manger', 0, 3), place(2, 'Frigo', 1, 2), place(3, 'Cave', 2)];

function setup(locationId = 2, over: Partial<Parameters<typeof FurnitureOptions>[0]['api']> = {}) {
  const api = {
    fetchLocations: vi.fn(async () => house),
    updateLocation: vi.fn(async () => house[0]!),
    deleteLocation: vi.fn(async () => undefined),
    ...over,
  };
  const onChanged = vi.fn();
  const name = house.find((l) => l.id === locationId)!.name;
  render(<FurnitureOptions locationId={locationId} name={name} onChanged={onChanged} api={api} />);
  return { api, onChanged, button: screen.getByRole('button', { name: `Options de ${name}` }) };
}

async function openMenu(button: HTMLElement) {
  await userEvent.click(button);
  const menu = await screen.findByRole('dialog');
  await within(menu).findByRole('button', { name: 'Renommer' });
  return menu;
}

describe('furniture editing helpers', () => {
  it('says why a name is refused', () => {
    expect(furnitureNameError('  ', [])).toBe('Donnez un nom au meuble.');
    expect(furnitureNameError('x'.repeat(41), [])).toBe('40 caractères au plus.');
    expect(furnitureNameError('frigo', ['Frigo'])).toMatch(/déjà ce nom/);
    expect(furnitureNameError('Frigo 2', ['Frigo'])).toBeNull();
  });

  it('swaps two neighbours and renumbers only what changed', () => {
    expect(reorder(house, 1, -1)).toEqual([
      { id: 2, sortOrder: 0 },
      { id: 1, sortOrder: 1 },
    ]);
    expect(reorder(house, 0, -1)).toEqual([]);
  });
});

describe('FurnitureOptions', () => {
  it('is a 44 px button named « Options de {nom} » with its menu of five actions', async () => {
    const { button } = setup();
    expect(button).toHaveClass('tap-target');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    const menu = await openMenu(button);
    expect(menu).toHaveAttribute('aria-modal', 'true');
    expect(menu).toHaveAccessibleName('Frigo');
    expect(
      within(menu)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['', 'Renommer', 'Changer l’icône', 'Monter', 'Descendre', 'Supprimer']);
  });

  it('cannot move the first one up nor the last one down', async () => {
    const { button } = setup(1);
    const menu = await openMenu(button);
    expect(within(menu).getByRole('button', { name: 'Monter' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(within(menu).getByRole('button', { name: 'Descendre' })).not.toHaveAttribute(
      'aria-disabled',
    );
  });

  it('moves up, says the new position, and gives the focus back', async () => {
    const { button, api, onChanged } = setup(2);
    const menu = await openMenu(button);
    await userEvent.click(within(menu).getByRole('button', { name: 'Monter' }));
    expect(api.updateLocation).toHaveBeenCalledWith(2, { sortOrder: 0 });
    expect(api.updateLocation).toHaveBeenCalledWith(1, { sortOrder: 1 });
    await waitFor(() =>
      expect(onChanged).toHaveBeenCalledWith({
        kind: 'moved',
        message: 'Frigo est maintenant en position 1 sur 3.',
      }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(button).toHaveFocus();
  });

  it('rename: field filled and selected, errors under it, Entrée confirms, focus back', async () => {
    const { button, api, onChanged } = setup(2);
    const menu = await openMenu(button);
    await userEvent.click(within(menu).getByRole('button', { name: 'Renommer' }));
    const sheet = screen.getByRole('dialog', { name: 'Renommer Frigo' });
    const field = within(sheet).getByLabelText('Nom du meuble');
    expect(field).toHaveValue('Frigo');
    expect(field).toHaveFocus();
    expect((field as HTMLInputElement).selectionStart).toBe(0);
    expect((field as HTMLInputElement).selectionEnd).toBe(5);

    await userEvent.clear(field);
    await userEvent.keyboard('{Enter}');
    expect(within(sheet).getByRole('alert')).toHaveTextContent('Donnez un nom au meuble.');
    expect(field).toHaveAccessibleDescription('Donnez un nom au meuble.');

    await userEvent.type(field, 'cave{Enter}');
    expect(within(sheet).getByRole('alert')).toHaveTextContent(/déjà ce nom/);

    await userEvent.clear(field);
    await userEvent.type(field, `${'x'.repeat(41)}{Enter}`);
    expect(within(sheet).getByRole('alert')).toHaveTextContent('40 caractères au plus.');
    expect(api.updateLocation).not.toHaveBeenCalled();

    await userEvent.clear(field);
    await userEvent.type(field, 'Frigo de la cuisine{Enter}');
    expect(api.updateLocation).toHaveBeenCalledWith(2, { name: 'Frigo de la cuisine' });
    await waitFor(() =>
      expect(onChanged).toHaveBeenCalledWith({
        kind: 'renamed',
        message: 'Meuble renommé : Frigo de la cuisine.',
      }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(button).toHaveFocus();
  });

  it('rename: a name taken on the server is said under the field', async () => {
    const { button } = setup(2, {
      updateLocation: vi.fn(async () => {
        throw new ApiError(409, 'Nom déjà utilisé');
      }),
    });
    const menu = await openMenu(button);
    await userEvent.click(within(menu).getByRole('button', { name: 'Renommer' }));
    const field = screen.getByLabelText('Nom du meuble');
    await userEvent.type(field, 'Autre{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent(/déjà ce nom/);
  });

  it('icon: a radio group of named icons, saved on « Enregistrer l’icône »', async () => {
    const { button, api, onChanged } = setup(2);
    const menu = await openMenu(button);
    await userEvent.click(within(menu).getByRole('button', { name: 'Changer l’icône' }));
    const sheet = screen.getByRole('dialog', { name: 'Icône de Frigo' });
    const group = within(sheet).getByRole('radiogroup', { name: 'Icône de Frigo' });
    expect(within(group).getByRole('radio', { name: 'Placard' })).toBeChecked();
    expect(within(group).getByRole('radio', { name: 'Placard' })).toHaveFocus();
    expect(within(group).getAllByRole('radio').length).toBeGreaterThan(30);
    expect(sheet.querySelector('select')).toBeNull();
    await userEvent.click(within(group).getByRole('radio', { name: 'Verre de vin' }));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Enregistrer l’icône' }));
    expect(api.updateLocation).toHaveBeenCalledWith(2, { icon: 'wine' });
    await waitFor(() =>
      expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ kind: 'icon' })),
    );
    expect(button).toHaveFocus();
  });

  it('delete: the same alert dialog, destination required when it holds stock', async () => {
    const { button, api, onChanged } = setup(2);
    const menu = await openMenu(button);
    await userEvent.click(within(menu).getByRole('button', { name: 'Supprimer' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Supprimer Frigo ?' });
    expect(within(dialog).getByRole('button', { name: 'Annuler' })).toHaveFocus();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Supprimer Frigo' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Choisissez le meuble');
    expect(api.deleteLocation).not.toHaveBeenCalled();
    await userEvent.selectOptions(
      within(dialog).getByLabelText('Meuble qui reçoit les produits'),
      'Cave',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Supprimer Frigo' }));
    expect(api.deleteLocation).toHaveBeenCalledWith(2, 3);
    await waitFor(() =>
      expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ kind: 'deleted' })),
    );
  });

  it('delete: Échap cancels and gives the focus back', async () => {
    const { button, api } = setup(3);
    const menu = await openMenu(button);
    await userEvent.click(within(menu).getByRole('button', { name: 'Supprimer' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(api.deleteLocation).not.toHaveBeenCalled();
    expect(button).toHaveFocus();
  });
});
