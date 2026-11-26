import type { MetadataRoute } from 'next';

export const APP_NAME = 'Inventaire maison';
export const APP_SHORT_NAME = 'Inventaire';
// A manifest needs literal colours; they are the indigo and white of tokens.css.
export const THEME_COLOR = '#1800ad'; // check-colors:allow
// Status bar: --theme-color of tokens.css, light and dark.
export const THEME_COLOR_LIGHT = '#ffffff'; // check-colors:allow
export const THEME_COLOR_DARK = '#151040'; // check-colors:allow
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
    theme_color: THEME_COLOR,
    background_color: BACKGROUND_COLOR,
    shortcuts: [
      {
        name: 'Scanner',
        short_name: 'Scanner',
        description: 'Scanner un produit',
        url: '/scanner',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Courses',
        short_name: 'Courses',
        description: 'Ouvrir la liste de courses',
        url: '/courses',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
    ],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
