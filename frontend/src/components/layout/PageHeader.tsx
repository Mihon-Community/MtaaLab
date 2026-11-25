import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  /** Small uppercase context line, e.g. "Mtoni catchment · Simulation". */
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Focus target for route changes; defaults to the shared page title id. */
  titleId?: string;
  className?: string;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  titleId = "page-title",
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end justify-between gap-x-6 gap-y-3",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <h1
          id={titleId}
          tabIndex={-1}
          className="text-balance text-3xl font-semibold leading-tight tracking-tight outline-none md:text-4xl"
        >
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-pretty text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
