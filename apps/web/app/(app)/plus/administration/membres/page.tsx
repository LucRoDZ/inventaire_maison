'use client';

import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { AdminGate } from '../../../../../components/admin/AdminGate';
import { MembersAdmin } from '../../../../../components/admin/MembersAdmin';
import { useCurrentUser } from '../../../../../components/auth/AuthProvider';

export default function MembresPage() {
  const user = useCurrentUser();
  return (
    <main className="flex flex-col gap-4">
      <Link
        href="/plus/administration"
        className="tap-target text-indigo-mid inline-flex items-center gap-1 font-bold"
      >
        <ChevronLeft size={18} aria-hidden="true" />
        Administration
      </Link>
      <h1 className="text-title">Membres</h1>
      <AdminGate>{user ? <MembersAdmin currentUserId={user.id} /> : null}</AdminGate>
    </main>
  );
}
