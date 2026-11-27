'use client';

import { Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { AddMenuSheet, type AddNotice } from './AddMenuSheet';
import { useKeyboardOpen } from '../../lib/use-keyboard-open';
import { UndoToast } from './UndoToast';

/**
 * The centred amber « Ajouter » pill (hidden while the keyboard is open), above the bottom bar (the bar is a row of the layout, so the
 * button sits in the zone that scrolls, never over the bar). Opens the add menu.
 */
export function AddFab() {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<AddNotice | null>(null);
  const keyboardOpen = useKeyboardOpen();
  const button = useRef<HTMLButtonElement>(null);

  return (
    <>
      {keyboardOpen ? null : (
        <button
          ref={button}
          type="button"
          aria-label="Ajouter un produit"
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
          className="bg-amber text-on-amber shadow-raised fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 z-30 flex h-12 -translate-x-1/2 items-center justify-center gap-2 rounded-full px-5 font-semibold"
        >
          <Plus size={20} aria-hidden="true" />
          Ajouter
        </button>
      )}
      {open ? (
        <AddMenuSheet onClose={() => setOpen(false)} onNotify={(next) => setNotice(next)} />
      ) : null}
      {notice ? (
        <UndoToast
          message={notice.message}
          onExpire={() => setNotice(null)}
          onUndo={() => {
            void notice.undo().catch(() => undefined);
            setNotice(null);
          }}
        />
      ) : null}
    </>
  );
}
