/*
 * Small original drawings for the empty states. Flat shapes and strokes on the illustration
 * tokens, one amber touch each, decorative (hidden from assistive technology).
 */
const base = {
  viewBox: '0 0 120 96',
  width: 120,
  height: 96,
  fill: 'none',
  'aria-hidden': true,
  focusable: false,
} as const;
const line = {
  stroke: 'var(--illustration-line)',
  strokeWidth: 2.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

interface IllustrationProps {
  className?: string;
}

/** An open piece of furniture with nothing on its shelves. */
export function EmptyFurnitureIllustration({ className = '' }: IllustrationProps) {
  return (
    <svg {...base} className={className} data-illustration="furniture">
      <rect x="28" y="10" width="64" height="76" rx="8" fill="var(--illustration-surface)" />
      <rect x="28" y="10" width="64" height="76" rx="8" {...line} />
      <path d="M28 36h64M28 61h64" {...line} />
      <circle cx="78" cy="48" r="5" fill="var(--illustration-accent)" />
    </svg>
  );
}

/** A basket with room for what is to be bought. */
export function EmptyShoppingIllustration({ className = '' }: IllustrationProps) {
  return (
    <svg {...base} className={className} data-illustration="shopping">
      <path
        d="M22 40h76l-8 40a6 6 0 0 1-6 5H36a6 6 0 0 1-6-5z"
        fill="var(--illustration-surface)"
      />
      <path d="M22 40h76l-8 40a6 6 0 0 1-6 5H36a6 6 0 0 1-6-5zM40 40l14-22M80 40L66 18" {...line} />
      <circle cx="60" cy="62" r="6" fill="var(--illustration-accent)" />
    </svg>
  );
}

/** Two arrows closing a circle: everything is up to date. For the « À synchroniser » screen. */
export function NothingToSyncIllustration({ className = '' }: IllustrationProps) {
  return (
    <svg {...base} className={className} data-illustration="sync">
      <circle cx="60" cy="48" r="32" fill="var(--illustration-surface)" />
      <path d="M40 40a22 22 0 0 1 38-6M80 56a22 22 0 0 1-38 6" {...line} />
      <path d="M78 24v10H68M42 72V62h10" {...line} />
      <circle cx="60" cy="48" r="5" fill="var(--illustration-accent)" />
    </svg>
  );
}
