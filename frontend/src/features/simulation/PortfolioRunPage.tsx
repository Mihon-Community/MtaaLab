import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { apiFetch } from "../../services/api";
import type { DecisionResponse, MissionDetail } from "../../types/api";
import { PortfolioWorldCanvas } from "./PortfolioWorldCanvas";

interface ConfirmedRun {
  session_id: string;
  mission_id: string;
  turn: number;
  status: string;
  scenario_id: string;
  state: Record<string, unknown>;
}

interface ReflectedChoice {
  answer_code: string;
  misconception_tag: string;
}

function key(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `decision-${Date.now()}-${Math.random()}`
  );
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function PortfolioRunPage() {
  const { search } = useLocation();
  const navigate = useNavigate();
  const query = useMemo(() => new URLSearchParams(search), [search]);
  const sessionId = query.get("sessionId") ?? "";
  const missionId = query.get("missionId") ?? "";
  const [mission, setMission] = useState<MissionDetail | null>(null);
  const [run, setRun] = useState<ConfirmedRun | null>(null);
  const [lastDecision, setLastDecision] = useState<DecisionResponse | null>(
    null,
  );
  const [reflection, setReflection] = useState<ReflectedChoice | null>(null);
  const [hintLevel, setHintLevel] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refreshState = useCallback(async () => {
    const state = await apiFetch<ConfirmedRun>(
      `/api/simulations/${sessionId}/state`,
    );
    setRun(state);
    if (state.turn > 0) {
      const [saved, history] = await Promise.all([
        apiFetch<{ reflection: ReflectedChoice | null }>(
          `/api/simulations/${sessionId}/reflections/${state.turn}`,
        ),
        apiFetch<{
          entries: Array<{
            turn: number;
            action: {
              action_type: string;
              parameters: Record<string, unknown>;
            } | null;
            events: DecisionResponse["events"];
          }>;
        }>(`/api/simulations/${sessionId}/history?limit=100`),
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
              ai_feedback_status: "not_requested",
            }
          : null,
      );
    } else {
      setReflection(null);
      setLastDecision(null);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || !missionId) return;
    let alive = true;
    setError("");
    void Promise.all([
      apiFetch<MissionDetail>(`/api/missions/${missionId}`),
      apiFetch<ConfirmedRun>(`/api/simulations/${sessionId}/state`),
    ])
      .then(async ([detail, state]) => {
        if (!alive) return;
        setMission(detail);
        setRun(state);
        if (state.turn > 0) {
          const [saved, history] = await Promise.all([
            apiFetch<{ reflection: ReflectedChoice | null }>(
              `/api/simulations/${sessionId}/reflections/${state.turn}`,
            ),
            apiFetch<{
              entries: Array<{
                turn: number;
                action: {
                  action_type: string;
                  parameters: Record<string, unknown>;
                } | null;
                events: DecisionResponse["events"];
              }>;
            }>(`/api/simulations/${sessionId}/history?limit=100`),
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
              ai_feedback_status: "not_requested",
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
  }, [missionId, sessionId]);

  async function submitDecision(
    actionType: string,
    parameters: Record<string, unknown> = {},
  ) {
    if (!run || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await apiFetch<DecisionResponse>(
        `/api/simulations/${sessionId}/decisions`,
        {
          method: "POST",
          body: JSON.stringify({
            action_type: actionType,
            parameters,
            expected_turn: asNumber(run.state.current_turn),
          }),
        },
        key(),
      );
      setLastDecision(result);
      setRun((current) =>
        current
          ? {
              ...current,
              turn: result.turn,
              state: result.state,
              status:
                result.turn >= (mission?.number_of_turns ?? 6)
                  ? "completed"
                  : "active",
            }
          : current,
      );
      setReflection(null);
      setHintLevel(0);
    } catch {
      setError("The choice was not confirmed. Loading the last saved turn…");
      await refreshState().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  async function submitReflection(answerCode: string) {
    if (!run || busy) return;
    setBusy(true);
    setError("");
    try {
      const saved = await apiFetch<ReflectedChoice>(
        `/api/simulations/${sessionId}/reflections`,
        {
          method: "POST",
          body: JSON.stringify({
            turn_number: run.turn,
            answer_code: answerCode,
          }),
        },
        `reflection-${sessionId}-${run.turn}`,
      );
      setReflection(saved);
      setHintLevel(saved.misconception_tag === "hint-requested" ? 1 : 0);
    } catch {
      setError("Your explanation was not recorded. Retry before continuing.");
    } finally {
      setBusy(false);
    }
  }

  async function replay() {
    if (!run) return;
    setBusy(true);
    try {
      const newRun = await apiFetch<{ session_id: string }>(
        `/api/simulations/${sessionId}/replay`,
        { method: "POST", body: JSON.stringify({}) },
        key(),
      );
      navigate(
        `/simulation?missionId=${missionId}&sessionId=${newRun.session_id}`,
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
        {error && <p role="alert">{error}</p>}
        <Link to="/">Back to games</Link>
      </section>
    );
  }

  const completed =
    run.status === "completed" || run.turn >= mission.number_of_turns;
  const reflectionChoices = mission.reflection_choices ?? {};
  const canChoose =
    !busy && !completed && (!lastDecision || Boolean(reflection));
  const marketAction = mission.action_catalogue.find(
    (action) => action.action_type === "market_plan",
  );
  const marketChoices = Array.isArray(marketAction?.choices)
    ? (marketAction.choices as Array<{ id: string; label: string }>)
    : Object.entries(mission.plans ?? {}).map(([id, plan]) => ({
        id,
        label: plan.label,
      }));
  const gameActions = mission.action_catalogue.filter(
    (action) => action.action_type !== "market_plan",
  );
  const allocationPolicies = mission.allocation_policies;

  function renderAction(action: Record<string, unknown>) {
    const actionType = String(action.action_type);
    const label = String(action.label ?? actionType).replaceAll("_", " ");
    if (actionType === "change_allocation") {
      return allocationPolicies.map((policy) => (
        <button
          key={String(policy.policy_id)}
          disabled={!canChoose}
          onClick={() =>
            void submitDecision(actionType, { policy_id: policy.policy_id })
          }
        >
          {label}: {String(policy.label ?? policy.policy_id)}
        </button>
      ));
    }
    const parameters: Record<string, unknown> =
      {
        conservation_campaign: { household_reduction_ratio: 0.1 },
        efficient_irrigation: { farm_reduction_ratio: 0.1 },
        install_storage: { capacity_increase: 10 },
      }[actionType] ?? {};
    return (
      <button
        key={actionType}
        disabled={!canChoose}
        onClick={() => void submitDecision(actionType, parameters)}
      >
        {label}
        {typeof action.cost === "number"
          ? ` · ${action.cost} fictional tokens`
          : ""}
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

      <PortfolioWorldCanvas scenarioId={run.scenario_id} state={run.state} />

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

      {lastDecision && !reflection && (
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
                onClick={() => void submitReflection(code)}
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
            {mission.hint_ladder.en?.[Math.max(0, hintLevel - 1)] ??
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
            replay.
          </p>
          <button disabled={busy} onClick={() => void replay()}>
            Replay game
          </button>
        </section>
      ) : (
        <section aria-labelledby="decision-title">
          <h2 id="decision-title">Choose the next decision</h2>
          {run.scenario_id === "soko_market" ? (
            <div className="choice-list">
              {marketChoices.map((choice) => (
                <button
                  key={choice.id}
                  disabled={!canChoose}
                  onClick={() =>
                    void submitDecision("market_plan", { plan_id: choice.id })
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
          {!canChoose && !busy && !completed && lastDecision && !reflection && (
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
