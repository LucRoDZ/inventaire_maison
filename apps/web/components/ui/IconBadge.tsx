import type { LucideIcon } from 'lucide-react';

interface IconBadgeProps {
  icon: LucideIcon;
  /** Accessible name. Without it the badge is decorative and hidden from assistive technology. */
  label?: string;
  /** `lavender` (default): indigo glyph on lavender. `indigo`: white glyph on indigo. */
  tone?: 'lavender' | 'indigo';
  className?: string;
}

export function IconBadge({
  icon: Icon,
  label,
  tone = 'lavender',
  className = '',
}: IconBadgeProps) {
  const colors = tone === 'indigo' ? 'bg-indigo text-white' : 'bg-lavender text-indigo';
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true };
  return (
    <span
      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${colors} ${className}`}
      {...a11y}
    >
      <Icon size={22} aria-hidden="true" />
    </span>
  );
}
