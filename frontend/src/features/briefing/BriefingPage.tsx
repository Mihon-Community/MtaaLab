import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AudioControls } from "../../components/AudioControls";
import { ApiError, createSimulation, getMission } from "../../services/api";
import { formatGradeBand } from "../../lib/utils";
import type { MissionDetail } from "../../types/api";

export function BriefingPage() {
  const [searchParams] = useSearchParams();
  const missionId = searchParams.get("mission_id");
  const navigate = useNavigate();
  const [mission, setMission] = useState<MissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [errorStage, setErrorStage] = useState<"briefing" | "start" | null>(
    null,
  );
  const [attempt, setAttempt] = useState(0);
  const idempotency = useRef<{ missionId: string; key: string } | null>(null);

  useEffect(() => {
    let active = true;

    if (!missionId) {
      setMission(null);
      setError(null);
      setErrorStage(null);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setError(null);
    setErrorStage(null);
    void getMission(missionId)
      .then((result) => {
        if (active) {
          setMission(result);
          setErrorStage(null);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setErrorStage("briefing");
          setError(
            cause instanceof Error
              ? cause
              : new Error(
                  "An unexpected error occurred while loading this mission.",
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
  }, [missionId, attempt]);

  async function handleStartMission() {
    if (!missionId) return;
    setStarting(true);
    setError(null);
    setErrorStage(null);
    if (idempotency.current?.missionId !== missionId) {
      idempotency.current = { missionId, key: crypto.randomUUID() };
    }

    try {
      const session = await createSimulation(
        missionId,
        idempotency.current.key,
      );
      navigate(
        `/simulation?session_id=${encodeURIComponent(session.session_id)}&mission_id=${encodeURIComponent(session.mission_id)}`,
      );
    } catch (cause) {
      setErrorStage("start");
      setError(
        cause instanceof Error
          ? cause
          : new Error(
              "An unexpected error occurred while starting this mission.",
            ),
      );
    } finally {
      setStarting(false);
    }
  }

  const errorMessage =
    error instanceof ApiError && error.status === 401
      ? "Your session is not signed in. Sign in with an assigned learner account to open this mission."
      : error instanceof ApiError && error.status === 404
        ? "This mission is no longer available to your account."
        : errorStage === "start"
          ? "Starting the mission hasn't been confirmed. Retry safely; the same request key will be reused."
          : "We couldn't load this mission. Check your connection and try again.";

  return (
    <section aria-labelledby="briefing-title">
      <p className="eyebrow">Mission desk · Briefing</p>
      {!missionId && (
        <>
          <h1 id="briefing-title">Choose a mission first.</h1>
          <p className="page-intro">
            Select an assigned mission from the lobby to read its briefing.
          </p>
          <Link className="primary-action" to="/">
            Back to mission lobby
          </Link>
        </>
      )}
      {loading && (
        <div className="loading-state" role="status" aria-live="polite">
          <p>Loading the mission briefing…</p>
        </div>
      )}
      {error && (
        <div className="notice-card notice-card-error" role="alert">
          <p>{errorMessage}</p>
          <button
            className="notice-action"
            type="button"
            onClick={() => {
              if (errorStage === "start") {
                void handleStartMission();
              } else {
                setAttempt((current) => current + 1);
              }
            }}
            disabled={loading}
          >
            {errorStage === "start" ? "Retry starting mission" : "Try again"}
          </button>
        </div>
      )}
      {!loading && !error && mission && (
        <>
          <div className="page-heading">
            <p className="eyebrow">
              {mission.subject} · {formatGradeBand(mission.grade_band)}
            </p>
            <h1 id="briefing-title">{mission.title}</h1>
            <p className="page-intro">{mission.description}</p>
          </div>

          <div className="briefing-layout">
            <article className="surface-card">
              <h2>Your learning objectives</h2>
              {mission.learning_objectives.length > 0 ? (
                <ul className="objective-list">
                  {mission.learning_objectives.map((objective) => (
                    <li key={objective}>{objective}</li>
                  ))}
                </ul>
              ) : (
                <p className="briefing-description">
                  Your teacher has not added learning objectives to this
                  briefing.
                </p>
              )}
            </article>
            <aside className="surface-card" aria-label="Mission details">
              <h2>Before you begin</h2>
              <p className="briefing-description">
                Mtoni is a fictional East African community planning for a
                prolonged water shortage. Rainfall, stored water, leaking
                infrastructure, a limited budget, and community needs are
                connected by the mission rules.
              </p>
              <dl className="briefing-facts">
                <div>
                  <dt>Scenario version</dt>
                  <dd>{mission.scenario_version}</dd>
                </div>
                <div>
                  <dt>Planning horizon</dt>
                  <dd>
                    {mission.number_of_turns} turns
                    {mission.turn_duration.value && mission.turn_duration.unit
                      ? ` (${mission.turn_duration.value} ${mission.turn_duration.unit} per turn)`
                      : ""}
                  </dd>
                </div>
                <div>
                  <dt>Water unit</dt>
                  <dd>{mission.units.water}</dd>
                </div>
                <div>
                  <dt>Budget unit</dt>
                  <dd>{mission.units.budget}</dd>
                </div>
              </dl>
              <p className="form-hint">
                Your starting values load from the simulation service when you
                begin. The HUD displays only confirmed values.
              </p>
              <div className="action-stack">
                <button
                  className="primary-action"
                  type="button"
                  onClick={() => void handleStartMission()}
                  disabled={starting}
                >
                  {starting ? "Starting mission…" : "Begin mission"}
                </button>
                <Link className="text-link" to="/">
                  Back to mission lobby
                </Link>
              </div>
            </aside>
          </div>

          <div className="briefing-detail-grid">
            <section className="surface-card" aria-labelledby="rules-title">
              <p className="eyebrow">Transparent rules</p>
              <h2 id="rules-title">Available interventions</h2>
              <p className="briefing-description">
                The scenario defines the choices, costs, and parameter limits.
                The simulation engine—not AI—calculates all water, budget, and
                service outcomes.
              </p>
              <div className="briefing-action-list">
                {mission.action_catalogue.map((action) => (
                  <article className="briefing-action" key={action.action_type}>
                    <div className="briefing-action-heading">
                      <h3>{action.label}</h3>
                      <span>{action.cost} credits</span>
                    </div>
                    <p>
                      {effectSummary(action.effect.type)}
                      {action.delay_turns > 0
                        ? ` Effect begins after ${action.delay_turns} turn${action.delay_turns === 1 ? "" : "s"}.`
                        : ""}
                    </p>
                    {action.one_time && (
                      <span className="action-rule-tag">
                        One-time intervention
                      </span>
                    )}
                  </article>
                ))}
              </div>
            </section>

            <aside className="surface-card" aria-labelledby="controls-title">
              <p className="eyebrow">Accessible controls</p>
              <h2 id="controls-title">How to play</h2>
              <ol className="controls-list">
                <li>
                  Inspect a location on the map or choose it from the list.
                </li>
                <li>Choose one intervention and review its cost and effect.</li>
                <li>
                  Confirm once to submit your decision and advance one turn.
                </li>
                <li>Review the server-confirmed state and saved timeline.</li>
              </ol>
              <p className="briefing-description">
                Every map location has a keyboard- and touch-accessible list
                control. Use the display controls in the header to adjust text
                size or contrast. Reduced-motion preferences are respected.
              </p>
              <AudioControls
                text={[
                  mission.title,
                  mission.description,
                  ...mission.learning_objectives,
                ].join(". ")}
              />
            </aside>
          </div>
        </>
      )}
    </section>
  );
}

function effectSummary(effectType: unknown) {
  switch (effectType) {
    case "reduce_leakage":
      return "Repairs the main pipe and reduces network leakage.";
    case "reduce_demand":
      return "Reduces demand in the configured community sector.";
    case "set_allocation_policy":
      return "Changes how water is shared among sectors.";
    case "increase_capacity":
      return "Increases storage capacity but does not create water.";
    default:
      return "The mission engine applies this intervention using its configured rules.";
  }
}
