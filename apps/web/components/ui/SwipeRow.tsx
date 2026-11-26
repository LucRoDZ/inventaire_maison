'use client';

import type { LucideIcon } from 'lucide-react';
import { useRef, useState, type PointerEvent, type ReactNode } from 'react';

/** Distance, in px, from which a release counts as a choice. */
export const SWIPE_THRESHOLD = 72;
/** Movement before the gesture is read as a swipe (horizontal) or as a scroll (vertical). */
const LOCK_DISTANCE = 8;
const MAX_PULL = SWIPE_THRESHOLD * 1.6;

export interface SwipeAction {
  /** Named action shown under the row while it is pulled (« Consommé », « Jeté »). */
  label: string;
  icon: LucideIcon;
  tone: 'consumed' | 'wasted';
  run: () => void;
}

interface SwipeRowProps {
  /** Pulled to the right: reveals this action on the left. */
  right: SwipeAction;
  /** Pulled to the left: reveals this action on the right. */
  left: SwipeAction;
  disabled?: boolean;
  children: ReactNode;
}

const TONES = {
  consumed: 'bg-swipe-consumed-bg text-swipe-consumed-ink',
  wasted: 'bg-swipe-wasted-bg text-swipe-wasted-ink',
} as const;

/**
 * A row that can be pulled sideways: right or left past 72 px runs the action under it. Only a
 * shortcut for touch: the buttons inside the row stay the path of the keyboard and of screen
 * readers, so the layer under the row is hidden from them. The vertical scroll is left to the
 * browser (`touch-action: pan-y`): the gesture is claimed only once it is clearly horizontal.
 */
export function SwipeRow({ right, left, disabled = false, children }: SwipeRowProps) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const locked = useRef(false);
  const moved = useRef(false);

  const reset = () => {
    start.current = null;
    locked.current = false;
    setDragging(false);
    setDx(0);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || !event.isPrimary) return;
    start.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
    locked.current = false;
    moved.current = false;
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const origin = start.current;
    if (!origin || origin.id !== event.pointerId) return;
    const deltaX = event.clientX - origin.x;
    const deltaY = event.clientY - origin.y;
    if (!locked.current) {
      if (Math.abs(deltaY) > LOCK_DISTANCE && Math.abs(deltaY) > Math.abs(deltaX)) {
        start.current = null; // a vertical scroll: not ours
        return;
      }
      if (Math.abs(deltaX) < LOCK_DISTANCE) return;
      locked.current = true;
      moved.current = true;
      setDragging(true);
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    setDx(Math.max(-MAX_PULL, Math.min(MAX_PULL, deltaX)));
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const origin = start.current;
    if (!origin || origin.id !== event.pointerId) return;
    const wasLocked = locked.current;
    const delta = event.clientX - origin.x;
    reset();
    if (!wasLocked) return;
    if (delta >= SWIPE_THRESHOLD) right.run();
    else if (delta <= -SWIPE_THRESHOLD) left.run();
  };

  const RightIcon = right.icon;
  const LeftIcon = left.icon;
  const revealed = dx > 0 ? right.tone : dx < 0 ? left.tone : null;

  return (
    <div className="relative" data-swipe-row>
      {/* The swipe layer: a shortcut for the finger only, the buttons do the same for the rest. */}
      <div
        aria-hidden="true"
        data-swipe-layer
        className={`rounded-card absolute inset-0 flex items-center justify-between px-5 font-semibold ${
          revealed ? TONES[revealed] : ''
        }`}
      >
        <span className={`flex items-center gap-2 ${dx > 0 ? '' : 'invisible'}`}>
          <RightIcon size={20} />
          {right.label}
        </span>
        <span className={`flex items-center gap-2 ${dx < 0 ? '' : 'invisible'}`}>
          {left.label}
          <LeftIcon size={20} />
        </span>
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={reset}
        onClickCapture={(event) => {
          // The release of a swipe is not a tap on the button under the finger.
          if (moved.current) {
            event.preventDefault();
            event.stopPropagation();
            moved.current = false;
          }
        }}
        style={{
          transform: dx === 0 ? undefined : `translateX(${dx}px)`,
          touchAction: disabled ? undefined : 'pan-y',
          transition: dragging ? 'none' : 'transform 200ms cubic-bezier(0.2, 0, 0, 1)',
        }}
        className="relative"
      >
        {children}
      </div>
    </div>
  );
}
