import type { StatsDto } from '@inventaire/shared';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/api';
import { formatWasteRate, StatsView } from './StatsView';

const stats: StatsDto = {
  days: 30,
  consumed: 30,
  wasted: 10,
  wasteRate: 0.25,
  topWasted: [
    { productId: 1, name: 'Yaourt', units: 6 },
    { productId: 2, name: 'Pain de mie', units: 3 },
  ],
};

describe('StatsView', () => {
  it('shows consumed, wasted, the waste rate and the top wasted table', async () => {
    render(<StatsView load={async () => stats} />);
    const consumed = (await screen.findByText('Consommé')).closest('div')!;
    expect(consumed).toHaveTextContent('30');
    expect(screen.getByText('Jeté').closest('div')).toHaveTextContent('10');
    expect(screen.getByText('Taux de gaspillage').closest('div')).toHaveTextContent('25 %');
    const table = screen.getByRole('table', { name: /plus jetés/ });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent('Yaourt');
    expect(rows[1]).toHaveTextContent('6 unités');
    expect(rows[2]).toHaveTextContent('3 unités');
  });

  it('says there is nothing yet when no unit left the stock', async () => {
    render(
      <StatsView
        load={async () => ({ days: 30, consumed: 0, wasted: 0, wasteRate: null, topWasted: [] })}
      />,
    );
    expect(await screen.findByText('Pas encore de statistiques')).toBeInTheDocument();
    expect(screen.getByText('Taux de gaspillage').closest('div')).toHaveTextContent('–');
    expect(screen.getByText('Rien n’a été jeté sur la période.')).toBeInTheDocument();
  });

  it('shows the error of the server', async () => {
    render(
      <StatsView
        load={async () => {
          throw new ApiError(500, 'Erreur du serveur');
        }}
      />,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Erreur du serveur');
  });

  it('formats the rate', () => {
    expect(formatWasteRate(0.333)).toBe('33 %');
    expect(formatWasteRate(null)).toBe('–');
  });
});
