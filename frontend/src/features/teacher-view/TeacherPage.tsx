import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { Link } from "react-router-dom";
import {
  ApiError,
  getMission,
  getMissions,
  getSimulationReport,
  apiFetch,
} from "../../services/api";
import { isDemoMode } from "../../services/demo";
import { getSupabaseClient } from "../../services/supabase";
import type {
  MissionDetail,
  MissionListItem,
  MissionReport,
  MobileJoinCodeResponse,
  MobileRosterClass,
  MobileRosterResponse,
} from "../../types/api";

export function TeacherPage() {
  const supabase = getSupabaseClient();
  const demoMode = isDemoMode();
  const [session, setSession] = useState<Session | null>(null);
  const [missions, setMissions] = useState<MissionListItem[]>([]);
  const [classes, setClasses] = useState<MobileRosterClass[]>([]);
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [joinCode, setJoinCode] = useState<MobileJoinCodeResponse | null>(null);
  const [report, setReport] = useState<MissionReport | null>(null);
  const [reportMission, setReportMission] = useState<MissionDetail | null>(
    null,
  );
  const [loadingMissions, setLoadingMissions] = useState(false);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [creatingCode, setCreatingCode] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [missionsError, setMissionsError] = useState<string | null>(null);
  const [classesError, setClassesError] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [missionAttempt, setMissionAttempt] = useState(0);
  const [classAttempt, setClassAttempt] = useState(0);

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
      setLoadingMissions(false);
      setMissionsError(null);
      return () => {
        active = false;
      };
    }

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
  }, [demoMode, missionAttempt, session]);

  useEffect(() => {
    let active = true;
    if (demoMode || !session) {
      setClasses([]);
      setLoadingClasses(false);
      setClassesError(null);
      return () => {
        active = false;
      };
    }

    setLoadingClasses(true);
    setClassesError(null);
    void apiFetch<MobileRosterResponse>("/api/mobile/classes")
      .then(({ classes: roster }) => {
        if (active) setClasses(roster);
      })
      .catch((cause: unknown) => {
        if (active) setClassesError(describeError(cause));
      })
      .finally(() => {
        if (active) setLoadingClasses(false);
      });
    return () => {
      active = false;
    };
  }, [classAttempt, demoMode, session]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || signingIn) return;
    setSigningIn(true);
    setAuthError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setAuthError(
          "Sign-in failed. Check the school-issued teacher account.",
        );
      } else {
        setEmail("");
        setPassword("");
      }
    } catch (cause) {
      setAuthError(describeError(cause));
    } finally {
      setSigningIn(false);
    }
  }

  async function issueCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!classId || !studentId || creatingCode) return;
    setCreatingCode(true);
    setClassesError(null);
    setJoinCode(null);
    try {
      const result = await apiFetch<MobileJoinCodeResponse>(
        "/api/mobile/join-codes",
        {
          method: "POST",
          body: JSON.stringify({ class_id: classId, student_id: studentId }),
        },
      );
      setJoinCode(result);
    } catch (cause) {
      setClassesError(describeError(cause));
    } finally {
      setCreatingCode(false);
    }
  }

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

  if (!supabase && !demoMode) {
    return (
      <section aria-labelledby="teacher-title">
        <h1 id="teacher-title">Teacher access</h1>
        <p>
          Connect Supabase to sign in, manage feature-phone access, and review
          learner reports.
        </p>
      </section>
    );
  }

  if (supabase && !session && !demoMode) {
    return (
      <section aria-labelledby="teacher-title">
        <h1 id="teacher-title">Teacher access</h1>
        <p>Sign in with your school-issued teacher account to continue.</p>
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
        {authError && <p role="alert">{authError}</p>}
      </section>
    );
  }

  const selectedClass = classes.find((item) => item.class_id === classId);

  return (
    <section className="teacher-page" aria-labelledby="teacher-title">
      <p className="eyebrow">Educator workspace</p>
      <div className="page-heading">
        <h1 id="teacher-title">Teacher console</h1>
        <p className="page-intro">
          Review missions assigned to your classes, inspect authorized learner
          reports, and issue feature-phone access codes.
        </p>
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

      <div className="notice-card teacher-capability-note">
        <p>
          <strong>Assignment management limitation:</strong> the current API
          supports viewing assigned missions but has no endpoint to create or
          edit class assignments. Mobile roster and one-time code endpoints are
          available to authorized teachers; this console does not write directly
          to the database.
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
                  Grade {mission.grade_band}
                </span>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="surface-card" aria-labelledby="mobile-access-title">
        <p className="eyebrow">Feature-phone access</p>
        <h2 id="mobile-access-title">Issue a one-time learner code</h2>
        <p className="briefing-description">
          Codes are scoped to learners already enrolled in one of your classes
          and are shown only once.
        </p>
        {demoMode ? (
          <p className="form-hint">
            Feature-phone code issuance requires the authenticated API and is
            unavailable in local demo mode.
          </p>
        ) : (
          <>
            {loadingClasses && (
              <p className="loading-state" role="status">
                Loading your classes…
              </p>
            )}
            {classesError && (
              <div className="notice-card notice-card-error" role="alert">
                <p>{classesError}</p>
                <button
                  className="notice-action"
                  type="button"
                  onClick={() => setClassAttempt((current) => current + 1)}
                  disabled={loadingClasses || creatingCode}
                >
                  Retry class roster
                </button>
              </div>
            )}
            {!loadingClasses && !classesError && classes.length === 0 && (
              <p className="briefing-description">
                No active class learners are available for this account.
              </p>
            )}
            {!loadingClasses && classes.length > 0 && (
              <form
                className="auth-form teacher-code-form"
                onSubmit={(event) => void issueCode(event)}
              >
                <label>
                  Class
                  <select
                    value={classId}
                    onChange={(event) => {
                      setClassId(event.target.value);
                      setStudentId("");
                      setJoinCode(null);
                    }}
                    required
                  >
                    <option value="">Choose a class</option>
                    {classes.map((item) => (
                      <option key={item.class_id} value={item.class_id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Learner
                  <select
                    value={studentId}
                    onChange={(event) => {
                      setStudentId(event.target.value);
                      setJoinCode(null);
                    }}
                    required
                    disabled={!selectedClass}
                  >
                    <option value="">Choose a learner</option>
                    {selectedClass?.learners.map((learner) => (
                      <option
                        key={learner.student_id}
                        value={learner.student_id}
                      >
                        {learner.display_name}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" disabled={!studentId || creatingCode}>
                  {creatingCode ? "Creating…" : "Create one-time code"}
                </button>
              </form>
            )}
            {joinCode && (
              <article className="join-code-card" aria-live="polite">
                <h3>Share this code with the learner</h3>
                <output className="join-code-value">
                  {joinCode.join_code}
                </output>
                <p>
                  Expires {new Date(joinCode.expires_at).toLocaleString()} and
                  can be used once.
                </p>
                <p>
                  The learner can text JOIN followed by the code, or enter it in
                  the USSD menu.
                </p>
                <p>
                  Keep this code private. It will not be shown again after you
                  leave this page.
                </p>
              </article>
            )}
          </>
        )}
        <p className="teacher-privacy-note">
          Linking a phone enables play only. Optional reminders require the
          learner to text OPT IN; STOP ends reminders without deleting game
          progress.
        </p>
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
