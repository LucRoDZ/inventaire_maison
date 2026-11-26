import { ListSkeleton, Skeleton } from '../../components/ui/Skeleton';

/** While a screen is on its way: blocks where the header and the lines will be, nothing moves after. */
export default function Loading() {
  return (
    <main className="flex min-h-0 flex-1 flex-col gap-4 px-4 pt-4">
      <Skeleton className="h-8 w-40" />
      <ListSkeleton />
    </main>
  );
}
