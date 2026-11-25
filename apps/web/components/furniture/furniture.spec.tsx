import type { HomeLocationDto, HomeResponse, LocationDto } from '@inventaire/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/inventaire',
}));
vi.mock('../../lib/stock-api', () => ({ fetchCategories: async () => [] }));
const places = vi.hoisted(() => ({ createLocation: vi.fn() }));
vi.mock('../../lib/places-api', () => ({
  createLocation: (input: unknown) => places.createLocation(input),
}));
import { HomeView } from '../home/HomeView';
import { BottomSheet } from '../ui/BottomSheet';
import { CreateFurnitureSheet } from './CreateFurnitureSheet';

afterEach(() => {
  vi.restoreAllMocks();
});

const created = (over: Partial<LocationDto> = {}): LocationDto => ({
  id: 9,
  name: 'Frigo 2',
  kind: 'fridge',
  icon: 'refrigerator',
  sortOrder: 4,
  shelves: [],
  productCount: 0,
  ...over,
});

function SheetHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Ouvrir
      </button>
      {open ? (
        <BottomSheet labelledBy="t" onClose={() => setOpen(false)}>
          <h2 id="t">Feuille</h2>
          <button type="button">Premier</button>
          <button type="button">Dernier</button>
        </BottomSheet>
      ) : null}
    </>
  );
}

describe('BottomSheet', () => {
  it('is a modal dialog: focus inside at once, kept inside, Échap closes, focus given back', async () => {
    const user = userEvent.setup();
    render(<SheetHarness />);
    const opener = screen.getByRole('button', { name: 'Ouvrir' });
    await user.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Feuille' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByRole('button', { name: 'Premier' })).toHaveFocus();
    await user.tab();
    expect(within(dialog).getByRole('button', { name: 'Dernier' })).toHaveFocus();
    await user.tab();
    expect(within(dialog).getByRole('button', { name: 'Premier' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(within(dialog).getByRole('button', { name: 'Dernier' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });
});

describe('CreateFurnitureSheet', () => {
  const setup = (over: Partial<Parameters<typeof CreateFurnitureSheet>[0]> = {}) => {
    const props = {
      existingNames: ['Garde-manger', 'Frigo', 'Congélateur', 'Cave'],
      onCreated: vi.fn(),
      onClose: vi.fn(),
      create: vi.fn(async (input: { name: string; kind: LocationDto['kind'] }) =>
        created({ name: input.name, kind: input.kind }),
      ),
      ...over,
    };
    render(<CreateFurnitureSheet {...props} />);
    return { props, user: userEvent.setup() };
  };

  it('offers the kinds as radio cards in a fieldset, the checked one focused at once', () => {
    setup();
    const dialog = screen.getByRole('dialog', { name: 'Ajouter un meuble' });
    const group = within(dialog).getByRole('group', { name: 'Type de meuble' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((r) => r.closest('label')?.textContent)).toEqual([
      'Garde-manger',
      'Frigo',
      'Congélateur',
      'Cave',
      'Placard',
    ]);
    expect(within(group).getByRole('radio', { name: 'Frigo' })).toBeChecked();
    expect(within(group).getByRole('radio', { name: 'Frigo' })).toHaveFocus();
  });

  it('suggests a free name and the default shelves of the kind, following the kind until edited', async () => {
    const { user } = setup();
    const name = screen.getByLabelText('Nom du meuble');
    expect(name).toHaveValue('Frigo 2');
    expect(name).toHaveClass('text-base');
    expect(name).toHaveAttribute('enterkeyhint', 'done');
    expect(screen.getByRole('group', { name: 'Nombre de étagères' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Congélateur' }));
    expect(name).toHaveValue('Congélateur 2');
    const drawers = screen.getByRole('group', { name: 'Nombre de tiroirs' });
    expect(within(drawers).getByText('3')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Placard' }));
    expect(name).toHaveValue('Placard');
    await user.clear(name);
    await user.type(name, 'Buffet du salon');
    await user.click(screen.getByRole('radio', { name: 'Cave' }));
    expect(name).toHaveValue('Buffet du salon');
  });

  it('counts the shelves from 1 to 8', async () => {
    const { user, props } = setup();
    const less = screen.getByRole('button', { name: 'Une étagère de moins' });
    const more = screen.getByRole('button', { name: 'Une étagère de plus' });
    for (let i = 0; i < 3; i++) await user.click(less);
    expect(less).toBeDisabled();
    for (let i = 0; i < 7; i++) await user.click(more);
    expect(more).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Ajouter le meuble' }));
    expect(props.create).toHaveBeenCalledWith({ name: 'Frigo 2', kind: 'fridge', shelfCount: 8 });
    expect(props.onCreated).toHaveBeenCalled();
  });

  it('shows a field error in words, under the field and linked to it', async () => {
    const { user, props } = setup();
    const name = screen.getByLabelText('Nom du meuble');
    await user.clear(name);
    await user.type(name, 'frigo');
    await user.click(screen.getByRole('button', { name: 'Ajouter le meuble' }));
    expect(name).toHaveAccessibleDescription(
      'Un meuble porte déjà ce nom : choisissez-en un autre.',
    );
    expect(name).toHaveAttribute('aria-invalid', 'true');
    await user.clear(name);
    await user.click(screen.getByRole('button', { name: 'Ajouter le meuble' }));
    expect(name).toHaveAccessibleDescription('Donnez un nom au meuble (40 caractères au plus).');
    expect(props.create).not.toHaveBeenCalled();
  });

  it('says that the network is needed, offline, and sends nothing', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { user, props } = setup();
    await user.click(screen.getByRole('button', { name: 'Ajouter le meuble' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Pas de connexion/);
    expect(props.create).not.toHaveBeenCalled();
  });

  it('disables the button only while sending, and shows the refusal of the server', async () => {
    let fail!: (error: unknown) => void;
    const create = vi.fn(
      () =>
        new Promise<LocationDto>((_resolve, reject) => {
          fail = reject;
        }),
    );
    const { user } = setup({ create });
    const submit = screen.getByRole('button', { name: 'Ajouter le meuble' });
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(screen.getByRole('button', { name: 'Ajout…' })).toBeDisabled();
    fail(new ApiError(409, 'Vous avez déjà 12 meubles : c’est le maximum.'));
    expect(await screen.findByRole('alert')).toHaveTextContent('12 meubles');
    expect(screen.getByRole('button', { name: 'Ajouter le meuble' })).toBeEnabled();
  });
});

const place = (id: number, name: string, kind: HomeLocationDto['kind']): HomeLocationDto => ({
  id,
  name,
  kind,
  icon: 'x',
  counts: { products: 0, units: 0, expiringSoon: 0 },
  shelves: [],
  unshelved: [],
});

describe('HomeView and the furniture', () => {
  it('ends the grid with an « Ajouter un meuble » button, the name under each card', async () => {
    const home: HomeResponse = {
      locations: [
        place(1, 'Frigo', 'fridge'),
        place(2, 'Frigo garage', 'fridge'),
        place(3, 'Frigo cave', 'fridge'),
      ],
    };
    render(<HomeView load={async () => home} />);
    const add = await screen.findByRole('button', { name: 'Ajouter un meuble' });
    expect(add).toHaveClass('tap-target');
    const items = screen.getAllByRole('listitem');
    expect(items.at(-1)).toContainElement(add);
    for (const name of ['Frigo', 'Frigo garage', 'Frigo cave']) {
      expect(screen.getByRole('link', { name: new RegExp(`^${name}\\s*\\d`) })).toBeVisible();
    }
  });

  it('shows a message and a single button when the house has no furniture', async () => {
    render(<HomeView load={async () => ({ locations: [] })} />);
    expect(
      await screen.findByRole('heading', { name: 'Aucun meuble pour l’instant' }),
    ).toBeVisible();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Ajouter votre premier meuble' })).toBeVisible();
  });

  it('replaces the button by a note at 12 pieces of furniture', async () => {
    const home: HomeResponse = {
      locations: Array.from({ length: 12 }, (_, i) => place(i + 1, `Meuble ${i + 1}`, 'other')),
    };
    render(<HomeView load={async () => home} />);
    expect(await screen.findByText(/12 meubles au plus/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Ajouter un meuble' })).toBeNull();
  });

  it('after a creation, focuses the new card and announces it', async () => {
    let home: HomeResponse = { locations: [place(1, 'Frigo', 'fridge')] };
    const load = vi.fn(async () => home);
    const user = userEvent.setup();
    const { container } = render(<HomeView load={load} />);
    await user.click(await screen.findByRole('button', { name: 'Ajouter un meuble' }));
    const sheet = screen.getByRole('dialog', { name: 'Ajouter un meuble' });
    expect(within(sheet).getByLabelText('Nom du meuble')).toHaveValue('Frigo 2');
    // The server answers with the new piece of furniture; the house is loaded again.
    home = { locations: [place(1, 'Frigo', 'fridge'), place(9, 'Frigo 2', 'fridge')] };
    places.createLocation.mockResolvedValue(created());
    await user.click(within(sheet).getByRole('button', { name: 'Ajouter le meuble' }));
    const card = await screen.findByRole('link', { name: /^Frigo 2/ });
    await waitFor(() => expect(card).toHaveFocus());
    expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent(
      'Frigo 2 est ajouté à la maison.',
    );
  });
});
