import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export type StatusTone = "good" | "warning" | "serious" | "critical";

const cardVariants = cva("bg-card text-card-foreground", {
  variants: {
    variant: {
      /** Standard panel: soft border, generous padding. */
      default: "rounded-2xl border border-border shadow-sm",
      /** Whole-card link or button: one interactive target, never nested buttons. */
      interactive:
        "rounded-2xl border border-border shadow-sm transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring",
      /** Numeric KPI tile (HUD, report). Pair with StatCard internals. */
      stat: "rounded-2xl border border-border shadow-sm",
      /** Critical or unavailable state: status colour + icon + heading. */
      alert: "rounded-2xl border border-border border-l-4 shadow-sm",
      /** Pending or AI-generated note: dashed border. */
      muted:
        "rounded-2xl border border-dashed border-border bg-card shadow-none",
    },
  },
  defaultVariants: { variant: "default" },
});

interface CardProps
  extends ComponentProps<"div">,
    VariantProps<typeof cardVariants> {
  asChild?: boolean;
  /** Only used by `variant="alert"` to pick the status accent. */
  status?: StatusTone;
}

const alertAccent: Record<StatusTone, string> = {
  good: "border-l-status-good",
  warning: "border-l-status-warning",
  serious: "border-l-status-serious",
  critical: "border-l-status-critical",
};

export function Card({
  className,
  variant,
  asChild = false,
  status,
  ...props
}: CardProps) {
  const Comp = asChild ? Slot : "div";
  return (
    <Comp
      data-variant={variant ?? "default"}
      className={cn(
        cardVariants({ variant }),
        variant === "alert" && alertAccent[status ?? "critical"],
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-1.5 p-5 pb-0 md:p-6 md:pb-0", className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<"h3">) {
  return (
    <h3
      className={cn(
        "text-base font-semibold leading-tight tracking-tight",
        className,
      )}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: ComponentProps<"p">) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)} {...props} />
  );
}

export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("p-5 md:p-6", className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 p-5 pt-0 md:p-6 md:pt-0",
        className,
      )}
      {...props}
    />
  );
}

export { cardVariants };
