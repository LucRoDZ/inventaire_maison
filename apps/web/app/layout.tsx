import '@fontsource/carlito/latin-400.css';
import '@fontsource/carlito/latin-700.css';
import './globals.css';
import type { ReactNode } from 'react';

export const metadata = { title: 'Inventaire maison' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body className="font-sans">{children}</body>
    </html>
  );
}
