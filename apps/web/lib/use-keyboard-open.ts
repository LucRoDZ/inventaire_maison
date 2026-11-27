'use client';

import { useEffect, useState } from 'react';

const KEYBOARD_RATIO = 0.75;

function isKeyboardOpen(): boolean {
  if (typeof window === 'undefined' || !window.visualViewport) return false;
  return window.visualViewport.height < window.innerHeight * KEYBOARD_RATIO;
}

/** True while the on-screen keyboard covers the page (visual viewport under 75 % of the window). */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => setOpen(isKeyboardOpen());
    update();
    viewport.addEventListener('resize', update);
    return () => viewport.removeEventListener('resize', update);
  }, []);

  return open;
}
