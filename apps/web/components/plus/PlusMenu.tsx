'use client';

import { ChevronRight, Refrigerator, Settings, UserRound, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useCurrentUser } from '../auth/AuthProvider';
import { LogoutButton } from '../auth/LogoutButton';
import { InstallEntry } from './InstallEntry';

function Entry({ href, label, icon: Icon }: { href: string; label: string; icon: LucideIcon }) {
  return (
    <li>
      <Link
        href={href}
        className="tap-target border-line text-indigo flex items-center gap-3 rounded-xl border bg-white px-4"
      >
        <Icon size={20} aria-hidden="true" />
        <span className="flex-1 font-semibold">{label}</span>
        <ChevronRight size={18} aria-hidden="true" />
      </Link>
    </li>
  );
}

/** Entries of the Plus tab; Administration only for the admin. */
export function PlusMenu() {
  const user = useCurrentUser();
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        <Entry href="/plus/compte" label="Compte" icon={UserRound} />
        <Entry href="/plus/meubles" label="Meubles et étagères" icon={Refrigerator} />
        {user?.role === 'admin' ? (
          <Entry href="/plus/administration" label="Administration" icon={Settings} />
        ) : null}
        <InstallEntry />
      </ul>
      <LogoutButton />
    </div>
  );
}
