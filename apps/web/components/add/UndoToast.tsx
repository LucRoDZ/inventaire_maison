'use client';

import { useEffect, useRef } from 'react';

export const UNDO_DURATION_MS = 5000;

interface UndoToastProps {
  message: string;
  onUndo: () => void;
  /** Called when the delay ends without a tap on Annuler. */
  onExpire: () => void;
  durationMs?: number;
  /** A second choice shown before Annuler (44 px), e.g. « Jeté ». */
  secondary?: { label: string; onClick: () => void };
}

/** Confirmation with an Annuler button for 5 s. */
// Amber on the indigo toast (contrast), never on white.
const UNDO_COLOR = 'text-amber'; // check-colors:allow

export function UndoToast({
  message,
  onUndo,
  onExpire,
  durationMs = UNDO_DURATION_MS,
  secondary,
}: UndoToastProps) {
  const expire = useRef(onExpire);
  useEffect(() => {
    expire.current = onExpire;
  });
  useEffect(() => {
    const timer = setTimeout(() => expire.current(), durationMs);
    return () => clearTimeout(timer);
  }, [durationMs, message]);

  return (
    <div
      role="status"
      className="rounded-card shadow-card bg-indigo fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-xl items-center justify-between gap-3 p-4 text-white"
    >
      <span className="min-w-0 flex-1">{message}</span>
      {secondary ? (
        <button
          type="button"
          onClick={secondary.onClick}
          className="tap-target px-2 font-semibold text-white underline underline-offset-4"
        >
          {secondary.label}
        </button>
      ) : null}
      <button
        type="button"
        onClick={onUndo}
        className={`tap-target px-2 font-semibold ${UNDO_COLOR}`}
      >
        Annuler
      </button>
    </div>
  );
}
