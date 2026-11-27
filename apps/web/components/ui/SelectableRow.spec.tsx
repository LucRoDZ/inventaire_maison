import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SelectableRow } from './SelectableRow';

describe('SelectableRow', () => {
  it('checks when the label is clicked, named after the product', async () => {
    const onChange = vi.fn();
    render(<SelectableRow name="Lait" checked={false} onChange={onChange} detail="1 L" />);
    await userEvent.click(screen.getByText('1 L'));
    expect(onChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole('checkbox', { name: 'Lait' })).toBeInTheDocument();
  });

  it('has a 44 px target, an initial without picture and a meta', () => {
    render(<SelectableRow name="lait" checked onChange={() => {}} meta="2 en stock" />);
    const box = screen.getByRole('checkbox', { name: 'lait' });
    expect(box).toBeChecked();
    expect(box.className).toMatch(/tap-target|size-11/);
    expect(screen.getByText('L')).toBeInTheDocument();
    expect(screen.getByText('2 en stock')).toBeInTheDocument();
  });

  it('shows the picture when there is one', () => {
    const { container } = render(
      <SelectableRow name="Lait" checked={false} onChange={() => {}} imageUrl="/x.webp" />,
    );
    expect(container.querySelector('img')).toHaveAttribute('src', '/x.webp');
  });
});
