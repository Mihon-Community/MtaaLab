import { useMemo, useState } from "react";
import type {
  DecisionRequest,
  MissionAction,
  MissionDetail,
  SimulationState,
} from "../../types/api";

interface DecisionPanelProps {
  mission: MissionDetail;
  state: SimulationState;
  expectedTurn: number;
  isSubmitting: boolean;
  isComplete: boolean;
  isReadOnly: boolean;
  errorMessage: string | null;
  onSubmit: (decision: DecisionRequest) => void;
}

export function DecisionPanel({
  mission,
  state,
  expectedTurn,
  isSubmitting,
  isComplete,
  isReadOnly,
  errorMessage,
  onSubmit,
}: DecisionPanelProps) {
  const [selectedAction, setSelectedAction] = useState("");
  const [parameters, setParameters] = useState<Record<string, number | string>>(
    {},
  );
  const action = mission.action_catalogue.find(
    (item) => item.action_type === selectedAction,
  );
  const parameterEntries = action
    ? Object.entries(action.parameters ?? {})
    : [];
  const missingParameters = parameterEntries.some(
    ([name]) => parameters[name] === undefined || parameters[name] === "",
  );
  const cannotAfford =
    action !== undefined && (action.cost ?? 0) > state.budget_remaining;
  const alreadyUsed =
    action?.one_time === true &&
    state.used_actions.includes(action.action_type);
  const canConfirm =
    action !== undefined &&
    !missingParameters &&
    !cannotAfford &&
    !alreadyUsed &&
    !isSubmitting &&
    !isComplete &&
    !isReadOnly;
  const effects = useMemo(
    () =>
      action
        ? describeEffect(action, parameters, mission)
        : "Select an intervention to review its cost and effect before confirming.",
    [action, mission, parameters],
  );

  function chooseAction(actionType: string) {
    setSelectedAction(actionType);
    setParameters({});
  }

  function setParameter(
    name: string,
    value: string,
    definition: NonNullable<MissionAction["parameters"]>[string],
  ) {
    if (value === "") {
      setParameters((current) => ({ ...current, [name]: "" }));
      return;
    }

    const parsedValue = definition.allowed ? value : Number(value);
    if (typeof parsedValue === "number" && !Number.isFinite(parsedValue))
      return;
    setParameters((current) => ({ ...current, [name]: parsedValue }));
  }

  return (
    <section
      className="surface-card decision-panel"
      aria-labelledby="decision-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">One choice at a time</p>
          <h2 id="decision-title">Decision centre</h2>
        </div>
        <span className="turn-chip">Turn {expectedTurn}</span>
      </div>
      <p className="briefing-description">
        Choose an available intervention. Review its server-configured cost and
        effect, then confirm to advance the simulation by one turn.
      </p>

      <fieldset
        className="action-options"
        disabled={isSubmitting || isComplete || isReadOnly}
      >
        <legend>Available actions</legend>
        {mission.action_catalogue.map((item) => {
          const used =
            item.one_time === true &&
            state.used_actions.includes(item.action_type);
          const unaffordable = (item.cost ?? 0) > state.budget_remaining;
          return (
            <label
              className={`action-option${selectedAction === item.action_type ? " action-option-selected" : ""}`}
              key={item.action_type}
            >
              <input
                type="radio"
                name="mission-action"
                value={item.action_type}
                checked={selectedAction === item.action_type}
                onChange={() => chooseAction(item.action_type)}
              />
              <span className="action-option-copy">
                <strong>{item.label}</strong>
                <span>
                  {item.cost ?? 0} credits
                  {(item.delay_turns ?? 0) > 0
                    ? ` · takes effect after ${item.delay_turns} turn${item.delay_turns === 1 ? "" : "s"}`
                    : ""}
                  {used ? " · already used" : ""}
                  {unaffordable ? " · over current budget" : ""}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {action && parameterEntries.length > 0 && (
        <div className="action-parameters">
          {parameterEntries.map(([name, definition]) => {
            const isRatio = name.endsWith("_ratio");
            const label = formatParameterName(name);
            return definition.allowed ? (
              <label className="form-field" key={name}>
                <span>{label}</span>
                <select
                  value={String(parameters[name] ?? "")}
                  onChange={(event) =>
                    setParameter(name, event.target.value, definition)
                  }
                  disabled={isSubmitting || isComplete || isReadOnly}
                  required
                >
                  <option value="">Choose one</option>
                  {definition.allowed.map((value) => (
                    <option key={value} value={value}>
                      {policyLabel(value, mission)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="form-field" key={name}>
                <span>{label}</span>
                <div className="number-input-wrap">
                  <input
                    type="number"
                    min={
                      definition.minimum === undefined
                        ? undefined
                        : isRatio
                          ? definition.minimum * 100
                          : definition.minimum
                    }
                    max={
                      definition.maximum === undefined
                        ? undefined
                        : isRatio
                          ? definition.maximum * 100
                          : definition.maximum
                    }
                    step={isRatio ? 1 : 1}
                    value={
                      parameters[name] === undefined
                        ? ""
                        : isRatio
                          ? Number(parameters[name]) * 100
                          : Number(parameters[name])
                    }
                    onChange={(event) =>
                      setParameter(
                        name,
                        isRatio && event.target.value !== ""
                          ? String(Number(event.target.value) / 100)
                          : event.target.value,
                        definition,
                      )
                    }
                    disabled={isSubmitting || isComplete || isReadOnly}
                    required
                  />
                  <span>{isRatio ? "%" : "units"}</span>
                </div>
              </label>
            );
          })}
        </div>
      )}

      <div className="decision-preview" aria-live="polite">
        <span className="preview-label">Before you confirm</span>
        <p>{effects}</p>
        {action && (
          <p className="preview-cost">
            Cost: <strong>{action.cost ?? 0} fictional budget credits</strong>
          </p>
        )}
      </div>

      {errorMessage && (
        <div className="notice-card notice-card-error" role="alert">
          <p>{errorMessage}</p>
        </div>
      )}
      {isComplete && (
        <p className="complete-note" role="status">
          This mission is complete. Its confirmed state is ready to review.
        </p>
      )}
      {isReadOnly && !isComplete && (
        <p className="form-hint" role="status">
          Reconnect and load the latest confirmed state before submitting a
          decision. Offline decisions are not queued or accepted.
        </p>
      )}
      <button
        className="primary-action confirm-decision"
        type="button"
        disabled={!canConfirm}
        onClick={() => {
          if (!action || !canConfirm) return;
          onSubmit({
            action_type: action.action_type,
            parameters,
            expected_turn: expectedTurn,
          });
        }}
      >
        {isSubmitting
          ? "Confirming with the simulation…"
          : "Confirm decision & advance"}
      </button>
      {cannotAfford && (
        <p className="form-hint" role="status">
          This action costs more than your currently confirmed budget.
        </p>
      )}
      {alreadyUsed && (
        <p className="form-hint" role="status">
          This one-time action has already been submitted for this session.
        </p>
      )}
    </section>
  );
}

function describeEffect(
  action: MissionAction,
  parameters: Record<string, number | string>,
  mission: MissionDetail,
) {
  const effectType = action.effect?.type;
  if (effectType === "reduce_leakage") {
    return "Repairs the main pipe and reduces network leakage according to the mission rules.";
  }
  if (effectType === "reduce_demand") {
    const sector = String(action.effect?.sector ?? "community");
    const parameterName = String(action.effect?.ratio_parameter ?? "");
    const ratio = parameters[parameterName];
    const amount =
      typeof ratio === "number" ? ` by ${Math.round(ratio * 100)}%` : "";
    return `Reduces ${formatParameterName(sector).toLowerCase()} demand${amount} after the configured delay.`;
  }
  if (effectType === "set_allocation_policy") {
    const policyId = String(parameters.policy_id ?? "");
    return policyId
      ? `Applies the ${policyLabel(policyId, mission)} allocation policy.`
      : "Applies the allocation policy you select.";
  }
  if (effectType === "increase_capacity") {
    const increase = parameters.capacity_increase;
    return typeof increase === "number"
      ? `Increases maximum reservoir capacity by ${increase} fictional water units. It does not create water.`
      : "Increases maximum reservoir capacity without creating additional water.";
  }
  return "The simulation engine will validate and apply this action.";
}

function policyLabel(policyId: string, mission: MissionDetail) {
  return (
    mission.allocation_policies.find((policy) => policy.policy_id === policyId)
      ?.label ?? formatParameterName(policyId)
  );
}

function formatParameterName(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
