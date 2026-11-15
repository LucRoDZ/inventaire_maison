/** Frigo: tall door with a small freezer compartment and the amber light of the open fridge. */
export function Fridge({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 140" role="img" aria-label="Frigo" className={className}>
      <rect
        x="26"
        y="6"
        width="68"
        height="128"
        rx="8"
        className="fill-lavender stroke-indigo"
        strokeWidth="4"
      />
      <line x1="26" y1="44" x2="94" y2="44" className="stroke-indigo" strokeWidth="3" />
      <rect
        x="34"
        y="14"
        width="52"
        height="24"
        rx="3"
        className="fill-white stroke-indigo"
        strokeWidth="2"
      />
      <rect
        x="34"
        y="52"
        width="52"
        height="74"
        rx="3"
        className="fill-white stroke-indigo"
        strokeWidth="2"
      />
      <rect x="40" y="52" width="40" height="6" rx="2" className="fill-amber" />
      <line x1="34" y1="78" x2="86" y2="78" className="stroke-indigo" strokeWidth="2" />
      <line x1="34" y1="102" x2="86" y2="102" className="stroke-indigo" strokeWidth="2" />
      <rect x="84" y="24" width="4" height="12" rx="2" className="fill-indigo" />
      <rect x="84" y="62" width="4" height="22" rx="2" className="fill-indigo" />
    </svg>
  );
}
