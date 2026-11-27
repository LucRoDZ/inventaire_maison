import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QuantityControl } from './QuantityControl';

function setup(props: Partial<Parameters<typeof QuantityControl>[0]> = {}) {
  return render(
    <QuantityControl
      value={2}
      label="Quantité de Lait"
      decreaseLabel="Moins"
      increaseLabel="Plus"
      {...props}
    />,
  );
}

describe('QuantityControl', () => {
  it('steps and clamps', () => {
    const onChange = vi.fn();
    const onStep = vi.fn();
    setup({ onChange, onStep, max: 3 });
    fireEvent.click(screen.getByRole('button', { name: 'Plus' }));
    fireEvent.click(screen.getByRole('button', { name: 'Moins' }));
    expect(onChange).toHaveBeenNthCalledWith(1, 3);
    expect(onChange).toHaveBeenNthCalledWith(2, 1);
    expect(onStep).toHaveBeenNthCalledWith(1, 1);
    expect(onStep).toHaveBeenNthCalledWith(2, -1);
  });

  it('disables at the bounds', () => {
    setup({ value: 1, min: 1 });
    expect(screen.getByRole('button', { name: 'Moins' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Plus' })).toBeEnabled();
  });

  it('has no background or shape on buttons', () => {
    setup();
    for (const name of ['Moins', 'Plus']) {
      const cls = screen.getByRole('button', { name }).className;
      expect(cls).not.toMatch(/rounded|bg-|hover:bg/);
      expect(cls).toContain('active:opacity-50');
    }
  });

  it('shows the value in a tabular element', () => {
    setup({ valueLabel: 'Quantité' });
    expect(screen.getByLabelText('Quantité')).toHaveTextContent('2');
    expect(screen.getByRole('group', { name: 'Quantité de Lait' })).toBeInTheDocument();
  });
});
