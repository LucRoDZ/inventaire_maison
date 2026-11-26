import '@fontsource/carlito/latin-400.css';
import '@fontsource/carlito/latin-700.css';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { InstallCapture } from '../components/pwa/InstallCapture';
import { OfflineCallout } from '../components/pwa/OfflineCallout';
import { RegisterSW } from '../components/pwa/RegisterSW';
import { APP_NAME, APP_SHORT_NAME, THEME_COLOR } from './manifest';

export const metadata: Metadata = {
  title: APP_NAME,
  applicationName: APP_NAME,
  robots: { index: false, follow: false },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: APP_SHORT_NAME, statusBarStyle: 'default' },
  // Next only emits the standard tag; Safari on iOS still reads the Apple one.
  other: { 'apple-mobile-web-app-capable': 'yes' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // Android: the keyboard shrinks the layout, so the scroll zone shrinks and the fixed header with
  // its search field stays on screen (iOS keeps the layout and pans to the field, at the top).
  interactiveWidget: 'resizes-content',
  themeColor: THEME_COLOR,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body className="font-sans">
        <div className="mx-auto flex w-full max-w-xl shrink-0 flex-col gap-2 px-4 pt-4 empty:hidden">
          <OfflineCallout />
        </div>
        {/* Silent update: renders nothing, never asks anything. */}
        <RegisterSW />
        <InstallCapture />
        {children}
      </body>
    </html>
  );
}
