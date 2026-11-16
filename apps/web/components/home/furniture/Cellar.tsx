/** Cave: a bottle rack, three rows of bottles seen from the end. */
export function Cellar({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 140" aria-hidden="true" className={className}>
      <rect
        x="10"
        y="12"
        width="100"
        height="116"
        rx="6"
        className="fill-lavender stroke-indigo"
        strokeWidth="4"
      />
      {[34, 70, 106].map((cy, row) =>
        [30, 60, 90].map((cx) => (
          <circle
            key={`${row}-${cx}`}
            cx={cx + (row % 2 === 0 ? 0 : 0)}
            cy={cy}
            r="12"
            className="fill-white stroke-indigo"
            strokeWidth="2.5"
          />
        )),
      )}
      <line x1="10" y1="52" x2="110" y2="52" className="stroke-indigo" strokeWidth="3" />
      <line x1="10" y1="88" x2="110" y2="88" className="stroke-indigo" strokeWidth="3" />
    </svg>
  );
}
