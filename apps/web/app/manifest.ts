import type { MetadataRoute } from 'next';

export const APP_NAME = 'Inventaire maison';
export const APP_SHORT_NAME = 'Inventaire';
// A manifest needs literal colours: the page grey of tokens.css (--theme-color, = --surface) for the
// status bar, white for the launch screen. Light theme only.
export const STATUS_BAR_COLOR = '#f5f5f7'; // check-colors:allow
export const BACKGROUND_COLOR = '#ffffff'; // check-colors:allow

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_SHORT_NAME,
    description: 'Inventaire du garde-manger familial',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    lang: 'fr',
    theme_color: STATUS_BAR_COLOR,
    background_color: BACKGROUND_COLOR,
    shortcuts: [
      {
        name: 'Scanner',
        short_name: 'Scanner',
        description: 'Scanner un produit',
        url: '/scanner',
        icons: [{ src: '/icons/v4/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Courses',
        short_name: 'Courses',
        description: 'Ouvrir la liste de courses',
        url: '/courses',
        icons: [{ src: '/icons/v4/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
    ],
    icons: [
      { src: '/icons/v4/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/v4/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/v4/icon-192-maskable.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/v4/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/v4/icon-monochrome-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'monochrome',
      },
    ],
  };
}
