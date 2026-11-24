import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ApiError,
  createReplay,
  getSimulationReport,
  getSimulationState,
} from "../../services/api";
import type {
  MissionReport,
  Sector,
  SessionStateResponse,
} from "../../types/api";

const sectors: Sector[] = ["households", "school", "clinic", "farms"];

export function ReplayPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sourceId = searchParams.get("source_session_id");
  const replayId = searchParams.get("replay_session_id");
  const missionIdParam = searchParams.get("mission_id");
  const [sourceInput, setSourceInput] = useState(sourceId ?? "");
  const [sourceState, setSourceState] = useState<SessionStateResponse | null>(
    null,
  );
  const [replayState, setReplayState] = useState<SessionStateResponse | null>(
    null,
  );
  const [sourceReport, setSourceReport] = useState<MissionReport | null>(null);
  const [replayReport, setReplayReport] = useState<MissionReport | null>(null);
  const [loading, setLoading] = useState(Boolean(sourceId));
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const replayRequest = useRef<{ sourceId: string; key: string } | null>(null);

  useEffect(() => {
    let active = true;
    setSourceInput(sourceId ?? "");
    if (!sourceId) {
      setLoading(false);
      setSourceState(null);
      setReplayState(null);
      setSourceReport(null);
      setReplayReport(null);
      setError(null);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setError(null);
    setSourceState(null);
    setReplayState(null);
    setSourceReport(null);
    setReplayReport(null);
    void (async () => {
      try {
        const [source, sourceRun] = await Promise.all([
          getSimulationState(sourceId),
          getSimulationReport(sourceId),
        ]);
        if (active) {
          setSourceState(source);
          setSourceReport(sourceRun);
        }
        if (replayId) {
          const [alternative, alternativeRun] = await Promise.all([
            getSimulationState(replayId),
            getSimulationReport(replayId),
          ]);
          if (active) {
            setReplayState(alternative);
            setReplayReport(alternativeRun);
          }
        } else if (active) {
          setReplayState(null);
          setReplayReport(null);
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
  }, [sourceId, replayId, attempt]);

  function handleLoadSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = sourceInput.trim();
    if (!id) return;
    setSearchParams({ source_session_id: id });
  }

  async function handleCreateReplay() {
    if (!sourceId || creating) return;
    setCreating(true);
    setError(null);
    if (replayRequest.current?.sourceId !== sourceId) {
      replayRequest.current = { sourceId, key: crypto.randomUUID() };
    }
    try {
      const replay = await createReplay(sourceId, replayRequest.current.key);
      setSearchParams({
        source_session_id: sourceId,
        replay_session_id: replay.session_id,
        mission_id: replay.mission_id,
      });
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 401
          ? "Your session is not signed in or has expired. Sign in, then retry."
          : "The alternative run was not confirmed. Retry safely; the same request key will be reused.",
      );
    } finally {
      setCreating(false);
    }
  }

  const missionId = missionIdParam ?? sourceReport?.mission_id;

  return (
    <section className="replay-page" aria-labelledby="replay-title">
      <p className="eyebrow">Mtoni catchment · Compare strategies</p>
      <div className="page-heading">
        <h1 id="replay-title">A second run, a different lens.</h1>
        <p className="page-intro">
          Replays start from the original mission’s saved initial state. They
          create a new run and never overwrite the source.
        </p>
      </div>

      {!sourceId && (
        <form
          className="session-lookup surface-card"
          onSubmit={handleLoadSource}
        >
          <label className="form-field" htmlFor="source-session-id">
            <span>Original simulation session ID</span>
            <input
              id="source-session-id"
              type="text"
              value={sourceInput}
              onChange={(event) => setSourceInput(event.target.value)}
              placeholder="Paste the session ID from your simulation"
              autoComplete="off"
              required
            />
          </label>
          <button className="primary-action" type="submit">
            Load saved run
          </button>
        </form>
      )}

      {loading && (
        <p className="loading-state" role="status">
          Loading persisted run details…
        </p>
      )}
      {error && (
        <div className="notice-card notice-card-error" role="alert">
          <p>{error}</p>
          <button
            className="notice-action"
            type="button"
            onClick={() => setAttempt((current) => current + 1)}
            disabled={loading || creating}
          >
            Retry
          </button>
        </div>
      )}

      {sourceState && sourceReport && !replayState && !replayId && (
        <section className="replay-start surface-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Original run</p>
              <h2>
                Turn {sourceState.turn} · {formatLabel(sourceState.status)}
              </h2>
            </div>
            <span className="assignment-count">
              {sourceReport.decisions.length} decisions saved
            </span>
          </div>
          <p className="briefing-description">
            Start a separate run at the original scenario’s initial state, then
            test another plan. The saved source run will remain unchanged.
          </p>
          <button
            className="primary-action"
            type="button"
            onClick={() => void handleCreateReplay()}
            disabled={creating || loading}
          >
            {creating ? "Starting alternative run…" : "Start alternative run"}
          </button>
        </section>
      )}

      {sourceState && replayState && sourceReport && replayReport && (
        <>
          <div className="replay-run-headings">
            <div>
              <span className="eyebrow">Source run</span>
              <h2>Turn {sourceState.turn}</h2>
              <span>{formatLabel(sourceState.status)}</span>
            </div>
            <div>
              <span className="eyebrow">Alternative run</span>
              <h2>Turn {replayState.turn}</h2>
              <span>{formatLabel(replayState.status)}</span>
            </div>
          </div>

          <section className="surface-card" aria-labelledby="comparison-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Confirmed server values</p>
                <h2 id="comparison-title">Run comparison</h2>
              </div>
            </div>
            <div className="comparison-table-wrap">
              <table className="comparison-table">
                <thead>
                  <tr>
                    <th scope="col">Indicator</th>
                    <th scope="col">Original</th>
                    <th scope="col">Alternative</th>
                    <th scope="col">Difference</th>
                  </tr>
                </thead>
                <tbody>
                  <ComparisonRow
                    label="Reservoir"
                    original={sourceState.state.reservoir_level}
                    alternative={replayState.state.reservoir_level}
                    suffix=" water units"
                  />
                  <ComparisonRow
                    label="Budget remaining"
                    original={sourceState.state.budget_remaining}
                    alternative={replayState.state.budget_remaining}
                    suffix=" credits"
                  />
                  <ComparisonRow
                    label="Wellbeing index"
                    original={sourceState.state.wellbeing}
                    alternative={replayState.state.wellbeing}
                    suffix="%"
                  />
                  <ComparisonRow
                    label="Crop health"
                    original={sourceState.state.crop_health}
                    alternative={replayState.state.crop_health}
                    suffix="%"
                  />
                  {sectors.map((sector) => (
                    <ComparisonRow
                      key={sector}
                      label={`${formatLabel(sector)} service`}
                      original={sourceState.state.service_levels[sector] * 100}
                      alternative={
                        replayState.state.service_levels[sector] * 100
                      }
                      suffix="%"
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <p className="form-hint">
              Differences compare the latest confirmed values from each run;
              they do not represent a separate simulation calculation.
            </p>
          </section>

          <div className="comparison-decisions">
            <DecisionSummary
              title="Original decisions"
              decisions={sourceReport.decisions}
            />
            <DecisionSummary
              title="Alternative decisions"
              decisions={replayReport.decisions}
            />
          </div>
        </>
      )}

      {replayState && sourceId && replayId && (
        <div className="report-footer-actions">
          <Link
            className="primary-action"
            to={`/simulation?session_id=${encodeURIComponent(replayId)}&mission_id=${encodeURIComponent(missionId ?? "")}&compare_session_id=${encodeURIComponent(sourceId)}`}
          >
            Continue the alternative run
          </Link>
          <Link
            className="text-link"
            to={`/report?session_id=${encodeURIComponent(replayId)}`}
          >
            Open alternative learning report
          </Link>
        </div>
      )}

      {sourceId && (
        <p className="form-hint">
          Session reads are authorized by the API for the learner or assigned
          teacher. No student name is needed here.
        </p>
      )}
    </section>
  );
}

function ComparisonRow({
  label,
  original,
  alternative,
  suffix,
}: {
  label: string;
  original: number;
  alternative: number;
  suffix: string;
}) {
  const difference = alternative - original;
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>
        {formatNumber(original)}
        {suffix}
      </td>
      <td>
        {formatNumber(alternative)}
        {suffix}
      </td>
      <td>
        {difference > 0 ? "+" : ""}
        {formatNumber(difference)}
        {suffix}
      </td>
    </tr>
  );
}

function DecisionSummary({
  title,
  decisions,
}: {
  title: string;
  decisions: MissionReport["decisions"];
}) {
  return (
    <section className="surface-card">
      <h2>{title}</h2>
      {decisions.length > 0 ? (
        <ol className="report-decision-list">
          {decisions.map((decision, index) => (
            <li key={`${decision.expected_turn}-${index}`}>
              <span>Turn {decision.expected_turn + 1}</span>
              <strong>{formatLabel(decision.action_type)}</strong>
            </li>
          ))}
        </ol>
      ) : (
        <p className="briefing-description">No interventions recorded yet.</p>
      )}
    </section>
  );
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
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
      return "This run is not available to your account.";
    if (error.status === 409)
      return "This replay request conflicts with the original session. Reload the source run and retry.";
  }
  return "The run could not be loaded. Check your connection and try again.";
}
