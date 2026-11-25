import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type LoadingVariant = "page" | "cards" | "chart" | "inline";

interface LoadingStateProps {
  variant?: LoadingVariant;
  /** Announced by screen readers; never rely on the shimmer alone. */
  message?: string;
  rows?: number;
  className?: string;
}

/**
 * Accessible loading placeholder. The visible skeleton is decorative; the
 * `role="status"` region carries the real text.
 */
export function LoadingState({
  variant = "page",
  message = "Loading…",
  rows = 3,
  className,
}: LoadingStateProps) {
  return (
    <div role="status" aria-live="polite" className={cn("w-full", className)}>
      <span className="sr-only">{message}</span>
      {variant === "page" && (
        <div aria-hidden="true" className="flex flex-col gap-4">
          <Skeleton className="h-9 w-2/3 max-w-md" />
          <Skeleton className="h-4 w-1/2 max-w-sm" />
          <Skeleton className="h-4 w-2/5 max-w-xs" />
          <div className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: rows }, (_, index) => (
              <Skeleton key={index} className="h-40 w-full rounded-2xl" />
            ))}
          </div>
        </div>
      )}
      {variant === "cards" && (
        <div
          aria-hidden="true"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {Array.from({ length: rows }, (_, index) => (
            <Skeleton key={index} className="h-44 w-full rounded-2xl" />
          ))}
        </div>
      )}
      {variant === "chart" && (
        <div aria-hidden="true" className="flex flex-col gap-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="aspect-[16/9] min-h-[200px] w-full rounded-xl" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      )}
      {variant === "inline" && (
        <span
          aria-hidden="true"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground"
        >
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
        </span>
      )}
    </div>
  );
}
