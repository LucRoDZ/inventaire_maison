import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Check, Trash2 } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorMessage, humanError } from './ErrorMessage';
import { FadeImage } from './FadeImage';
import {
  EmptyFurnitureIllustration,
  EmptyShoppingIllustration,
  NothingToSyncIllustration,
} from './Illustrations';
import { ListSkeleton } from './Skeleton';
import { SwipeRow } from './SwipeRow';

function swipe(target: HTMLElement, dx: number, dy = 0) {
  const at = (x: number, y: number) => ({
    pointerId: 1,
    isPrimary: true,
    clientX: x,
    clientY: y,
  });
  fireEvent.pointerDown(target, at(200, 100));
  fireEvent.pointerMove(target, at(200 + dx, 100 + dy));
  fireEvent.pointerUp(target, at(200 + dx, 100 + dy));
}

function row() {
  const right = vi.fn();
  const left = vi.fn();
  render(
    <SwipeRow
      right={{ label: 'Consommé', icon: Check, tone: 'consumed', run: right }}
      left={{ label: 'Jeté', icon: Trash2, tone: 'wasted', run: left }}
    >
      <button type="button">Contenu</button>
    </SwipeRow>,
  );
  return { right, left, content: screen.getByRole('button', { name: 'Contenu' }).parentElement! };
}

describe('SwipeRow', () => {
  it('runs « Consommé » to the right and « Jeté » to the left past 72 px', () => {
    const { right, left, content } = row();
    swipe(content, 90);
    expect(right).toHaveBeenCalledTimes(1);
    swipe(content, -90);
    expect(left).toHaveBeenCalledTimes(1);
  });

  it('does nothing below the threshold, nor on a vertical gesture', () => {
    const { right, left, content } = row();
    swipe(content, 60);
    swipe(content, -60);
    swipe(content, 30, 80);
    expect(right).not.toHaveBeenCalled();
    expect(left).not.toHaveBeenCalled();
  });

  it('keeps the layer out of the accessibility tree and the content reachable', () => {
    row();
    const layer = document.querySelector('[data-swipe-layer]')!;
    expect(layer).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('button', { name: 'Contenu' })).toBeInTheDocument();
  });

  it('claims the horizontal gesture only: touch-action leaves the vertical scroll alone', () => {
    const { content } = row();
    expect(content.style.touchAction).toBe('pan-y');
  });

  it('does not swipe when disabled', () => {
    const run = vi.fn();
    render(
      <SwipeRow
        disabled
        right={{ label: 'a', icon: Check, tone: 'consumed', run }}
        left={{ label: 'b', icon: Trash2, tone: 'wasted', run }}
      >
        <span>x</span>
      </SwipeRow>,
    );
    swipe(screen.getByText('x').parentElement!, 120);
    expect(run).not.toHaveBeenCalled();
  });
});

describe('loading and empty states', () => {
  it('shows skeleton blocks hidden from assistive technology, in one status region', () => {
    render(<ListSkeleton rows={3} />);
    const status = screen.getByRole('status', { name: 'Chargement' });
    expect(status.querySelectorAll('.skeleton')).toHaveLength(3);
    expect(status.querySelector('.skeleton')).toHaveAttribute('aria-hidden', 'true');
  });

  it('puts a picture on a skeleton until it has loaded, then fades it in', () => {
    render(<FadeImage src="/a.webp" />);
    const img = document.querySelector('img')!;
    expect(img).toHaveClass('skeleton');
    fireEvent.load(img);
    expect(img).toHaveClass('image-in');
    expect(img).not.toHaveClass('skeleton');
    expect(img).toHaveAttribute('alt', '');
  });

  it('draws three decorative illustrations on the tokens', () => {
    const { container } = render(
      <>
        <EmptyFurnitureIllustration />
        <EmptyShoppingIllustration />
        <NothingToSyncIllustration />
      </>,
    );
    const svgs = container.querySelectorAll('svg');
    expect(svgs).toHaveLength(3);
    for (const svg of svgs) expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(container.innerHTML).toContain('var(--illustration-surface)');
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,6}/i);
  });
});

describe('ErrorMessage', () => {
  it('says it plainly and offers « Réessayer »', async () => {
    const retry = vi.fn();
    render(<ErrorMessage message="Impossible de charger la liste." onRetry={retry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Impossible de charger la liste.');
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(retry).toHaveBeenCalled();
  });

  it('never shows technical text', () => {
    const fallback = 'Un souci est survenu.';
    expect(humanError('TypeError: Failed to fetch', fallback)).toBe(fallback);
    expect(humanError('500 Internal Server Error', fallback)).toBe(fallback);
    expect(humanError('', fallback)).toBe(fallback);
    expect(humanError('Ce produit est déjà dans la liste.', fallback)).toBe(
      'Ce produit est déjà dans la liste.',
    );
  });
});
