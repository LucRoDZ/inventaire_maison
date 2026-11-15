'use client';

import { ChevronLeft, ChevronRight, MapPin, Users, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { AdminGate } from '../../../../components/admin/AdminGate';

function Entry({ href, label, icon: Icon }: { href: string; label: string; icon: LucideIcon }) {
  return (
    <li>
      <Link
        href={href}
        className="tap-target border-line text-indigo flex items-center gap-3 rounded-xl border bg-white px-4"
      >
        <Icon size={20} aria-hidden="true" />
        <span className="flex-1 font-bold">{label}</span>
        <ChevronRight size={18} aria-hidden="true" />
      </Link>
    </li>
  );
}

export default function AdministrationPage() {
  return (
    <main className="flex flex-col gap-4">
      <Link
        href="/plus"
        className="tap-target text-indigo-mid inline-flex items-center gap-1 font-bold"
      >
        <ChevronLeft size={18} aria-hidden="true" />
        Plus
      </Link>
      <h1 className="text-title">Administration</h1>
      <AdminGate>
        <ul className="flex flex-col gap-2">
          <Entry href="/plus/administration/membres" label="Membres" icon={Users} />
          <Entry href="/plus/administration/lieux" label="Lieux et étagères" icon={MapPin} />
        </ul>
      </AdminGate>
    </main>
  );
}
