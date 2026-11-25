import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, getMissions } from "../../services/api";
import { formatGradeBand } from "../../lib/utils";
import type { MissionListItem } from "../../types/api";

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
                <span className="assigned-tag">Assigned</span>
              </div>
              <h3>{mission.title}</h3>
              <p className="mission-description">{mission.description}</p>
              <div className="mission-card-meta">
                <span>
                  <strong>{formatGradeBand(mission.grade_band)}</strong>
                </span>
                <span>Scenario v{mission.scenario_version}</span>
              </div>
              <Link
                className="briefing-link"
                to={`/briefing?mission_id=${encodeURIComponent(mission.id)}`}
                aria-label={`Read briefing for ${mission.title}`}
              >
                Read mission briefing
              </Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
