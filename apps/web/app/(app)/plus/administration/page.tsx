'use client';

import { ChevronRight, House, Refrigerator, Tag, Users, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { AdminGate } from '../../../../components/admin/AdminGate';
import { Screen } from '../../../../components/ui/Screen';

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
    <Screen title="Administration" back={{ href: '/plus', label: 'Plus' }}>
      <AdminGate>
        <ul className="flex flex-col gap-2">
          <Entry href="/plus/administration/foyers" label="Foyers" icon={House} />
          <Entry href="/plus/administration/membres" label="Comptes" icon={Users} />
          <Entry href="/plus/administration/categories" label="Catégories" icon={Tag} />
          <Entry
            href="/plus/administration/correspondances"
            label="Correspondances Open Food Facts"
            icon={Tag}
          />
        </ul>
        {/* One way in, under Plus: this screen points to it instead of repeating it. */}
        <div className="flex flex-col items-start gap-1">
          <p className="text-help">
            Les meubles et leurs étagères se règlent sous Plus, pour tous les comptes de la maison.
          </p>
          <Link
            href="/plus/meubles"
            className="tap-target text-indigo-mid inline-flex items-center gap-1 font-bold"
          >
            Aller à Meubles et étagères
            <ChevronRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </AdminGate>
    </Screen>
  );
}
