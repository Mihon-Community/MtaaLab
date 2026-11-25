import { CloudOff, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface OfflineBannerProps {
  onRetry?: () => void;
  retrying?: boolean;
  /** Extra context, e.g. which turn is still displayed. */
  detail?: string;
  className?: string;
}

/**
 * Shown instead of a hard error when the network drops: the last confirmed
 * state stays visible and is labelled as such.
 */
export function OfflineBanner({
  onRetry,
  retrying = false,
  detail = "Your last confirmed turn is shown.",
  className,
}: OfflineBannerProps) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-xl border border-status-warning bg-card p-3 text-sm",
        className,
      )}
    >
      <CloudOff
        aria-hidden="true"
        size={18}
        strokeWidth={2}
        className="shrink-0 text-status-warning"
      />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">
          Offline — showing last confirmed state.
        </span>{" "}
        <span className="text-muted-foreground">{detail}</span>
      </p>
      {onRetry ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onRetry}
          disabled={retrying}
        >
          <RotateCw
            aria-hidden="true"
            size={16}
            strokeWidth={2}
            className={cn(retrying && "animate-spin")}
          />
          Reconnect
        </Button>
      ) : null}
    </div>
  );
}
