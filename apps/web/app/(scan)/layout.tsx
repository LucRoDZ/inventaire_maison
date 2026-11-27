import type { ReactNode } from 'react';
import { AuthProvider } from '../../components/auth/AuthProvider';
import { AppBadge } from '../../components/pwa/AppBadge';
import { InstallSheet } from '../../components/pwa/InstallSheet';

/**
 * Full-screen screens (the scanner): same session check as `(app)`, but no bottom bar and nothing
 * around the content.
 */
export default function ScanLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <div
        data-testid="scanner-screen"
        className="bg-scanner-backdrop text-scanner-ink fixed inset-0 z-20 flex h-dvh w-full flex-col overflow-hidden"
      >
        {children}
      </div>
      <InstallSheet />
      <AppBadge />
    </AuthProvider>
  );
}
