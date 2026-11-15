// Amber text is allowed on the indigo card only (contrast), never on white.
const FIGURE_COLOR = 'text-amber'; // check-colors:allow

interface StatCardProps {
  label: string;
  value: number | string;
  className?: string;
}

/** Indigo card with a big amber figure, e.g. the counter of a piece of furniture. */
export function StatCard({ label, value, className = '' }: StatCardProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`rounded-card bg-indigo p-4 text-white ${className}`}
    >
      <p className={`text-stat ${FIGURE_COLOR}`}>{value}</p>
      <p className="text-small text-white">{label}</p>
    </div>
  );
}
