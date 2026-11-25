import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring",
  {
    variants: {
      variant: {
        default: "border-primary bg-primary text-primary-foreground",
        secondary: "border-secondary bg-secondary text-secondary-foreground",
        outline: "border-border text-foreground",
        muted: "border-border bg-muted text-muted-foreground",
        good: "border-status-good bg-transparent text-status-good",
        warning: "border-status-warning bg-transparent text-status-warning",
        serious: "border-status-serious bg-transparent text-status-serious",
        critical: "border-status-critical bg-transparent text-status-critical",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

type BadgeProps = React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants>;

function Badge({ className, variant, children, ...props }: BadgeProps) {
  const isStatus =
    variant === "good" ||
    variant === "warning" ||
    variant === "serious" ||
    variant === "critical";

  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {isStatus ? (
        <span
          className="size-1.5 shrink-0 rounded-full bg-current"
          aria-hidden="true"
        />
      ) : null}
      {children}
    </span>
  );
}

export { Badge, badgeVariants };
