'use client';

import { Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { AddMenuSheet, type AddNotice } from './AddMenuSheet';
import { UndoToast } from './UndoToast';

/**
 * The round « Ajouter » button, above the bottom bar (the bar is a row of the layout, so the
 * button sits in the zone that scrolls, never over the bar). Opens the add menu.
 */
export function AddFab() {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<AddNotice | null>(null);
  const button = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label="Ajouter un produit"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="bg-amber text-on-amber shadow-card fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 flex size-14 items-center justify-center rounded-full"
      >
        <Plus size={28} aria-hidden="true" />
      </button>
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
