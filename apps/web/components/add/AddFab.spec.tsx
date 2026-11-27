import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AddFab } from './AddFab';

vi.mock('./AddMenuSheet', () => ({ AddMenuSheet: () => null }));

afterEach(() =>
  Object.defineProperty(window, 'visualViewport', { value: null, configurable: true }),
);

describe('AddFab', () => {
  it('is a centred indigo pill named « Ajouter un produit »', () => {
    render(<AddFab />);
    const button = screen.getByRole('button', { name: 'Ajouter un produit' });
    expect(button).toHaveTextContent('Ajouter');
    expect(button).toHaveClass('left-1/2', '-translate-x-1/2', 'h-12', 'bg-indigo', 'text-white');
    expect(button).not.toHaveClass('right-4');
  });

  it('hides while the keyboard is open', () => {
    const viewport = new EventTarget() as EventTarget & { height: number };
    viewport.height = 800;
    Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    render(<AddFab />);
    expect(screen.getByRole('button', { name: 'Ajouter un produit' })).toBeInTheDocument();
    act(() => {
      viewport.height = 380;
      viewport.dispatchEvent(new Event('resize'));
    });
    expect(screen.queryByRole('button', { name: 'Ajouter un produit' })).toBeNull();
  });
});
