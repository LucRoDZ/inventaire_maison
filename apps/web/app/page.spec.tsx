import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HomePage from './page';

describe('HomePage', () => {
  it('affiche le titre provisoire', () => {
    render(<HomePage />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Inventaire maison' }),
    ).toBeInTheDocument();
  });
});
