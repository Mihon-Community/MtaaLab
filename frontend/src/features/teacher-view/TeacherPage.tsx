import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  ApiError,
  getMission,
  getMissions,
  getSimulationReport,
} from "../../services/api";
import { formatGradeBand } from "../../lib/utils";
import type {
  MissionDetail,
  MissionListItem,
  MissionReport,
} from "../../types/api";
import { ServiceLevelChart } from "@/components/charts";

export function TeacherPage() {
  const [missions, setMissions] = useState<MissionListItem[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [report, setReport] = useState<MissionReport | null>(null);
  const [reportMission, setReportMission] = useState<MissionDetail | null>(
    null,
  );
  const [loadingMissions, setLoadingMissions] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [missionsError, setMissionsError] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [missionAttempt, setMissionAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoadingMissions(true);
    setMissionsError(null);
    void getMissions()
      .then(({ missions: assigned }) => {
        if (active) setMissions(assigned);
      })
      .catch((cause: unknown) => {
        if (active) setMissionsError(describeError(cause));
      })
      .finally(() => {
        if (active) setLoadingMissions(false);
      });
    return () => {
      active = false;
    };
  }, [missionAttempt]);

  async function handleInspectReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = sessionId.trim();
    if (!id || loadingReport) return;
    setLoadingReport(true);
    setReportError(null);
    setReport(null);
    setReportMission(null);
    try {
      const result = await getSimulationReport(id);
      const mission = await getMission(result.mission_id);
      setReport(result);
      setReportMission(mission);
    } catch (cause) {
      setReportError(describeError(cause));
    } finally {
      setLoadingReport(false);
    }
  }

  return (
    <section className="teacher-page" aria-labelledby="teacher-title">
      <p className="eyebrow">Educator workspace</p>
      <div className="page-heading">
        <h1 id="teacher-title">Teacher console</h1>
        <p className="page-intro">
          Review missions assigned to your classes and inspect an authorized
          learner report using its session ID.
        </p>
      </div>

      <div className="notice-card teacher-capability-note">
        <p>
          <strong>Assignment management limitation:</strong> the current API can
          list your assigned missions, but does not expose an endpoint to create
          or edit class assignments. This console will not make direct database
          changes.
        </p>
      </div>

      <section
        className="surface-card"
        aria-labelledby="teacher-missions-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Class scope from your account</p>
            <h2 id="teacher-missions-title">Assigned missions</h2>
          </div>
          {!loadingMissions && !missionsError && (
            <span className="assignment-count">
              {missions.length} {missions.length === 1 ? "mission" : "missions"}
            </span>
          )}
        </div>
        {loadingMissions && (
          <p className="loading-state" role="status">
            Loading class assignments…
          </p>
        )}
        {missionsError && (
          <div className="notice-card notice-card-error" role="alert">
            <p>{missionsError}</p>
            <button
              className="notice-action"
              type="button"
              onClick={() => setMissionAttempt((current) => current + 1)}
              disabled={loadingMissions}
            >
              Retry assignments
            </button>
          </div>
        )}
        {!loadingMissions && !missionsError && missions.length === 0 && (
          <p className="briefing-description">
            No published missions are assigned to your active classes.
          </p>
        )}
        {!loadingMissions && !missionsError && missions.length > 0 && (
          <div className="teacher-mission-list">
            {missions.map((mission) => (
              <article className="teacher-mission-row" key={mission.id}>
                <div>
                  <span className="subject-tag">{mission.subject}</span>
                  <h3>{mission.title}</h3>
                  <p>{mission.description}</p>
                </div>
                <span className="teacher-grade">
                  {formatGradeBand(mission.grade_band)}
                </span>
              </article>
            ))}
          </div>
        )}
      </section>

      <section
        className="teacher-report-section"
        aria-labelledby="teacher-report-title"
      >
        <div className="surface-card">
          <p className="eyebrow">Privacy-scoped report access</p>
          <h2 id="teacher-report-title">Inspect a learner report</h2>
          <p className="briefing-description">
            The FastAPI service verifies that the learner belongs to a class
            assigned to you. No learner name or contact detail is requested.
          </p>
          <form
            className="session-lookup"
            onSubmit={(event) => void handleInspectReport(event)}
          >
            <label className="form-field" htmlFor="teacher-session-id">
              <span>Simulation session ID</span>
              <input
                id="teacher-session-id"
                type="text"
                value={sessionId}
                onChange={(event) => setSessionId(event.target.value)}
                placeholder="Paste an authorized session ID"
                autoComplete="off"
                required
              />
            </label>
            <button
              className="primary-action"
              type="submit"
              disabled={loadingReport}
            >
              {loadingReport ? "Loading report…" : "Inspect report"}
            </button>
          </form>
          {reportError && (
            <div className="notice-card notice-card-error" role="alert">
              <p>{reportError}</p>
            </div>
          )}
        </div>

        {report && reportMission && (
          <article className="surface-card teacher-report-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{reportMission.title}</p>
                <h2>
                  {formatLabel(report.status)} · Turn {report.current_turn}
                </h2>
              </div>
              <Link
                className="text-link"
                to={`/report?session_id=${encodeURIComponent(report.session_id)}`}
              >
                Open full report
              </Link>
            </div>
            <p>
              <strong>Learning objective:</strong>{" "}
              {reportMission.learning_objectives[0]}
            </p>
            <div className="report-overview">
              <div className="report-overview-card">
                <span className="metric-label">Decisions</span>
                <strong>{report.decisions.length}</strong>
              </div>
              <div className="report-overview-card">
                <span className="metric-label">Wellbeing</span>
                <strong>{Math.round(report.outcomes.wellbeing)}%</strong>
              </div>
              <div className="report-overview-card">
                <span className="metric-label">Crop health</span>
                <strong>{Math.round(report.outcomes.crop_health)}%</strong>
              </div>
            </div>
            <ServiceLevelChart
              serviceLevels={report.outcomes.service_levels}
              unmetDemand={report.outcomes.unmet_demand_by_sector}
            />
            <p className="form-hint">
              These are recorded simulation values and formative evidence, not a
              student grade.
            </p>
          </article>
        )}
      </section>

      <div className="teacher-footer">
        <Link className="text-link" to="/">
          Return to mission lobby
        </Link>
      </div>
    </section>
  );
}

function describeError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401)
      return "Your session is not signed in or has expired. Sign in, then retry.";
    if (error.status === 404)
      return "This mission or report is not available in your class scope.";
  }
  return "The request could not be completed. Check your connection and try again.";
}

function formatLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
