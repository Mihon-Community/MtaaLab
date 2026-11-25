import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ApiError,
  getMission,
  getSimulationDebrief,
  getSimulationHistory,
  getSimulationReport,
} from "../../services/api";
import type {
  DebriefResponse,
  HistoryEntry,
  MissionDetail,
  MissionReport,
} from "../../types/api";
import {
  BudgetTrendChart,
  ReservoirTrendChart,
  ServiceLevelChart,
} from "@/components/charts";
import { PageHeader } from "@/components/layout/PageHeader";

export function ReportPage() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [report, setReport] = useState<MissionReport | null>(null);
  const [mission, setMission] = useState<MissionDetail | null>(null);
  const [debrief, setDebrief] = useState<DebriefResponse | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [explanation, setExplanation] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debriefError, setDebriefError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    if (!sessionId) {
      setLoading(false);
      setReport(null);
      setMission(null);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setError(null);
    setReport(null);
    setMission(null);
    setDebrief(null);
    void (async () => {
      try {
        const result = await getSimulationReport(sessionId);
        const [missionInfo, savedHistory] = await Promise.all([
          getMission(result.mission_id),
          getSimulationHistory(sessionId),
        ]);
        if (active) {
          setReport(result);
          setMission(missionInfo);
          setHistory(savedHistory.entries);
        }
      } catch (cause) {
        if (active) setError(describeError(cause));
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [sessionId, attempt]);

  async function handleGenerateDebrief(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sessionId || !report || generating) return;
    setGenerating(true);
    setDebriefError(null);
    try {
      const response = await getSimulationDebrief(
        sessionId,
        report.status === "completed"
          ? explanation.trim() || undefined
          : undefined,
      );
      setDebrief(response);
    } catch (cause) {
      setDebriefError(describeError(cause));
    } finally {
      setGenerating(false);
    }
  }

  if (!sessionId) {
    return (
      <section aria-labelledby="report-title">
        <p className="eyebrow">Learning record</p>
        <h1 id="report-title">Your learning report</h1>
        <p className="page-intro">
          Open a mission report from an active or completed simulation.
        </p>
        <Link className="primary-action" to="/simulation">
          Return to simulation
        </Link>
      </section>
    );
  }

  return (
    <section className="report-page" aria-labelledby="report-title">
      <PageHeader
        eyebrow="Learning record · Evidence, not just a score"
        title={mission?.title ?? "Learning report"}
        description="Review recorded outcomes alongside the decisions that produced them. Feedback is formative and is not an official grade."
        titleId="report-title"
        className="mb-6"
      />

      {loading && (
        <p className="loading-state" role="status">
          Loading the persisted mission report…
        </p>
      )}
      {error && (
        <div className="notice-card notice-card-error" role="alert">
          <p>{error}</p>
          <button
            className="notice-action"
            type="button"
            onClick={() => setAttempt((current) => current + 1)}
            disabled={loading}
          >
            Retry report
          </button>
        </div>
      )}

      {report && mission && (
        <>
          <div className="report-overview">
            <div className="report-overview-card">
              <span className="metric-label">Mission status</span>
              <strong>{formatLabel(report.status)}</strong>
            </div>
            <div className="report-overview-card">
              <span className="metric-label">Turns confirmed</span>
              <strong>
                {report.current_turn} / {mission.number_of_turns}
              </strong>
            </div>
            <div className="report-overview-card">
              <span className="metric-label">Decisions recorded</span>
              <strong>{report.decisions.length}</strong>
            </div>
          </div>

          <article className="surface-card report-objective">
            <p className="eyebrow">Learning objective</p>
            <h2>{mission.learning_objectives[0]}</h2>
            <ul className="objective-list compact-objectives">
              {mission.learning_objectives.slice(1).map((objective) => (
                <li key={objective}>{objective}</li>
              ))}
            </ul>
          </article>

          <section className="surface-card" aria-labelledby="outcomes-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Engine-confirmed outcomes</p>
                <h2 id="outcomes-title">What changed</h2>
              </div>
            </div>
            <div className="report-outcome-grid">
              <Outcome
                label="Reservoir"
                value={`${report.outcomes.reservoir_level} / ${report.outcomes.reservoir_capacity} ${mission.units.water}`}
              />
              <Outcome
                label="Budget remaining"
                value={`${report.outcomes.budget_remaining} ${mission.units.budget}`}
              />
              <Outcome
                label="Wellbeing index"
                value={`${Math.round(report.outcomes.wellbeing)}%`}
              />
              <Outcome
                label="Crop health"
                value={`${Math.round(report.outcomes.crop_health)}%`}
              />
            </div>
            <ServiceLevelChart
              serviceLevels={report.outcomes.service_levels}
              unmetDemand={report.outcomes.unmet_demand_by_sector}
            />
            {history.length > 0 ? (
              <div className="grid gap-6 lg:grid-cols-2">
                <ReservoirTrendChart
                  entries={history}
                  unit={mission.units.water ?? "water units"}
                />
                <BudgetTrendChart
                  entries={history}
                  unit={mission.units.budget ?? "budget credits"}
                />
              </div>
            ) : null}
          </section>

          <div className="report-columns">
            <section className="surface-card" aria-labelledby="decisions-title">
              <p className="eyebrow">Persisted history</p>
              <h2 id="decisions-title">Decisions made</h2>
              {report.decisions.length > 0 ? (
                <ol className="report-decision-list">
                  {report.decisions.map((decision, index) => {
                    const label =
                      mission.action_catalogue.find(
                        (action) => action.action_type === decision.action_type,
                      )?.label ?? formatLabel(decision.action_type);
                    return (
                      <li key={`${decision.expected_turn}-${index}`}>
                        <span>Turn {decision.expected_turn + 1}</span>
                        <strong>{label}</strong>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="briefing-description">
                  No interventions were recorded for this run.
                </p>
              )}
            </section>

            <section className="surface-card" aria-labelledby="events-title">
              <p className="eyebrow">Scenario record</p>
              <h2 id="events-title">Events</h2>
              {report.events.length > 0 ? (
                <ul className="report-event-list">
                  {report.events.map((event, index) => (
                    <li
                      key={`${event.turn_number}-${event.event_type}-${index}`}
                    >
                      <strong>
                        Turn {event.turn_number} ·{" "}
                        {formatLabel(event.event_type)}
                      </strong>
                      <span>
                        {typeof event.payload.message === "string"
                          ? event.payload.message
                          : "Recorded event"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="briefing-description">
                  No scripted events were recorded for this run.
                </p>
              )}
            </section>
          </div>

          {report.assessment && (
            <section
              className="surface-card"
              aria-labelledby="saved-assessment"
            >
              <p className="eyebrow">Previously saved feedback</p>
              <h2 id="saved-assessment">Reasoning evidence</h2>
              <p>
                {readText(report.assessment, "overall_feedback") ??
                  "A prior reasoning assessment is attached to this report."}
              </p>
            </section>
          )}

          <section
            className="surface-card debrief-section"
            aria-labelledby="debrief-title"
          >
            <p className="eyebrow">Reflect on your choices</p>
            <h2 id="debrief-title">Learning debrief</h2>
            <p className="briefing-description">
              The debrief uses saved mission evidence. AI availability may vary;
              simulation values always come from the deterministic engine.
            </p>
            <form onSubmit={(event) => void handleGenerateDebrief(event)}>
              <label className="form-field" htmlFor="student-explanation">
                <span>Your explanation (optional)</span>
                <textarea
                  id="student-explanation"
                  maxLength={2000}
                  rows={4}
                  value={explanation}
                  onChange={(event) => setExplanation(event.target.value)}
                  placeholder="What trade-off did you consider? Which saved result supports your thinking?"
                />
              </label>
              {report.status !== "completed" && (
                <p className="form-hint">
                  You can receive a factual debrief now. Reasoning feedback
                  becomes available after the mission is complete.
                </p>
              )}
              <button
                className="primary-action"
                type="submit"
                disabled={generating}
              >
                {generating
                  ? "Preparing debrief…"
                  : "Generate learning debrief"}
              </button>
            </form>

            {debriefError && (
              <div className="notice-card notice-card-error" role="alert">
                <p>{debriefError}</p>
              </div>
            )}
            {debrief && (
              <article className="debrief-result" aria-live="polite">
                <div className="reflection-result-heading">
                  <h3>Grounded reflection</h3>
                  <span>
                    {debrief.source === "nvidia"
                      ? "AI-assisted"
                      : "Factual fallback"}
                  </span>
                </div>
                <p>{debrief.debrief.summary}</p>
                <ul className="objective-list">
                  {debrief.debrief.trade_offs.map((tradeOff) => (
                    <li key={tradeOff}>{tradeOff}</li>
                  ))}
                </ul>
                <h3 className="report-subheading">Try in a replay</h3>
                <p>{debrief.debrief.replay_suggestion}</p>
                {debrief.debrief.reasoning_assessment && (
                  <ReasoningFeedback
                    assessment={debrief.debrief.reasoning_assessment}
                  />
                )}
                {debrief.ai_feedback_status === "ai_unavailable" && (
                  <p className="form-hint">
                    AI is unavailable; this feedback uses validated saved facts
                    only.
                  </p>
                )}
              </article>
            )}
          </section>

          <div className="report-footer-actions">
            <Link
              className="secondary-action"
              to={`/simulation?session_id=${encodeURIComponent(sessionId)}&mission_id=${encodeURIComponent(mission.id)}`}
            >
              Return to simulation
            </Link>
            <Link
              className="text-link"
              to={`/replay?source_session_id=${encodeURIComponent(sessionId)}`}
            >
              Compare an alternative plan
            </Link>
          </div>
        </>
      )}
    </section>
  );
}

function Outcome({ label, value }: { label: string; value: string }) {
  return (
    <div className="report-outcome">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ReasoningFeedback({
  assessment,
}: {
  assessment: NonNullable<DebriefResponse["debrief"]["reasoning_assessment"]>;
}) {
  return (
    <section className="reasoning-feedback" aria-labelledby="reasoning-title">
      <h3 id="reasoning-title">Reasoning feedback</h3>
      <p>{assessment.overall_feedback}</p>
      <ul className="criterion-list">
        {assessment.criteria.map((criterion) => (
          <li key={criterion.criterion_id}>
            <strong>{formatLabel(criterion.criterion_id)}</strong>
            <span>{criterion.evidence}</span>
            <span>{criterion.feedback}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function readText(value: Record<string, unknown>, key: string) {
  const candidate = value[key];
  return typeof candidate === "string" ? candidate : null;
}

function formatLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function describeError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401)
      return "Your session is not signed in or has expired. Sign in, then retry.";
    if (error.status === 404)
      return "This report is not available to your account.";
    if (error.status === 409)
      return "Reasoning feedback is available after the mission is completed.";
  }
  return "The report could not be loaded. Check your connection and try again.";
}
