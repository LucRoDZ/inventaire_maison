'use client';

import { EllipsisVertical, ListChecks, Package, ScanBarcode, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { refreshReviewCount, useReviewCount } from '../../lib/review-count';

interface Tab {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const TABS: readonly Tab[] = [
  { href: '/', label: 'Scanner', icon: ScanBarcode },
  { href: '/inventaire', label: 'Inventaire', icon: Package },
  { href: '/a-classer', label: 'À classer', icon: ListChecks },
  { href: '/plus', label: 'Plus', icon: EllipsisVertical },
];

export function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

export function BottomNav() {
  const pathname = usePathname();
  const reviewCount = useReviewCount();
  useEffect(() => {
    void refreshReviewCount();
  }, [pathname]);
  return (
    <nav
      aria-label="Navigation principale"
      className="border-line fixed inset-x-0 bottom-0 border-t bg-white pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-xl">
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
                  {href === '/a-classer' && reviewCount > 0 ? (
                    <span
                      aria-label={`${reviewCount} à classer`}
                      className="bg-indigo text-help absolute -top-0.5 right-1 min-w-5 rounded-full px-1 text-center text-white"
                    >
                      {reviewCount}
                    </span>
                  ) : null}
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
