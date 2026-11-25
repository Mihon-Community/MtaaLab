import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative flex w-full gap-3 rounded-xl border border-l-4 p-4 text-sm [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-border border-l-border bg-card text-card-foreground",
        info: "border-border border-l-border bg-muted text-foreground [&>svg]:text-foreground",
        success:
          "border-border border-l-status-good bg-muted text-foreground [&>svg]:text-status-good",
        warning:
          "border-border border-l-status-warning bg-muted text-foreground [&>svg]:text-status-warning",
        critical:
          "border-border border-l-status-critical bg-muted text-foreground [&>svg]:text-status-critical",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  },
);

const AlertTitle = React.forwardRef<
  HTMLHeadingElement,
  React.ComponentProps<"h5">
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
AlertDescription.displayName = "AlertDescription";

type AlertProps = React.ComponentProps<"div"> &
  VariantProps<typeof alertVariants>;

function Alert({ className, variant, role, ...props }: AlertProps) {
  const resolvedVariant = variant ?? "info";
  const resolvedRole =
    role ??
    (resolvedVariant === "warning" || resolvedVariant === "critical"
      ? "alert"
      : "status");

  return (
    <div
      role={resolvedRole}
      className={cn(alertVariants({ variant: resolvedVariant }), className)}
      {...props}
    />
  );
}

export { Alert, AlertDescription, AlertTitle };
