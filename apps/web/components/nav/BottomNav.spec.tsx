import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BottomNav, isActive } from './BottomNav';

let pathname = '/inventaire';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

beforeEach(() => {
  pathname = '/inventaire';
});

describe('BottomNav', () => {
  it('shows the four tabs in order', () => {
    render(<BottomNav />);
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Scanner', 'Inventaire', 'Courses', 'Plus']);
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/scanner',
      '/inventaire',
      '/courses',
      '/plus',
    ]);
  });

  it('marks only the Scanner tab as current on /scanner', () => {
    pathname = '/scanner';
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: 'Scanner' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Inventaire' })).not.toHaveAttribute('aria-current');
  });

  it('keeps Inventaire current on a sub-page', () => {
    pathname = '/inventaire/frigo';
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: 'Inventaire' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Scanner' })).not.toHaveAttribute('aria-current');
  });

  it('highlights the active tab in amber', () => {
    pathname = '/plus';
    render(<BottomNav />);
    const active = screen.getByRole('link', { name: 'Plus' });
    expect(active.querySelector('span')).toHaveClass('bg-amber');
  });

  it('is a labelled navigation landmark', () => {
    render(<BottomNav />);
    expect(screen.getByRole('navigation', { name: 'Navigation principale' })).toBeInTheDocument();
  });
});

describe('isActive', () => {
  it('matches the page itself and its sub-pages', () => {
    expect(isActive('/scanner', '/scanner')).toBe(true);
    expect(isActive('/plus', '/scanner')).toBe(false);
  });

  it('does not confuse similar prefixes', () => {
    expect(isActive('/plus-tard', '/plus')).toBe(false);
    expect(isActive('/plus/compte', '/plus')).toBe(true);
  });
});
