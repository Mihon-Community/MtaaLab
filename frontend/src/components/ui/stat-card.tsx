import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card } from "./card";

export type StatIcon = ComponentType<{
  size?: number | string;
  strokeWidth?: number | string;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

interface StatCardProps {
  icon: StatIcon;
  label: string;
  /** Already-formatted display value; never a value the client calculated. */
  value: ReactNode;
  unit?: string;
  /** Status badge, icon and text (e.g. `Badge` with an icon). */
  status?: ReactNode;
  hint?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/**
 * HUD and report KPI tile. Keeps the number tabular so layouts never jitter,
 * and always shows the unit next to the value.
 */
export function StatCard({
  icon: Icon,
  label,
  value,
  unit,
  status,
  hint,
  className,
  children,
}: StatCardProps) {
  return (
    <Card variant="stat" className={cn("p-5 md:p-6", className)}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-primary"
        >
          <Icon size={20} strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5 text-3xl font-semibold leading-tight tabular-nums">
            <span>{value}</span>
            {unit ? (
              <span className="text-sm font-medium text-muted-foreground">
                {unit}
              </span>
            ) : null}
          </p>
          {status ? <div className="mt-2">{status}</div> : null}
          {hint ? (
            <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
      </div>
      {children}
    </Card>
  );
}
