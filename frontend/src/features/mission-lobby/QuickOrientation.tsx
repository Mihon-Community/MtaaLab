import {
  CircleCheck,
  MessageSquareText,
  Search,
  SlidersHorizontal,
} from "lucide-react";

const STEPS = [
  {
    icon: Search,
    title: "Investigate",
    description: "Inspect the world and the people who depend on it.",
  },
  {
    icon: SlidersHorizontal,
    title: "Decide",
    description: "Choose one action at a time from the mission rules.",
  },
  {
    icon: CircleCheck,
    title: "See the confirmed result",
    description: "The server records the outcome before it appears here.",
  },
  {
    icon: MessageSquareText,
    title: "Reflect",
    description: "Use saved evidence to explain your trade-offs.",
  },
];

/** A short, text-first orientation to the learning flow. No scores or progress. */
export function QuickOrientation() {
  return (
    <section className="mb-10" aria-labelledby="orientation-title">
      <h2
        id="orientation-title"
        className="mb-1 text-lg font-semibold text-foreground"
      >
        How a mission works
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Four steps you will repeat as the story unfolds.
      </p>
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map(({ icon: Icon, title, description }, index) => (
          <li
            key={title}
            className="flex gap-3 rounded-xl border border-border bg-card p-4 shadow-sm"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon aria-hidden="true" size={18} strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Step {index + 1}
              </p>
              <h3 className="text-sm font-semibold text-foreground">{title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {description}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
