'use client';

import { ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { isInAppBrowser } from '../../lib/platform';
import { Callout } from '../ui/Callout';

/** Shown inside Instagram, Facebook or WhatsApp, whose browsers block the camera. */
export function InAppBrowserNotice({ userAgent }: { userAgent?: string }) {
  const [inApp, setInApp] = useState(false);
  useEffect(() => {
    setInApp(isInAppBrowser(userAgent));
  }, [userAgent]);
  if (!inApp) return null;
  return (
    <Callout role="alert" icon={ExternalLink} title="Navigateur intégré">
      <p>Ouvrez cette page dans Safari ou Chrome : la caméra n’est pas disponible ici.</p>
    </Callout>
  );
}
