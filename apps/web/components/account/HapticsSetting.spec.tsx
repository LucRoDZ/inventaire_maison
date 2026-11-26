import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { readHaptics } from '../../lib/haptics';
import { HapticsSetting } from './HapticsSetting';

afterEach(() => window.localStorage.clear());

describe('HapticsSetting', () => {
  it('is on by default and remembers a change', async () => {
    render(<HapticsSetting />);
    const box = screen.getByRole('checkbox', { name: 'Retour tactile' });
    expect(box).toBeChecked();
    await userEvent.click(box);
    expect(box).not.toBeChecked();
    expect(readHaptics()).toBe(false);
  });

  it('shows the saved choice', () => {
    window.localStorage.setItem('inv_haptics', 'off');
    render(<HapticsSetting />);
    expect(screen.getByRole('checkbox', { name: 'Retour tactile' })).not.toBeChecked();
  });
});
