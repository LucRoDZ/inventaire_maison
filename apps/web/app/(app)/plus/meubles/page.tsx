'use client';

import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { LocationsAdmin } from '../../../../components/admin/LocationsAdmin';

/** The furniture of the house: every account adds, renames, reorders and deletes its furniture. */
export default function MeublesPage() {
  return (
    <main className="flex flex-col gap-4">
      <Link
        href="/plus"
        className="tap-target text-indigo-mid inline-flex items-center gap-1 font-bold"
      >
        <ChevronLeft size={18} aria-hidden="true" />
        Plus
      </Link>
      <h1 className="text-title">Meubles et étagères</h1>
      <LocationsAdmin />
    </main>
  );
}
