import type { ReactNode } from 'react';
import { AuthProvider } from '../../components/auth/AuthProvider';
import { AppBadge } from '../../components/pwa/AppBadge';
import { OutOfStockPrompt } from '../../components/shopping/OutOfStockPrompt';
import { InstallSheet } from '../../components/pwa/InstallSheet';
import { ScannerStatusBar } from '../../components/scanner/ScannerStatusBar';

/**
 * Full-screen screens (the scanner): same session check as `(app)`, but no bottom bar and nothing
 * around the content.
 */
export default function ScanLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <div
        data-testid="scanner-screen"
        className="bg-scanner-backdrop text-scanner-ink fixed inset-0 z-20 flex w-full flex-col overflow-hidden"
      >
        {children}
      </div>
      <ScannerStatusBar />
      <InstallSheet />
      <OutOfStockPrompt />
      <AppBadge />
    </AuthProvider>
  );
}
