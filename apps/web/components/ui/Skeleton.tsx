/** A block on the skeleton token: it keeps the room of the content that is loading. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton rounded-xl ${className}`} />;
}

interface ListSkeletonProps {
  rows?: number;
  /** Height of one line, as a Tailwind class. */
  rowClassName?: string;
}

/**
 * Loading state of a list: blocks as tall as the lines they stand for, so the content replaces
 * them without moving anything. Announced once, politely.
 */
export function ListSkeleton({ rows = 4, rowClassName = 'h-20' }: ListSkeletonProps) {
  return (
    <div role="status" aria-label="Chargement" className="flex flex-col gap-2">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className={`${rowClassName} rounded-card w-full`} />
      ))}
    </div>
  );
}
