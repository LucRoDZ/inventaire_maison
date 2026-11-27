import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addNotice } from '../../lib/add-notice';
import { AddFab } from './AddFab';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

vi.mock('../../lib/stock-api', () => ({
  fetchLocations: async () => [],
  fetchCategories: async () => [],
}));

const openMenu = async () => {
  const user = userEvent.setup();
  render(<AddFab />);
  const fab = screen.getByRole('button', { name: 'Ajouter un produit' });
  await user.click(fab);
  return { user, fab, dialog: screen.getByRole('dialog', { name: 'Ajouter' }) };
};

beforeEach(() => {
  vi.clearAllMocks();
  addNotice.clear();
});

describe('add menu', () => {
  it('exposes the button as the opener of a dialog', () => {
    render(<AddFab />);
    expect(screen.getByRole('button', { name: 'Ajouter un produit' })).toHaveAttribute(
      'aria-haspopup',
      'dialog',
    );
  });

  it('closes with Escape and gives the focus back to the button', async () => {
    const { user, fab } = await openMenu();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fab).toHaveFocus();
  });

  it('closes with a tap on the background', async () => {
    const { user, fab, dialog } = await openMenu();
    await user.click(dialog.parentElement!);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fab).toHaveFocus();
  });

  it('keeps the focus inside the sheet while tabbing', async () => {
    const { user, dialog } = await openMenu();
    for (let i = 0; i < 6; i += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    await user.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('scans through the scanner route', async () => {
    const { user } = await openMenu();
    await user.click(screen.getByRole('button', { name: /^Scanner/ }));
    expect(push).toHaveBeenCalledWith('/scanner');
  });

  it('closes the sheet and opens the « Ajouter à nouveau » page', async () => {
    const { user } = await openMenu();
    await user.click(screen.getByRole('button', { name: /^Ajouter à nouveau/ }));
    expect(push).toHaveBeenCalledWith('/ajouter-a-nouveau');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens the catalogue search for a manual add', async () => {
    const { user } = await openMenu();
    await user.click(screen.getByRole('button', { name: /^Ajouter manuellement/ }));
    expect(screen.getByLabelText('Nom du produit')).toBeInTheDocument();
    await act(async () => undefined);
  });
});

describe('add notice shown by the Fab', () => {
  const announce = () => {
    const undo = vi.fn(async () => undefined);
    const commit = vi.fn();
    act(() => addNotice.show({ message: '2 produits ajoutés', undo, commit }));
    return { undo, commit };
  };

  it('shows the announcement', () => {
    render(<AddFab />);
    announce();
    expect(screen.getByRole('status')).toHaveTextContent('2 produits ajoutés');
  });

  it('undoes without committing on Annuler', async () => {
    const user = userEvent.setup();
    render(<AddFab />);
    const { undo, commit } = announce();
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(undo).toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('commits when the delay ends', () => {
    vi.useFakeTimers();
    try {
      render(<AddFab />);
      const { commit } = announce();
      act(() => {
        vi.advanceTimersByTime(5100);
      });
      expect(commit).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('status')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('commits when the Fab goes away without an undo', () => {
    const { unmount } = render(<AddFab />);
    const { commit } = announce();
    unmount();
    expect(commit).toHaveBeenCalledTimes(1);
  });
});
