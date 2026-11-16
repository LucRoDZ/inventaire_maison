import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const droppable = vi.hoisted(() => ({ isOver: false }));
vi.mock('@dnd-kit/core', () => ({
  useDroppable: () => ({ setNodeRef: () => undefined, isOver: droppable.isOver }),
}));
import { DroppableShelf } from './DroppableShelf';

const zone = () =>
  render(
    <DroppableShelf id="shelf:2:21">
      <section aria-label="Étagère 1">
        <h3>Étagère 1</h3>
      </section>
    </DroppableShelf>,
  );

describe('DroppableShelf', () => {
  it('is plain while nothing is over it', () => {
    droppable.isOver = false;
    const { container } = zone();
    expect(container.firstElementChild).not.toHaveClass('ring-amber');
    expect(container.firstElementChild).not.toHaveClass('fx-over');
  });

  it('keeps its amber ring and adds the amber halo while a tile is over it', () => {
    droppable.isOver = true;
    const { container } = zone();
    expect(container.firstElementChild).toHaveClass('ring-amber', 'ring-4', 'fx-over');
  });

  it('never changes the accessible name of the shelf', () => {
    for (const over of [false, true]) {
      droppable.isOver = over;
      const { unmount } = zone();
      expect(screen.getByRole('region', { name: 'Étagère 1' })).toBeInTheDocument();
      unmount();
    }
  });
});
