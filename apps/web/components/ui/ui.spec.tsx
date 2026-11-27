import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Apple } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { Callout } from './Callout';
import { Card } from './Card';
import { IconBadge } from './IconBadge';
import { StatCard } from './StatCard';

describe('Card', () => {
  it('renders its content in an article', () => {
    render(
      <Card aria-label="Lait">
        <p>Lait demi-écrémé</p>
      </Card>,
    );
    expect(screen.getByRole('article', { name: 'Lait' })).toHaveTextContent('Lait demi-écrémé');
  });
});

describe('StatCard', () => {
  it('exposes the label and the figure as a group', () => {
    render(<StatCard label="Articles au Frigo" value={12} />);
    const group = screen.getByRole('group', { name: 'Articles au Frigo' });
    expect(group).toHaveTextContent('12');
  });
});

describe('Callout', () => {
  it('is a note by default and shows its title', () => {
    render(<Callout title="Pas de connexion">L’ajout est indisponible.</Callout>);
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent('Pas de connexion');
    expect(note).toHaveTextContent('L’ajout est indisponible.');
  });

  it('can be announced as an alert or a status', () => {
    const { rerender } = render(<Callout role="alert">Erreur</Callout>);
    expect(screen.getByRole('alert')).toHaveTextContent('Erreur');
    rerender(<Callout role="status">Nouvelle version</Callout>);
    expect(screen.getByRole('status')).toHaveTextContent('Nouvelle version');
  });
});

describe('IconBadge', () => {
  it('is hidden from assistive technology without a label', () => {
    const { container } = render(<IconBadge icon={Apple} />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('is an image with an accessible name when labelled', () => {
    render(<IconBadge icon={Apple} label="Fruits et légumes" />);
    expect(screen.getByRole('img', { name: 'Fruits et légumes' })).toBeInTheDocument();
  });
});

describe('Button', () => {
  it('is a button, of type button by default, and reacts to clicks', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Ajouter</Button>);
    const button = screen.getByRole('button', { name: 'Ajouter' });
    expect(button).toHaveAttribute('type', 'button');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it.each([
    ['primary', 'bg-indigo', 'text-white'],
    ['outline', 'bg-fill-quiet', 'text-ink'],
    ['destructive', 'text-alert', 'bg-transparent'],
    ['secondary', 'text-indigo-mid', 'bg-transparent'],
  ] as const)('applies the %s variant', (variant, ...classes) => {
    render(<Button variant={variant}>Action</Button>);
    expect(screen.getByRole('button')).toHaveClass(...classes);
  });

  it('keeps a 44 px tap target', () => {
    render(<Button>Action</Button>);
    expect(screen.getByRole('button')).toHaveClass('tap-target');
  });

  it('can be disabled', () => {
    render(<Button disabled>Action</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
