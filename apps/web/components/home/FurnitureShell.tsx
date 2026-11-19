import type { LocationKind } from '@inventaire/shared';
import type { CSSProperties, ReactNode } from 'react';

interface Door {
  hinge: 'left' | 'right';
  /** Where the swinging face stops: edge-on, beside the body. */
  angle: string;
}

const SWING_DOORS: Door[] = [
  { hinge: 'left', angle: '-90deg' },
  { hinge: 'right', angle: '90deg' },
];

/** The doors of each kind of furniture. The drawing follows the kind, never a name. */
export const DOORS: Record<LocationKind, Door[]> = {
  fridge: [{ hinge: 'left', angle: '-90deg' }],
  freezer: [{ hinge: 'left', angle: '-90deg' }],
  pantry: SWING_DOORS,
  cellar: SWING_DOORS,
  other: SWING_DOORS,
};

interface FurnitureShellProps {
  kind: LocationKind;
  /** The real content: shelves and tray. Only this part is read and focusable. */
  children: ReactNode;
  className?: string;
  /** Custom properties of the shelves (count, tray), read by furniture.css. */
  shelvesStyle?: CSSProperties;
}

/**
 * A piece of furniture seen from the front: body, door(s) and, except in the freezer, a thin amber
 * light along its top edge. The body takes the whole width; each open door is a slat of 20 px at
 * most along its edge, as high as the body. The doors swing open when the shell appears; they are
 * scenery (hidden from assistive technology, never in the way of a tap or a drag).
 */
export function FurnitureShell({
  kind,
  children,
  className = '',
  shelvesStyle,
}: FurnitureShellProps) {
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
            <span className="fx-door-back" />
            <span className="fx-door-face">
              <span className="fx-gloss" />
              <span className="fx-handle" />
            </span>
          </span>
        ))}
        <div className="fx-body">
          {kind === 'freezer' ? null : <span className="fx-light" aria-hidden="true" />}
          <div className="fx-shelves flex flex-col" style={shelvesStyle}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
