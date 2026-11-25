import type { ButtonProps } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export interface AccessibleButtonProps extends ButtonProps {
  /** Shows a spinner and disables the button; never implies success. */
  isLoading?: boolean;
  loadingLabel?: string;
}

/**
 * Button with a built-in pending state. The label stays in the DOM so the
 * control keeps its accessible name while a request is in flight.
 */
export function AccessibleButton({
  isLoading = false,
  loadingLabel = "Submitting…",
  disabled,
  children,
  ...props
}: AccessibleButtonProps) {
  return (
    <Button
      aria-busy={isLoading || undefined}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <>
          <Loader2
            aria-hidden="true"
            className="animate-spin"
            size={16}
            strokeWidth={2}
          />
          <span>{loadingLabel}</span>
        </>
      ) : (
        children
      )}
    </Button>
  );
}
