'use client';

import {
  EllipsisVertical,
  Package,
  ScanBarcode,
  ShoppingBasket,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { rememberScreen } from '../../lib/last-screen';

interface Tab {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const TABS: readonly Tab[] = [
  { href: '/scanner', label: 'Scanner', icon: ScanBarcode },
  { href: '/inventaire', label: 'Inventaire', icon: Package },
  { href: '/courses', label: 'Courses', icon: ShoppingBasket },
  { href: '/plus', label: 'Plus', icon: EllipsisVertical },
];

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The last row of the body column, never fixed: the scroll zone above it always ends where the bar
 * begins, whatever its real height (font, safe area of the device).
 */
export function BottomNav() {
  const pathname = usePathname();
  // Read in the effect (not `useSearchParams`, which would need a Suspense boundary in the layout).
  useEffect(() => {
    rememberScreen(`${pathname}${window.location.search}`);
  }, [pathname]);
  return (
    <nav
      aria-label="Navigation principale"
      className="border-line shrink-0 border-t bg-white pb-[env(safe-area-inset-bottom)]"
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
                  className={`relative flex h-8 w-14 items-center justify-center rounded-full ${active ? 'bg-amber text-on-amber' : 'bg-transparent'}`}
                >
                  <Icon size={22} aria-hidden="true" />
                </span>
                <span className={`text-help ${active ? 'font-semibold' : ''}`}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
