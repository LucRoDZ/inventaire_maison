import type { ReactNode } from 'react';
import { AuthProvider } from '../../components/auth/AuthProvider';
import { AppBadge } from '../../components/pwa/AppBadge';
import { BottomNav } from '../../components/nav/BottomNav';
import { InstallSheet } from '../../components/pwa/InstallSheet';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <div className="app-frame relative mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col lg:max-w-3xl">
        {children}
      </div>
      <AppBadge />
      <BottomNav />
      <InstallSheet />
    </AuthProvider>
  );
}
