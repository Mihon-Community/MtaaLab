import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ApiError,
  createReplay,
  getMission,
  getReflection,
  getSimulationHistory,
  getSimulationState,
  saveReflection,
  submitDecision,
} from "../../services/api";
import type {
  AiFeedbackStatus,
  DecisionResponse,
  MissionAction,
  MissionDetail,
  ReflectionAnswerCode,
  ReflectionResponse,
  SessionStateResponse,
} from "../../types/api";
import { PortfolioWorldCanvas } from "./PortfolioWorldCanvas";

type PortfolioState = Record<string, unknown>;
type ConfirmedRun = SessionStateResponse<PortfolioState>;
type PortfolioDecision = DecisionResponse<PortfolioState>;

function key(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `decision-${Date.now()}-${Math.random()}`
  );
}

function defaultParametersFor(action: MissionAction): Record<string, unknown> {
  const preferred: Record<string, number> = {
    household_reduction_ratio: 0.1,
    farm_reduction_ratio: 0.1,
    capacity_increase: 10,
  };
  const parameters: Record<string, unknown> = {};
  for (const [name, definition] of Object.entries(action.parameters ?? {})) {
    if (definition.allowed?.length) continue;
    const candidate = preferred[name] ?? definition.minimum ?? 0;
    const minimum = definition.minimum ?? candidate;
    const maximum = definition.maximum ?? candidate;
    parameters[name] = Math.min(maximum, Math.max(minimum, candidate));
  }
  return parameters;
}

export function PortfolioRunPage() {
  const { search } = useLocation();
  const navigate = useNavigate();
  const query = useMemo(() => new URLSearchParams(search), [search]);
  const sessionId = query.get("sessionId") ?? query.get("session_id") ?? "";
  const missionId = query.get("missionId") ?? query.get("mission_id") ?? "";
  const [mission, setMission] = useState<MissionDetail | null>(null);
  const [run, setRun] = useState<ConfirmedRun | null>(null);
  const [lastDecision, setLastDecision] = useState<PortfolioDecision | null>(
    null,
  );
  const [reflection, setReflection] = useState<ReflectionResponse | null>(null);
  const [hintLevel, setHintLevel] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const pendingDecision = useRef<{ fingerprint: string; key: string } | null>(
    null,
  );

  useEffect(() => {
    setMission(null);
    setRun(null);
    setLastDecision(null);
    setReflection(null);
    setHintLevel(0);
    setError("");
    pendingDecision.current = null;
  }, [missionId, sessionId]);

  const refreshState = useCallback(async () => {
    const state = await getSimulationState<PortfolioState>(sessionId);
    setRun(state);
    if (state.turn <= 0) {
      setReflection(null);
      setLastDecision(null);
      return;
    }

    const [saved, history] = await Promise.all([
      getReflection(sessionId, state.turn).catch((cause: unknown) => {
        if (cause instanceof ApiError && cause.status === 404)
          return { reflection: null };
        throw cause;
      }),
      getSimulationHistory<PortfolioState>(sessionId, { limit: 100 }),
    ]);
    setReflection(saved.reflection);
    setHintLevel(
      saved.reflection?.misconception_tag === "hint-requested" ? 1 : 0,
    );
    const currentEntry = history.entries.find(
      (entry) => entry.turn === state.turn,
    );
    setLastDecision(
      currentEntry?.action
        ? {
            session_id: state.session_id,
            turn: currentEntry.turn,
            accepted: true,
            state: state.state,
            events: currentEntry.events,
            ai_feedback_status:
              (currentEntry.ai_feedback_status as AiFeedbackStatus | null) ??
              "not_requested",
          }
        : null,
    );
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || !missionId) return;
    let alive = true;
    setError("");
    void Promise.all([
      getMission(missionId),
      getSimulationState<PortfolioState>(sessionId),
    ])
      .then(async ([detail, state]) => {
        if (!alive) return;
        setMission(detail);
        setRun(state);
        if (state.turn > 0) {
          const [saved, history] = await Promise.all([
            getReflection(sessionId, state.turn).catch((cause: unknown) => {
              if (cause instanceof ApiError && cause.status === 404)
                return { reflection: null };
              throw cause;
            }),
            getSimulationHistory<PortfolioState>(sessionId, { limit: 100 }),
          ]);
          if (!alive) return;
          setReflection(saved.reflection);
          setHintLevel(
            saved.reflection?.misconception_tag === "hint-requested" ? 1 : 0,
          );
          const currentEntry = history.entries.find(
            (entry) => entry.turn === state.turn,
          );
          if (currentEntry?.action) {
            setLastDecision({
              session_id: state.session_id,
              turn: currentEntry.turn,
              accepted: true,
              state: state.state,
              events: currentEntry.events,
              ai_feedback_status:
                (currentEntry.ai_feedback_status as AiFeedbackStatus | null) ??
                "not_requested",
            });
          }
        }
      })
      .catch(() => {
        if (alive)
          setError("Could not load the saved game. Reconnect and try again.");
      });
    return () => {
      alive = false;
    };
  }, [attempt, missionId, sessionId]);

  async function submitChoice(
    actionType: string,
    parameters: Record<string, unknown> = {},
  ) {
    if (!run || busy) return;
    setBusy(true);
    setError("");
    const expectedTurn = run.turn;
    const fingerprint = `${sessionId}:${expectedTurn}:${actionType}:${JSON.stringify(parameters)}`;
    let request = pendingDecision.current;
    if (request?.fingerprint !== fingerprint) {
      request = { fingerprint, key: key() };
      pendingDecision.current = request;
    }
    try {
      const result = await submitDecision<PortfolioState>(
        sessionId,
        {
          action_type: actionType,
          parameters,
          expected_turn: expectedTurn,
        },
        request.key,
      );
      pendingDecision.current = null;
      setLastDecision(result);
      setRun({
        ...run,
        turn: result.turn,
        state: result.state,
        status:
          result.turn >= (mission?.number_of_turns ?? 6)
            ? "completed"
            : run.status,
      });
      setReflection(null);
      setHintLevel(0);
      try {
        const confirmed = await getSimulationState<PortfolioState>(sessionId);
        setRun(confirmed);
      } catch {
        // The decision response remains the confirmed snapshot; status will
        // refresh on the next successful read.
      }
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setError(
          "The session changed on the server. Loading the latest confirmed state; review it before choosing again.",
        );
      } else {
        setError("The choice was not confirmed. Loading the last saved turn…");
      }
      await refreshState().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  async function submitReflection(answerCode: ReflectionAnswerCode) {
    if (!run || busy) return;
    setBusy(true);
    setError("");
    try {
      const saved = await saveReflection(
        sessionId,
        { turn_number: run.turn, answer_code: answerCode },
        `reflection-${sessionId}-${run.turn}`,
      );
      setReflection(saved);
      setHintLevel(saved.misconception_tag === "hint-requested" ? 1 : 0);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setError(
          "An explanation is already saved for this turn. It cannot be replaced.",
        );
        const existing = await getReflection(sessionId, run.turn).catch(
          () => null,
        );
        if (existing?.reflection) {
          setReflection(existing.reflection);
          setHintLevel(
            existing.reflection.misconception_tag === "hint-requested" ? 1 : 0,
          );
        }
      } else {
        setError("Your explanation was not recorded. Retry before continuing.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function replay() {
    if (!run) return;
    setBusy(true);
    try {
      const newRun = await createReplay(sessionId, key());
      navigate(
        `/simulation?missionId=${encodeURIComponent(missionId)}&sessionId=${encodeURIComponent(newRun.session_id)}`,
      );
    } catch {
      setError("Could not start a replay. Your completed run is still saved.");
    } finally {
      setBusy(false);
    }
  }

  if (!sessionId || !missionId) {
    return (
      <section>
        <h1>Choose a game first</h1>
        <Link to="/">Back to games</Link>
      </section>
    );
  }
  if (!mission || !run) {
    return (
      <section>
        <h1>Loading saved game</h1>
        {error && (
          <div className="notice-card notice-card-error" role="alert">
            <p>{error}</p>
            <button
              className="notice-action"
              type="button"
              onClick={() => setAttempt((current) => current + 1)}
            >
              Reconnect and retry
            </button>
          </div>
        )}
        <Link to="/">Back to games</Link>
      </section>
    );
  }

  const scenarioId = run.scenario_id || mission.scenario_id;
  const completed =
    run.status === "completed" || run.turn >= mission.number_of_turns;
  const reflectionChoices = mission.reflection_choices ?? {};
  const requiresReflection =
    scenarioId !== "mtoni" && Object.keys(reflectionChoices).length > 0;
  const canChoose =
    !busy &&
    !completed &&
    (!requiresReflection || !lastDecision || Boolean(reflection));
  const marketAction = mission.action_catalogue.find(
    (action) => action.action_type === "market_plan",
  );
  const marketChoices = Array.isArray(marketAction?.choices)
    ? marketAction.choices
    : Object.entries(mission.plans ?? {}).map(([id, plan]) => ({
        id,
        label: plan.label,
      }));
  const gameActions = mission.action_catalogue.filter(
    (action) => action.action_type !== "market_plan",
  );
  const allocationPolicies = mission.allocation_policies;
  const costUnit =
    mission.units.budget ??
    mission.units.fund ??
    mission.units.cash ??
    "fictional tokens";

  function renderAction(action: MissionAction) {
    const actionType = action.action_type;
    const label = String(action.label ?? actionType).replaceAll("_", " ");
    if (actionType === "change_allocation") {
      return allocationPolicies.map((policy) => (
        <button
          key={String(policy.policy_id)}
          disabled={!canChoose}
          onClick={() =>
            void submitChoice(actionType, { policy_id: policy.policy_id })
          }
        >
          {label}: {String(policy.label ?? policy.policy_id)}
        </button>
      ));
    }
    return (
      <button
        key={actionType}
        disabled={!canChoose}
        onClick={() =>
          void submitChoice(actionType, defaultParametersFor(action))
        }
      >
        {label}
        {typeof action.cost === "number" ? ` · ${action.cost} ${costUnit}` : ""}
      </button>
    );
  }

  return (
    <section aria-labelledby="game-title" aria-busy={busy}>
      <div className="run-heading">
        <div>
          <p className="eyebrow">
            Turn {run.turn} of {mission.number_of_turns}
          </p>
          <h1 id="game-title">{mission.title}</h1>
          <p>{mission.description}</p>
        </div>
        <Link to="/">Games</Link>
      </div>

      <PortfolioWorldCanvas
        scenarioId={scenarioId}
        state={run.state}
        units={mission.units}
      />

      <section className="confirmed-state" aria-label="Confirmed game state">
        <h2>Saved state</h2>
        <dl className="state-grid">
          {Object.entries(run.state)
            .filter(
              ([name, value]) =>
                name !== "completed_actions" &&
                name !== "pending_effects" &&
                typeof value !== "object",
            )
            .map(([name, value]) => (
              <div key={name}>
                <dt>{name.replaceAll("_", " ")}</dt>
                <dd>{String(value)}</dd>
              </div>
            ))}
        </dl>
      </section>

      {lastDecision && (
        <section className="turn-result" aria-live="polite">
          <h2>Turn {lastDecision.turn} confirmed</h2>
          {lastDecision.events.map((event, index) => (
            <p key={`${event.event_type}-${index}`}>
              {event.event_type.replaceAll("_", " ")}:{" "}
              {Object.entries(event.payload)
                .filter(([, value]) => typeof value !== "object")
                .map(
                  ([name, value]) =>
                    `${name.replaceAll("_", " ")} ${String(value)}`,
                )
                .join(" · ")}
            </p>
          ))}
        </section>
      )}

      {lastDecision && requiresReflection && !reflection && (
        <section
          className="reflection-panel"
          aria-labelledby="reflection-title"
        >
          <h2 id="reflection-title">Why do you think this happened?</h2>
          <p>
            Choose the explanation that best matches the event and saved values.
          </p>
          <div className="choice-list">
            {Object.entries(reflectionChoices).map(([code, choice]) => (
              <button
                key={code}
                disabled={busy}
                onClick={() =>
                  void submitReflection(code as ReflectionAnswerCode)
                }
              >
                {code}. {choice.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {reflection && lastDecision && (
        <p className="reflection-saved" role="status">
          Explanation saved: {reflection.misconception_tag.replaceAll("-", " ")}
          .
        </p>
      )}

      {reflection?.misconception_tag === "hint-requested" && lastDecision && (
        <section
          className="hint-panel"
          aria-live="polite"
          aria-label="Game hint"
        >
          <h2>Hint {hintLevel} of 3</h2>
          <p>
            {mission.hint_ladder?.en?.[Math.max(0, hintLevel - 1)] ??
              "Compare the last confirmed event with the saved values."}
          </p>
          {hintLevel < 3 && (
            <button
              type="button"
              onClick={() => setHintLevel((level) => Math.min(3, level + 1))}
            >
              Show next hint
            </button>
          )}
        </section>
      )}

      {completed ? (
        <section>
          <h2>Game complete</h2>
          <p>
            Your confirmed turns and choices are saved. Compare them with a
            replay or review the learning report.
          </p>
          <div className="report-footer-actions">
            <button disabled={busy} onClick={() => void replay()}>
              Replay game
            </button>
            <Link
              className="text-link"
              to={`/report?session_id=${encodeURIComponent(sessionId)}`}
            >
              Open learning report
            </Link>
          </div>
        </section>
      ) : (
        <section aria-labelledby="decision-title">
          <h2 id="decision-title">Choose the next decision</h2>
          {scenarioId === "soko_market" ? (
            <div className="choice-list">
              {marketChoices.map((choice) => (
                <button
                  key={choice.id}
                  disabled={!canChoose}
                  onClick={() =>
                    void submitChoice("market_plan", { plan_id: choice.id })
                  }
                >
                  {choice.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="choice-list">
              {gameActions.flatMap(renderAction)}
            </div>
          )}
          {!canChoose &&
            !busy &&
            !completed &&
            requiresReflection &&
            lastDecision &&
            !reflection && (
              <p>Record a short explanation before moving to the next turn.</p>
            )}
          {busy && (
            <p role="status">
              Saving… the display will update after confirmation.
            </p>
          )}
        </section>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
