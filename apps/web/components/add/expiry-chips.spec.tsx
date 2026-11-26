import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { addMonthsIso, longDate, relativeDays } from '../../lib/dates';
import { ExpiryChips } from './ExpiryChips';

describe('quick expiry dates', () => {
  it('offers +3 j, +1 sem and +1 mois counted from today', async () => {
    const onPick = vi.fn();
    render(<ExpiryChips value="" onPick={onPick} today="2026-11-26" />);
    await userEvent.click(screen.getByRole('button', { name: '+3 j, date limite dans 3 jours' }));
    await userEvent.click(
      screen.getByRole('button', { name: '+1 sem, date limite dans 1 semaine' }),
    );
    await userEvent.click(screen.getByRole('button', { name: '+1 mois, date limite dans 1 mois' }));
    expect(onPick.mock.calls.map(([iso]) => iso)).toEqual([
      '2026-11-29',
      '2026-12-03',
      '2026-12-26',
    ]);
  });

  it('says the date in relative terms and keeps the exact date for screen readers', () => {
    render(<ExpiryChips value="2026-11-29" onPick={() => undefined} today="2026-11-26" />);
    expect(screen.getByText('dans 3 jours')).toHaveAttribute('aria-hidden', 'true');
    const time = document.querySelector('time')!;
    expect(time).toHaveAttribute('datetime', '2026-11-29');
    expect(time).toHaveTextContent('29 novembre 2026');
  });

  it('computes relative days and month ends', () => {
    expect(relativeDays('2026-11-26', '2026-11-26')).toBe('aujourd’hui');
    expect(relativeDays('2026-11-27', '2026-11-26')).toBe('demain');
    expect(relativeDays('2026-11-24', '2026-11-26')).toBe('il y a 2 jours');
    expect(addMonthsIso('2026-01-31', 1)).toBe('2026-02-28');
    expect(longDate('2026-11-29')).toBe('29 novembre 2026');
  });
});
