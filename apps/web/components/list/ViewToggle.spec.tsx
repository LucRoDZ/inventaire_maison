import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ViewToggle } from './ViewToggle';

describe('ViewToggle', () => {
  it('marks the active view and moves the thumb with a transform only', () => {
    const { rerender } = render(<ViewToggle value="home" onChange={() => undefined} />);
    expect(screen.getByRole('group', { name: 'Affichage' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Maison' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Liste' })).toHaveAttribute('aria-pressed', 'false');
    const thumb = screen.getByTestId('view-toggle-thumb');
    expect(thumb.className).toContain('translate-x-0');
    expect(thumb.className).toContain('motion-reduce:transition-none');
    rerender(<ViewToggle value="list" onChange={() => undefined} />);
    expect(thumb.className).toContain('translate-x-full');
    expect(screen.getByRole('button', { name: 'Liste' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('works with the keyboard (Tab, Enter, Space)', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ViewToggle value="home" onChange={onChange} />);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Maison' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Liste' })).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenCalledWith('list');
  });

  it('keeps the labels and aria state when reduced motion is on', () => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    const onChange = vi.fn();
    render(<ViewToggle value="list" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Maison' }));
    expect(onChange).toHaveBeenCalledWith('home');
    expect(screen.getByRole('button', { name: 'Liste' })).toHaveAttribute('aria-pressed', 'true');
  });
});
