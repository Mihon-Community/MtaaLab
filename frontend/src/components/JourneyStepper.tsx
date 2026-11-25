import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const JOURNEY_STEPS = [
  { id: "Enter", label: "Enter" },
  { id: "Investigate", label: "Investigate" },
  { id: "Decide", label: "Decide" },
  { id: "Advance", label: "Advance" },
  { id: "Respond", label: "Respond" },
  { id: "Reflect", label: "Reflect" },
] as const;

export type JourneyStep = (typeof JOURNEY_STEPS)[number]["id"];

interface JourneyStepperProps {
  current: JourneyStep;
  className?: string;
  /** Accessible name for the list; defaults to "Mission journey". */
  label?: string;
}

/**
 * Spec §3 journey: Enter → Investigate → Decide → Advance → Respond → Reflect.
 * Horizontal on desktop, vertical on phones; state is always in text, never
 * colour alone.
 */
export function JourneyStepper({
  current,
  className,
  label = "Mission journey",
}: JourneyStepperProps) {
  const currentIndex = JOURNEY_STEPS.findIndex((step) => step.id === current);

  return (
    <nav aria-label={label} className={className}>
      <ol className="flex flex-col gap-2 md:flex-row md:items-center md:gap-1">
        {JOURNEY_STEPS.map((step, index) => {
          const isComplete = index < currentIndex;
          const isCurrent = index === currentIndex;
          return (
            <li key={step.id} className="flex items-center gap-2 md:flex-1">
              <div
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-semibold md:flex-col md:items-start md:gap-1",
                  isCurrent
                    ? "border-primary bg-accent text-accent-foreground"
                    : "border-border bg-card text-muted-foreground",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full border text-[0.65rem] tabular-nums",
                    isComplete || isCurrent
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {isComplete ? <Check size={14} strokeWidth={3} /> : index + 1}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{step.label}</span>
                  <span className="text-[0.65rem] font-medium uppercase tracking-wide">
                    {isComplete ? "Done" : isCurrent ? "Current" : "Next"}
                  </span>
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
