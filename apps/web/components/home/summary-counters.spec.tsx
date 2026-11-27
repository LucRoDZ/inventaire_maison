import type { StockSummaryDto } from '@inventaire/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SummaryCounters } from './SummaryCounters';

const summary: StockSummaryDto = { inStock: 24, today: 2, soon: 5, expired: 1, expiryAlertDays: 3 };

describe('SummaryCounters', () => {
  it('shows the three expiry counters as buttons, and no « En stock » tile', async () => {
    render(<SummaryCounters active={null} onSelect={vi.fn()} load={async () => summary} />);
    expect(await screen.findByText('5')).toBeInTheDocument();
    expect(screen.queryByText('En stock')).toBeNull();
    expect(screen.queryByText('24')).toBeNull();
    expect(screen.getByRole('button', { name: /À consommer aujourd’hui/ })).toHaveTextContent('2');
    expect(screen.getByRole('button', { name: /Bientôt/ })).toHaveTextContent('5');
    expect(screen.getByRole('button', { name: /Périmés/ })).toHaveTextContent('1');
  });

  it('is one row of three with full accessible names', async () => {
    render(<SummaryCounters active={null} onSelect={vi.fn()} load={async () => summary} />);
    await screen.findByText('5');
    const row = screen.getByRole('region', { name: 'Résumé du stock' });
    expect(row.className).toContain('grid-cols-3');
    expect(
      screen.getByRole('button', { name: /^2 ?À consommer aujourd’hui, ?Aujourd’hui$/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^1 ?Périmés$/ })).toHaveTextContent('Périmés');
  });

  it('sets the expiry filter, and clears it when the active counter is tapped again', async () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <SummaryCounters active={null} onSelect={onSelect} load={async () => summary} />,
    );
    await userEvent.click(await screen.findByRole('button', { name: /Bientôt/ }));
    expect(onSelect).toHaveBeenLastCalledWith('soon');
    rerender(<SummaryCounters active="soon" onSelect={onSelect} load={async () => summary} />);
    const active = screen.getByRole('button', { name: /Bientôt/ });
    expect(active).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(active);
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it('still renders when the summary cannot be loaded', async () => {
    render(
      <SummaryCounters
        active={null}
        onSelect={vi.fn()}
        load={async () => {
          throw new Error('x');
        }}
      />,
    );
    expect(await screen.findByRole('button', { name: /Périmés/ })).toBeInTheDocument();
  });
});
