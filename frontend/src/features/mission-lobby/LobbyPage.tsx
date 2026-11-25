import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { ApiError, getMissions } from "../../services/api";
import { isDemoMode } from "../../services/demo";
import { getSupabaseClient } from "../../services/supabase";
import { formatGradeBand } from "../../lib/utils";
import type { MissionListItem } from "../../types/api";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
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
  const supabase = getSupabaseClient();
  const demoMode = isDemoMode();
  const [session, setSession] = useState<Session | null>(null);
  const [missions, setMissions] = useState<MissionListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) setSession(nextSession);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    let active = true;
    if (!demoMode && !session) {
      setMissions([]);
      setLoading(false);
      setError(null);
      return () => {
        active = false;
      };
    }

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
              : new Error("Could not load assigned missions."),
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [attempt, demoMode, session]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || signingIn) return;
    setSigningIn(true);
    setError(null);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (authError) {
        setError(
          new Error("Sign-in failed. Check your school-issued account."),
        );
      } else {
        setEmail("");
        setPassword("");
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause
          : new Error("Sign-in could not be completed."),
      );
    } finally {
      setSigningIn(false);
    }
  }

  if (!supabase && !demoMode) {
    return (
      <section aria-labelledby="lobby-title">
        <h1 id="lobby-title">MtaaLab games</h1>
        <p>
          Connect the Supabase URL and publishable key to sign in and load
          teacher-assigned missions.
        </p>
      </section>
    );
  }

  if (supabase && !session && !demoMode) {
    return (
      <section aria-labelledby="lobby-title">
        <h1 id="lobby-title">MtaaLab games</h1>
        <p>
          Sign in with the school-issued learner account. A full learner name is
          not needed here.
        </p>
        <form className="auth-form" onSubmit={(event) => void signIn(event)}>
          <label>
            Account
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={signingIn}>
            {signingIn ? "Signing in…" : "Sign in"}
          </button>
        </form>
        {error && <p role="alert">{error.message}</p>}
      </section>
    );
  }

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
          <LoadingState
            variant="cards"
            message="Checking your class assignments…"
            rows={3}
          />
        )}

        {error && (
          <ErrorState
            title={isUnauthorized ? "Sign-in required" : "Missions unavailable"}
            message={
              isUnauthorized
                ? "Your session is not signed in. Sign in with an assigned learner or teacher account, then try again."
                : "We couldn't load your assigned missions. Check your connection and try again."
            }
            onRetry={() => setAttempt((current) => current + 1)}
            retrying={loading}
          />
        )}

        {!loading && !error && missions.length === 0 && (
          <EmptyState
            title="No missions are assigned to your class yet."
            description="When your teacher shares a mission, it will appear here."
          />
        )}

        {!loading && !error && missions.length > 0 && (
          <div className="mission-grid" aria-label="Assigned missions">
            {missions.map((mission) => (
              <Card key={mission.id} className="flex h-full flex-col gap-4">
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="subject-tag">{mission.subject}</span>
                    <span className="assigned-tag">
                      {mission.recommended ? "Suggested" : "Assigned"}
                    </span>
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
                  {mission.last_session_status === "active" &&
                    mission.last_session_id && (
                      <p className="mt-2 text-sm font-medium text-foreground">
                        Saved progress · turn {mission.current_turn ?? 0}
                      </p>
                    )}
                  {mission.recommendation_reason && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {mission.recommendation_reason}
                    </p>
                  )}
                </CardContent>
                <CardFooter className="flex-col items-stretch">
                  <Button
                    asChild
                    variant="secondary"
                    size="sm"
                    className="w-full"
                  >
                    <Link
                      to={
                        mission.last_session_status === "active" &&
                        mission.last_session_id
                          ? `/simulation?session_id=${encodeURIComponent(mission.last_session_id)}&mission_id=${encodeURIComponent(mission.id)}`
                          : `/briefing?mission_id=${encodeURIComponent(mission.id)}`
                      }
                      aria-label={
                        mission.last_session_status === "active" &&
                        mission.last_session_id
                          ? `Continue saved mission: ${mission.title}`
                          : `View briefing for ${mission.title}`
                      }
                    >
                      {mission.last_session_status === "active" &&
                      mission.last_session_id
                        ? "Continue saved mission"
                        : "View briefing"}
                      <ArrowRight
                        aria-hidden="true"
                        size={16}
                        strokeWidth={2}
                      />
                    </Link>
                  </Button>
                  {mission.last_session_status === "completed" &&
                    mission.last_session_id && (
                      <Link
                        className="text-link"
                        to={`/report?session_id=${encodeURIComponent(mission.last_session_id)}`}
                      >
                        Review completed run
                      </Link>
                    )}
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
