import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BottomNav, isActive } from './BottomNav';

let pathname = '/inventaire';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

beforeEach(() => {
  pathname = '/inventaire';
});

describe('BottomNav', () => {
  it('shows the three tabs in order', () => {
    render(<BottomNav />);
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Inventaire', 'Courses', 'Plus']);
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/inventaire', '/courses', '/plus']);
  });

  it('has no Scanner tab: the scanner opens from the Ajouter button', () => {
    render(<BottomNav />);
    expect(screen.queryByRole('link', { name: 'Scanner' })).toBeNull();
  });

  it('keeps Inventaire current on a sub-page', () => {
    pathname = '/inventaire/frigo';
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: 'Inventaire' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Courses' })).not.toHaveAttribute('aria-current');
  });

  it('highlights the active tab in indigo', () => {
    pathname = '/plus';
    render(<BottomNav />);
    const active = screen.getByRole('link', { name: 'Plus' });
    expect(active).toHaveClass('text-indigo');
    expect(active).not.toHaveClass('text-grey');
  });

  it('is a labelled navigation landmark', () => {
    render(<BottomNav />);
    expect(screen.getByRole('navigation', { name: 'Navigation principale' })).toBeInTheDocument();
  });
});

describe('isActive', () => {
  it('matches the page itself and its sub-pages', () => {
    expect(isActive('/courses', '/courses')).toBe(true);
    expect(isActive('/plus', '/courses')).toBe(false);
  });

  it('does not confuse similar prefixes', () => {
    expect(isActive('/plus-tard', '/plus')).toBe(false);
    expect(isActive('/plus/compte', '/plus')).toBe(true);
  });
});
