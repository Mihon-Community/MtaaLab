import { Skeleton } from "@/components/ui/skeleton";

/** Suspense fallback while a lazy route chunk loads. */
export function PageSkeleton() {
  return <PageLoading />;
}

/** Generic page skeleton: heading, intro and a card grid. */
export function PageLoading() {
  return (
    <div className="flex flex-col gap-4" role="status">
      <span className="sr-only">Loading page…</span>
      <Skeleton className="h-8 w-2/3 max-w-md" />
      <Skeleton className="h-4 w-1/2 max-w-sm" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-40 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
