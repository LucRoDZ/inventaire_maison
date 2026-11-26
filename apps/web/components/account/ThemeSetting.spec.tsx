import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { THEME_KEY } from '../../lib/theme';
import { ThemeSetting } from './ThemeSetting';

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('ThemeSetting', () => {
  it('is automatic by default', () => {
    render(<ThemeSetting />);
    expect(screen.getByRole('radio', { name: 'Automatique' })).toBeChecked();
  });

  it('applies and remembers the chosen theme', async () => {
    render(<ThemeSetting />);
    await userEvent.click(screen.getByRole('radio', { name: 'Sombre' }));
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(window.localStorage.getItem(THEME_KEY)).toBe('dark');
    await userEvent.click(screen.getByRole('radio', { name: 'Clair' }));
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(window.localStorage.getItem(THEME_KEY)).toBe('light');
  });

  it('shows the saved choice', () => {
    window.localStorage.setItem(THEME_KEY, 'dark');
    render(<ThemeSetting />);
    expect(screen.getByRole('radio', { name: 'Sombre' })).toBeChecked();
  });
});
