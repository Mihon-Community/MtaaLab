import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { Link } from "react-router-dom";
import { ApiError, getMissions } from "../../services/api";
import { isDemoMode } from "../../services/demo";
import { getSupabaseClient } from "../../services/supabase";
import type { MissionListItem } from "../../types/api";

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
      <div className="page-heading">
        <p className="eyebrow">Mtoni catchment · Mission desk</p>
        <h1 id="lobby-title">A living world, shaped by your choices.</h1>
        <p className="page-intro">
          Explore the missions assigned to your class. Each one asks you to
          balance community needs, shared resources, and the long view.
        </p>
      </div>

      <div className="lobby-toolbar">
        <h2>Assigned missions</h2>
        {!loading && !error && (
          <span className="assignment-count">
            {missions.length} {missions.length === 1 ? "mission" : "missions"}
          </span>
        )}
      </div>

      {supabase && session && (
        <button
          className="notice-action"
          type="button"
          onClick={() => void supabase.auth.signOut()}
        >
          Sign out
        </button>
      )}

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
            <article className="mission-card" key={mission.id}>
              <div className="mission-card-topline">
                <span className="subject-tag">{mission.subject}</span>
                <span className="assigned-tag">
                  {mission.recommended ? "Suggested" : "Assigned"}
                </span>
              </div>
              <h3>{mission.title}</h3>
              <p className="mission-description">{mission.description}</p>
              <div className="mission-card-meta">
                <span>
                  Grade band <strong>{mission.grade_band}</strong>
                </span>
                <span>Scenario v{mission.scenario_version}</span>
              </div>
              {mission.last_session_status === "active" &&
                mission.last_session_id && (
                  <p className="game-progress">
                    Saved progress · turn {mission.current_turn ?? 0}
                  </p>
                )}
              {mission.recommendation_reason && (
                <p className="form-hint">{mission.recommendation_reason}</p>
              )}
              {mission.last_session_status === "active" &&
              mission.last_session_id ? (
                <Link
                  className="briefing-link"
                  to={`/simulation?session_id=${encodeURIComponent(mission.last_session_id)}&mission_id=${encodeURIComponent(mission.id)}`}
                >
                  Continue saved mission
                </Link>
              ) : (
                <Link
                  className="briefing-link"
                  to={`/briefing?mission_id=${encodeURIComponent(mission.id)}`}
                  aria-label={`Read briefing for ${mission.title}`}
                >
                  Read mission briefing
                </Link>
              )}
              {mission.last_session_status === "completed" &&
                mission.last_session_id && (
                  <Link
                    className="text-link"
                    to={`/report?session_id=${encodeURIComponent(mission.last_session_id)}`}
                  >
                    Review completed run
                  </Link>
                )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
