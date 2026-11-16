/** Garde-manger: a cupboard with three shelves behind two doors. */
export function Pantry({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 140" aria-hidden="true" className={className}>
      <rect
        x="14"
        y="8"
        width="92"
        height="124"
        rx="6"
        className="fill-lavender stroke-indigo"
        strokeWidth="4"
      />
      <line x1="14" y1="48" x2="106" y2="48" className="stroke-indigo" strokeWidth="3" />
      <line x1="14" y1="88" x2="106" y2="88" className="stroke-indigo" strokeWidth="3" />
      <rect
        x="26"
        y="26"
        width="14"
        height="22"
        rx="2"
        className="fill-white stroke-indigo"
        strokeWidth="2"
      />
      <rect
        x="46"
        y="30"
        width="12"
        height="18"
        rx="2"
        className="fill-white stroke-indigo"
        strokeWidth="2"
      />
      <rect
        x="66"
        y="22"
        width="18"
        height="26"
        rx="2"
        className="fill-white stroke-indigo"
        strokeWidth="2"
      />
      <rect
        x="28"
        y="66"
        width="22"
        height="22"
        rx="2"
        className="fill-white stroke-indigo"
        strokeWidth="2"
      />
      <rect
        x="60"
        y="62"
        width="16"
        height="26"
        rx="2"
        className="fill-white stroke-indigo"
        strokeWidth="2"
      />
      <rect x="22" y="132" width="10" height="6" className="fill-indigo" />
      <rect x="88" y="132" width="10" height="6" className="fill-indigo" />
    </svg>
  );
}
