import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FullPageList } from './FullPageList';

function setup(props: Partial<React.ComponentProps<typeof FullPageList>> = {}) {
  return render(
    <FullPageList
      title="Produits"
      onBack={() => {}}
      toolbar={<input aria-label="Recherche" />}
      footer={<button>Valider</button>}
      {...props}
    >
      <p>Contenu</p>
    </FullPageList>,
  );
}

describe('FullPageList', () => {
  it('has one h1 and a back button', async () => {
    const onBack = vi.fn();
    setup({ onBack });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Retour' }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('has no back button without onBack', () => {
    setup({ onBack: undefined });
    expect(screen.queryByRole('button', { name: 'Retour' })).toBeNull();
  });

  it('keeps footer and toolbar outside the scroll region', () => {
    setup();
    const region = screen.getByRole('region', { name: 'Produits' });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(region).toContainElement(screen.getByText('Contenu'));
    expect(region).not.toContainElement(screen.getByRole('button', { name: 'Valider' }));
    expect(region).not.toContainElement(screen.getByLabelText('Recherche'));
  });

  it('shows skeletons instead of the children while loading', () => {
    const { container } = setup({ loading: true });
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
    expect(screen.queryByText('Contenu')).toBeNull();
  });

  it('shows the empty state instead of the children', () => {
    setup({ isEmpty: true, emptyState: <p>Rien ici</p> });
    expect(screen.getByText('Rien ici')).toBeInTheDocument();
    expect(screen.queryByText('Contenu')).toBeNull();
  });
});
