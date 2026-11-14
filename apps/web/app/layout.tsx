import type { ReactNode } from 'react';

export const metadata = { title: 'Inventaire maison' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
