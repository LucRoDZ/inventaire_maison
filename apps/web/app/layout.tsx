import '@fontsource/carlito/latin-400.css';
import '@fontsource/carlito/latin-700.css';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { InstallCapture } from '../components/pwa/InstallCapture';
import { OfflineCallout } from '../components/pwa/OfflineCallout';
import { RegisterSW } from '../components/pwa/RegisterSW';
import { ThemeSync } from '../components/pwa/ThemeSync';
import { THEME_INIT_SCRIPT } from '../lib/theme';
import startupImages from '../lib/startup-images.json';
import { APP_NAME, APP_SHORT_NAME, THEME_COLOR_DARK, THEME_COLOR_LIGHT } from './manifest';

/** iPhone launch screens: one image per common portrait size. */
const startupLinks = startupImages.map(({ width, height, ratio, cssWidth, cssHeight }) => ({
  url: `/splash/splash-${width}x${height}.png`,
  media: `(device-width: ${cssWidth}px) and (device-height: ${cssHeight}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait)`,
}));

export const metadata: Metadata = {
  title: APP_NAME,
  applicationName: APP_NAME,
  robots: { index: false, follow: false },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
  appleWebApp: {
    capable: true,
    title: APP_SHORT_NAME,
    statusBarStyle: 'default',
    startupImage: startupLinks,
  },
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
  // The status bar follows the theme of the device (the tokens `theme-color`, light and dark).
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: THEME_COLOR_LIGHT },
    { media: '(prefers-color-scheme: dark)', color: THEME_COLOR_DARK },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="font-sans">
        <div className="mx-auto flex w-full max-w-xl shrink-0 flex-col gap-2 px-4 pt-4 empty:hidden">
          <OfflineCallout />
        </div>
        {/* Silent update: renders nothing, never asks anything. */}
        <RegisterSW />
        <InstallCapture />
        <ThemeSync />
        {children}
      </body>
    </html>
  );
}
