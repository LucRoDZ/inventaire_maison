import type { ReactNode } from 'react';
import { AuthProvider } from '../../components/auth/AuthProvider';
import { BottomNav } from '../../components/nav/BottomNav';
import { InstallSheet } from '../../components/pwa/InstallSheet';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <div className="app-frame mx-auto min-h-dvh max-w-xl p-4 pb-[calc(5rem+env(safe-area-inset-bottom))]">
        {children}
      </div>
      <BottomNav />
      <InstallSheet />
    </AuthProvider>
  );
}
