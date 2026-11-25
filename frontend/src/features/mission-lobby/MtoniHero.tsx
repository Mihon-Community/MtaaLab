import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Small, token-coloured illustration of Mtoni: hills, reservoir, homes and the
 * shared water path. Inline SVG keeps it shadcn-themeable and offline-safe.
 */
export function MtoniHero() {
  return (
    <section
      aria-labelledby="lobby-title"
      className="mb-10 grid items-center gap-8 rounded-2xl border border-border bg-card p-6 shadow-sm md:grid-cols-[1.15fr_0.85fr] md:p-10"
    >
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-primary">
          Mtoni catchment · Mission desk
        </p>
        <h1
          id="lobby-title"
          className="text-balance text-3xl font-semibold leading-tight tracking-tight text-foreground md:text-4xl"
        >
          Welcome to Mtoni
        </h1>
        <p className="mt-3 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
          A living community water system is waiting for you. Explore the
          missions assigned to your class, investigate what is happening, and
          make decisions together with your classmates.
        </p>
        <Button asChild size="lg" className="mt-6 w-full sm:w-auto">
          <a href="#missions">
            Explore missions
            <ArrowRight aria-hidden="true" size={18} strokeWidth={2} />
          </a>
        </Button>
      </div>

      <svg
        viewBox="0 0 420 260"
        className="w-full max-w-md justify-self-center"
        role="img"
        aria-label="Illustration of the Mtoni community, its reservoir and the shared water system"
      >
        <title>Mtoni community and water system</title>
        <rect
          x="0"
          y="0"
          width="420"
          height="260"
          rx="18"
          fill="var(--muted)"
        />
        <circle cx="340" cy="52" r="22" fill="var(--accent)" />
        <path
          d="M0 150 C70 90 120 120 180 76 C240 32 300 96 420 62 L420 260 L0 260 Z"
          fill="var(--secondary)"
        />
        <path
          d="M0 186 C90 140 150 168 220 120 C290 72 350 140 420 112 L420 260 L0 260 Z"
          fill="var(--primary)"
          opacity="0.18"
        />
        <path
          d="M58 214 C110 176 168 178 214 206 C246 226 300 222 360 196"
          fill="none"
          stroke="var(--sector-households)"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path
          d="M214 206 L214 150"
          stroke="var(--sector-households)"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M96 196 L96 158 M128 184 L128 152 M292 206 L292 170"
          stroke="var(--sector-clinic)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M18 224 L80 224 L80 176 L150 176 L150 224 L206 224 L206 156 L248 156 L248 124 L292 124 L292 168 L352 168 L352 226 L408 226"
          fill="none"
          stroke="var(--border)"
          strokeWidth="6"
          strokeLinejoin="round"
        />
        <rect
          x="224"
          y="170"
          width="56"
          height="30"
          rx="6"
          fill="var(--card)"
        />
        <path
          d="M220 170 L252 146 L284 170 Z"
          fill="var(--destructive)"
          opacity="0.7"
        />
        <rect
          x="106"
          y="192"
          width="34"
          height="24"
          rx="4"
          fill="var(--card)"
        />
        <path
          d="M102 192 L123 174 L144 192 Z"
          fill="var(--accent-foreground)"
        />
        <rect
          x="300"
          y="186"
          width="34"
          height="26"
          rx="4"
          fill="var(--card)"
        />
        <path
          d="M296 186 L317 168 L338 186 Z"
          fill="var(--accent-foreground)"
        />
        <path
          d="M18 238 C96 226 160 246 230 230 C300 214 350 244 408 230"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="3"
          strokeDasharray="6 5"
          strokeLinecap="round"
        />
      </svg>
    </section>
  );
}
