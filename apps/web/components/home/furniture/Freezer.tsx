/** Congélateur: a chest with three pull-out drawers. */
export function Freezer({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 140" aria-hidden="true" className={className}>
      <rect
        x="16"
        y="14"
        width="88"
        height="116"
        rx="8"
        className="fill-lavender stroke-indigo"
        strokeWidth="4"
      />
      {[22, 56, 90].map((y) => (
        <g key={y}>
          <rect
            x="24"
            y={y}
            width="72"
            height="30"
            rx="4"
            className="fill-white stroke-indigo"
            strokeWidth="2"
          />
          <line
            x1="48"
            y1={y + 10}
            x2="72"
            y2={y + 10}
            className="stroke-indigo"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </g>
      ))}
      <path d="M26 6h12M82 6h12" className="stroke-indigo" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
