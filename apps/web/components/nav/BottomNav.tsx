'use client';

import { EllipsisVertical, Package, ScanBarcode, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Tab {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const TABS: readonly Tab[] = [
  { href: '/', label: 'Scanner', icon: ScanBarcode },
  { href: '/inventaire', label: 'Inventaire', icon: Package },
  { href: '/plus', label: 'Plus', icon: EllipsisVertical },
];

export function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Navigation principale"
      className="border-line fixed inset-x-0 bottom-0 border-t bg-white pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-xl lg:max-w-3xl">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className="tap-target text-indigo flex flex-col items-center justify-center gap-0.5 py-2"
              >
                <span
                  className={`relative flex h-8 w-14 items-center justify-center rounded-full ${active ? 'bg-amber' : 'bg-transparent'}`}
                >
                  <Icon size={22} aria-hidden="true" />
                </span>
                <span className={`text-help ${active ? 'font-bold' : ''}`}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
