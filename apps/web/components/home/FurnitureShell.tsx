import type { LocationKind } from '@inventaire/shared';
import type { CSSProperties, ReactNode } from 'react';

interface Door {
  hinge: 'left' | 'right';
  /** Where the door stops once open. */
  angle: string;
}

const SWING_DOORS: Door[] = [
  { hinge: 'left', angle: '-88deg' },
  { hinge: 'right', angle: '88deg' },
];

/** The doors of each kind of furniture. The drawing follows the kind, never a name. */
export const DOORS: Record<LocationKind, Door[]> = {
  fridge: [{ hinge: 'left', angle: '-78deg' }],
  freezer: [{ hinge: 'left', angle: '-86deg' }],
  pantry: SWING_DOORS,
  cellar: SWING_DOORS,
  other: SWING_DOORS,
};

interface FurnitureShellProps {
  kind: LocationKind;
  /** The real content: shelves and tray. Only this part is read and focusable. */
  children: ReactNode;
  className?: string;
}

/**
 * A piece of furniture seen from the front: body, door(s) and inner light. The doors swing open
 * when the shell appears and stay open; they are scenery (hidden from assistive technology, never
 * in the way of a tap or a drag).
 */
export function FurnitureShell({ kind, children, className = '' }: FurnitureShellProps) {
  const doors = DOORS[kind];
  return (
    <div className="fx-frame">
      <div
        className={`fx-scene ${className}`}
        data-kind={kind}
        style={{ '--fx-doors': doors.length } as CSSProperties}
      >
        {doors.map((door) => (
          <span
            key={door.hinge}
            className="fx-door"
            data-hinge={door.hinge}
            style={{ '--fx-angle': door.angle } as CSSProperties}
            aria-hidden="true"
          >
            <span className="fx-door-face">
              <span className="fx-gloss" />
              <span className="fx-handle" />
            </span>
            <span className="fx-door-back" />
          </span>
        ))}
        <div className="fx-body">
          <span className="fx-light" aria-hidden="true" />
          {kind === 'freezer' ? <span className="fx-frost" aria-hidden="true" /> : null}
          <div className="fx-shelves flex flex-col">{children}</div>
        </div>
      </div>
    </div>
  );
}
