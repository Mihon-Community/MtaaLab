import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { ApiError, getMissions } from "../../services/api";
import { formatGradeBand } from "../../lib/utils";
import type { MissionListItem } from "../../types/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MtoniHero } from "./MtoniHero";
import { QuickOrientation } from "./QuickOrientation";

export function LobbyPage() {
  const [missions, setMissions] = useState<MissionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    void getMissions()
      .then(({ missions: assignedMissions }) => {
        if (active) setMissions(assignedMissions);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause
              : new Error(
                  "An unexpected error occurred while loading missions.",
                ),
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [attempt]);

  const isUnauthorized = error instanceof ApiError && error.status === 401;

  return (
    <section aria-labelledby="lobby-title">
      <MtoniHero />
      <QuickOrientation />

      <section id="missions" aria-labelledby="missions-title">
        <div className="lobby-toolbar">
          <h2 id="missions-title">Choose a mission</h2>
          {!loading && !error && (
            <span className="assignment-count">
              {missions.length} {missions.length === 1 ? "mission" : "missions"}
            </span>
          )}
        </div>

        {loading && (
          <div className="loading-card" role="status" aria-live="polite">
            <p>Checking your class assignments…</p>
          </div>
        )}

        {error && (
          <div className="notice-card notice-card-error" role="alert">
            <p>
              {isUnauthorized
                ? "Your session is not signed in. Sign in with an assigned learner or teacher account, then try again."
                : "We couldn't load your assigned missions. Check your connection and try again."}
            </p>
            <button
              className="notice-action"
              type="button"
              onClick={() => setAttempt((current) => current + 1)}
              disabled={loading}
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && missions.length === 0 && (
          <div className="notice-card notice-card-empty">
            <p>No missions are assigned to your class yet.</p>
            <p>When your teacher shares a mission, it will appear here.</p>
          </div>
        )}

        {!loading && !error && missions.length > 0 && (
          <div className="mission-grid" aria-label="Assigned missions">
            {missions.map((mission) => (
              <Card key={mission.id} className="flex h-full flex-col gap-4">
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="subject-tag">{mission.subject}</span>
                    <span className="assigned-tag">Assigned</span>
                  </div>
                  <CardTitle>{mission.title}</CardTitle>
                  {mission.description ? (
                    <CardDescription>{mission.description}</CardDescription>
                  ) : null}
                </CardHeader>
                <CardContent className="mt-auto pb-0">
                  <p className="text-xs text-muted-foreground">
                    {formatGradeBand(mission.grade_band)} · Scenario v
                    {mission.scenario_version}
                  </p>
                </CardContent>
                <CardFooter>
                  <Button
                    asChild
                    variant="secondary"
                    size="sm"
                    className="w-full"
                  >
                    <Link
                      to={`/briefing?mission_id=${encodeURIComponent(mission.id)}`}
                      aria-label={`View briefing for ${mission.title}`}
                    >
                      View briefing
                      <ArrowRight
                        aria-hidden="true"
                        size={16}
                        strokeWidth={2}
                      />
                    </Link>
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
