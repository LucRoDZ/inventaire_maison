import type { LocationKind } from '@inventaire/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DOORS, FurnitureShell } from './FurnitureShell';

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex], [contenteditable]';

// Open, the swinging face is edge-on (±90°): only the 20 px slat beside the body is seen.
const EXPECTED: Record<LocationKind, { hinge: string; angle: string }[]> = {
  fridge: [{ hinge: 'left', angle: '-90deg' }],
  freezer: [{ hinge: 'left', angle: '-90deg' }],
  pantry: [
    { hinge: 'left', angle: '-90deg' },
    { hinge: 'right', angle: '90deg' },
  ],
  cellar: [
    { hinge: 'left', angle: '-90deg' },
    { hinge: 'right', angle: '90deg' },
  ],
  other: [
    { hinge: 'left', angle: '-90deg' },
    { hinge: 'right', angle: '90deg' },
  ],
};

const shell = (kind: LocationKind) =>
  render(
    <FurnitureShell kind={kind}>
      <h3>Étagère 1</h3>
      <button type="button">Lait, quantité 3</button>
    </FurnitureShell>,
  );

describe('FurnitureShell', () => {
  it('knows the five kinds of furniture', () => {
    expect(Object.keys(DOORS).sort()).toEqual(['cellar', 'freezer', 'fridge', 'other', 'pantry']);
  });

  for (const kind of Object.keys(EXPECTED) as LocationKind[]) {
    describe(kind, () => {
      it('draws its door(s) with the hinge side and the final angle', () => {
        const { container } = shell(kind);
        const scene = container.querySelector<HTMLElement>('.fx-scene')!;
        expect(scene).toHaveAttribute('data-kind', kind);
        const doors = [...container.querySelectorAll<HTMLElement>('.fx-door')];
        expect(
          doors.map((door) => ({
            hinge: door.getAttribute('data-hinge'),
            angle: door.style.getPropertyValue('--fx-angle'),
          })),
        ).toEqual(EXPECTED[kind]);
        expect(scene.style.getPropertyValue('--fx-doors')).toBe(String(EXPECTED[kind].length));
        for (const door of doors) {
          expect(door.querySelector('.fx-door-face .fx-gloss')).not.toBeNull();
          expect(door.querySelector('.fx-door-face .fx-handle')).not.toBeNull();
          expect(door.querySelector('.fx-door-back')).not.toBeNull();
        }
      });

      it('has one light inside the body, none in the freezer', () => {
        const { container } = shell(kind);
        const lights = kind === 'freezer' ? 0 : 1;
        expect(container.querySelectorAll('.fx-body > .fx-light')).toHaveLength(lights);
        expect(container.querySelectorAll('.fx-light')).toHaveLength(lights);
      });

      it('has no frost: no dotted edging on the body', () => {
        const { container } = shell(kind);
        expect(container.querySelectorAll('.fx-frost')).toHaveLength(0);
      });

      it('hides all the scenery from assistive technology', () => {
        const { container } = shell(kind);
        const scenery = container.querySelectorAll('.fx-door, .fx-light');
        expect(scenery.length).toBeGreaterThanOrEqual(kind === 'freezer' ? 1 : 2);
        for (const piece of scenery) expect(piece).toHaveAttribute('aria-hidden', 'true');
        // Nothing but the content has a role: one heading, one button.
        expect(screen.getAllByRole('heading')).toHaveLength(1);
        expect(screen.getAllByRole('button')).toHaveLength(1);
        expect(screen.queryByRole('img')).toBeNull();
      });

      it('adds no focusable element: Tab goes straight to the content', async () => {
        const { container } = shell(kind);
        const focusable = [...container.querySelectorAll(FOCUSABLE)];
        expect(focusable).toEqual([screen.getByRole('button', { name: 'Lait, quantité 3' })]);
        expect(
          container.querySelectorAll('.fx-door button, .fx-door a, button button'),
        ).toHaveLength(0);
        await userEvent.tab();
        expect(screen.getByRole('button', { name: 'Lait, quantité 3' })).toHaveFocus();
      });

      it('keeps the content inside the body, in order', () => {
        const { container } = shell(kind);
        const body = container.querySelector('.fx-body')!;
        expect(body).toContainElement(screen.getByRole('heading', { name: 'Étagère 1' }));
        expect(body).toContainElement(screen.getByRole('button'));
      });
    });
  }

  it('passes a class to the scene', () => {
    const { container } = render(
      <FurnitureShell kind="fridge" className="open-furniture">
        <p>x</p>
      </FurnitureShell>,
    );
    expect(container.querySelector('.fx-scene')).toHaveClass('open-furniture');
  });
});
