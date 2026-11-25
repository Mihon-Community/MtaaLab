import { CircleAlert, RotateCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  /** Short heading; the message explains what happened and what to do. */
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  retrying?: boolean;
  className?: string;
}

/** Inline error with an explicit retry action. Never implies data was saved. */
export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  retryLabel = "Try again",
  retrying = false,
  className,
}: ErrorStateProps) {
  return (
    <Alert variant="critical" className={cn("items-start", className)}>
      <CircleAlert aria-hidden="true" size={20} strokeWidth={2} />
      <div className="flex min-w-0 flex-col gap-2">
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
        {onRetry ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRetry}
            disabled={retrying}
            className="mt-1 self-start"
          >
            <RotateCw
              aria-hidden="true"
              size={16}
              strokeWidth={2}
              className={cn(retrying && "animate-spin")}
            />
            {retryLabel}
          </Button>
        ) : null}
      </div>
    </Alert>
  );
}
