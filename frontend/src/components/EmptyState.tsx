import type { ReactNode } from "react";
import { CloudOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StatIcon } from "@/components/ui/stat-card";

interface EmptyStateProps {
  icon?: StatIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** Empty is a normal state, not an error: one sentence and one action. */
export function EmptyState({
  icon: Icon = CloudOff,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-3 rounded-2xl border border-dashed border-border bg-card p-6",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="grid size-11 place-items-center rounded-xl bg-muted text-muted-foreground"
      >
        <Icon size={22} strokeWidth={2} />
      </span>
      <div className="flex flex-col gap-1">
        <p className="font-semibold">{title}</p>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
