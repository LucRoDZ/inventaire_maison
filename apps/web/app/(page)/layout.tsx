import type { ReactNode } from 'react';
import { AuthProvider } from '../../components/auth/AuthProvider';
import { AppBadge } from '../../components/pwa/AppBadge';
import { OutOfStockPrompt } from '../../components/shopping/OutOfStockPrompt';
import { InstallSheet } from '../../components/pwa/InstallSheet';

/**
 * Full-page screens (a list with its own header and footer): same session check as `(app)`, but
 * no bottom bar. The page never scrolls; the content zone does.
 */
export default function PageLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <div
        data-testid="page-screen"
        className="bg-surface fixed inset-0 z-20 flex w-full flex-col overflow-hidden pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]"
      >
        <div className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col">{children}</div>
      </div>
      <InstallSheet />
      <OutOfStockPrompt />
      <AppBadge />
    </AuthProvider>
  );
}
