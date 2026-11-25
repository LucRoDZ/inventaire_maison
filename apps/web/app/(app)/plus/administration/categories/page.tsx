'use client';

import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { AdminGate } from '../../../../../components/admin/AdminGate';
import { CategoriesAdmin } from '../../../../../components/admin/CategoriesAdmin';
import { HouseholdScope } from '../../../../../components/admin/HouseholdScope';
import { categoriesApiFor } from '../../../../../lib/categories-api';

export default function Page() {
  return (
    <main className="flex flex-col gap-4">
      <Link
        href="/plus/administration"
        className="tap-target text-indigo-mid inline-flex items-center gap-1 font-bold"
      >
        <ChevronLeft size={18} aria-hidden="true" />
        Administration
      </Link>
      <h1 className="text-title">Catégories</h1>
      <AdminGate>
        <Suspense>
          <HouseholdScope>
            {(household) => <CategoriesAdmin api={categoriesApiFor(household.id)} />}
          </HouseholdScope>
        </Suspense>
      </AdminGate>
    </main>
  );
}
