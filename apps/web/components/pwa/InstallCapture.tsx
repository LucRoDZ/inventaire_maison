'use client';

import { useEffect } from 'react';
import { listenForInstallPrompt } from '../../lib/install';

/** Keeps the browser's install event from the first page on, login page included. */
export function InstallCapture() {
  useEffect(() => {
    listenForInstallPrompt();
  }, []);
  return null;
}
