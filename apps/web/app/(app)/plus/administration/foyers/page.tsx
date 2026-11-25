'use client';

import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { AdminGate } from '../../../../../components/admin/AdminGate';
import { HouseholdsAdmin } from '../../../../../components/admin/HouseholdsAdmin';

export default function FoyersPage() {
  return (
    <main className="flex flex-col gap-4">
      <Link
        href="/plus/administration"
        className="tap-target text-indigo-mid inline-flex items-center gap-1 font-bold"
      >
        <ChevronLeft size={18} aria-hidden="true" />
        Administration
      </Link>
      <h1 className="text-title">Foyers</h1>
      <AdminGate>
        <HouseholdsAdmin />
      </AdminGate>
    </main>
  );
}
