import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { m } from "motion/react";
import {
  ArrowRight,
  BookOpen,
  ChartColumn,
  GraduationCap,
  History,
  Map,
  MousePointerClick,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useReducedMotionPreference } from "@/lib/theme";

/** Gentle entry motion only; the copy is always present and readable. */
export function LandingReveal({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reducedMotion = useReducedMotionPreference();
  if (reducedMotion) {
    return (
      <div data-motion="reduced" className={className}>
        {children}
      </div>
    );
  }
  return (
    <m.div
      data-motion="animated"
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: "easeOut" }}
    >
      {children}
    </m.div>
  );
}

function SectionHeading({
  id,
  eyebrow,
  title,
  description,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-primary">
        {eyebrow}
      </p>
      <h2 id={id} className="text-2xl font-semibold tracking-tight md:text-3xl">
        {title}
      </h2>
      {description ? (
        <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  );
}

/** Grounded in README: no research claims or learning-impact numbers. */
export function ProblemSection() {
  return (
    <LandingReveal className="mb-12">
      <section
        aria-labelledby="problem-title"
        className="grid gap-6 rounded-2xl border border-border bg-muted/30 p-6 md:grid-cols-[0.8fr_1.2fr] md:p-8"
      >
        <SectionHeading
          id="problem-title"
          eyebrow="The learning challenge"
          title="Systems are hard to learn about from a distance."
        />
        <div className="space-y-3 leading-relaxed text-muted-foreground">
          <p>
            Students need chances to explore how a real-world system works, make
            a decision, and see what follows. A description of a water challenge
            cannot show how one choice changes what a household, school, clinic
            or farm receives.
          </p>
          <p>
            MtaaLab puts learners inside a fictional catchment with rules they
            can read and a turn-by-turn view of the simulation results. This is
            a working prototype, not a claim of measured learning impact.
          </p>
        </div>
      </section>
    </LandingReveal>
  );
}

export function ApproachSection() {
  const points = [
    {
      icon: Scale,
      title: "Rules you can inspect",
      body: "Mission rules and action costs are shown in the briefing. Outcomes come from a deterministic simulation, not from a guess in the browser.",
    },
    {
      icon: ShieldCheck,
      title: "Confirmed results only",
      body: "The simulation returns a result before the page updates. Demo runs stay in this browser and are not saved to the server.",
    },
    {
      icon: BookOpen,
      title: "Room to explain",
      body: "A debrief and a saved decision history let learners use recorded evidence to explain the trade-offs they chose.",
    },
  ];
  return (
    <LandingReveal className="mb-12">
      <section aria-labelledby="approach-title">
        <SectionHeading
          id="approach-title"
          eyebrow="Our approach"
          title="A scenario you can question, not just watch."
          description="MtaaLab combines interactive, scenario-based learning with a community water system. Here is how that approach shows up in the product."
        />
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {points.map(({ icon: Icon, title, body }) => (
            <Card key={title} className="h-full">
              <CardHeader>
                <span className="mb-2 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon aria-hidden="true" size={20} strokeWidth={2} />
                </span>
                <CardTitle>{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{body}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </LandingReveal>
  );
}

export function FeaturesSection() {
  const features = [
    {
      icon: Map,
      title: "Scenario simulations",
      body: "Explore the Mtoni world and run a mission from a saved initial state.",
    },
    {
      icon: MousePointerClick,
      title: "Accessible map interaction",
      body: "Every map selection also has a labelled button outside the canvas, with keyboard focus and text status.",
    },
    {
      icon: History,
      title: "Decision history",
      body: "Review turns, events and the water balance recorded for a run.",
    },
    {
      icon: ChartColumn,
      title: "Learning reports",
      body: "See recorded outcomes, service levels and a debrief grounded in saved mission evidence.",
    },
    {
      icon: GraduationCap,
      title: "Teacher view",
      body: "Inspect assigned missions and an authorized learner report. The current API does not support editing assignments or listing learners.",
    },
  ];
  return (
    <LandingReveal className="mb-12">
      <section aria-labelledby="features-title">
        <SectionHeading
          id="features-title"
          eyebrow="What is here today"
          title="Built around the work learners actually do."
        />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, body }) => (
            <Card key={title} className="h-full">
              <CardHeader>
                <span className="mb-2 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon aria-hidden="true" size={20} strokeWidth={2} />
                </span>
                <CardTitle>{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{body}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </LandingReveal>
  );
}

export function ClosingSection() {
  return (
    <LandingReveal className="mb-8">
      <section
        aria-labelledby="closing-title"
        className="rounded-2xl border border-border bg-primary/5 p-6 md:p-8"
      >
        <SectionHeading
          id="closing-title"
          eyebrow="Your next step"
          title="Ready to begin?"
          description="Choose a mission above, read its briefing, and start a run. Teachers can open an authorized report from the teacher view."
        />
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg" className="w-full sm:w-auto">
            <a href="#missions">
              Explore missions
              <ArrowRight aria-hidden="true" size={18} strokeWidth={2} />
            </a>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="w-full sm:w-auto"
          >
            <Link to="/teacher">Open teacher view</Link>
          </Button>
        </div>
      </section>
    </LandingReveal>
  );
}
