import type { LucideIcon } from 'lucide-react';
import { Info } from 'lucide-react';
import type { ReactNode } from 'react';

interface CalloutProps {
  children: ReactNode;
  title?: string;
  icon?: LucideIcon;
  /** `alert` for errors that must be announced at once; `status` for polite updates; `note` for static text. */
  role?: 'note' | 'status' | 'alert';
  className?: string;
}

/** Information box on an amber tint, with an indigo glyph on an amber badge. */
export function Callout({
  children,
  title,
  icon: Icon = Info,
  role = 'note',
  className = '',
}: CalloutProps) {
  return (
    <div
      role={role}
      className={`rounded-card bg-amber-tint flex items-start gap-3 p-4 ${className}`}
    >
      <span
        aria-hidden="true"
        className="bg-amber text-on-amber inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
      >
        <Icon size={18} />
      </span>
      <div className="min-w-0">
        {title ? <p className="text-card-title">{title}</p> : null}
        <div className="text-small">{children}</div>
      </div>
    </div>
  );
}
