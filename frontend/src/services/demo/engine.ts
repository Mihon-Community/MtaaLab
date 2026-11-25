/**
 * Faithful TypeScript port of backend/app/simulation/engine.py,
 * allocation_rules.py and action_validator.py.
 *
 * This module runs only inside the labelled local demo transport. It exists so
 * the UI can be rehearsed before FastAPI/Supabase are configured; production
 * rendering always uses values returned by the API and never calls this code.
 */
import type { DecisionRequest, Sector, SimulationState } from "../../types/api";
import { MTONI_SCENARIO, type Scenario, type ScenarioAction } from "./scenario";

const EPSILON = 1e-8;
const ALLOCATION_EPSILON = 1e-12;

export class EngineValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineValidationError";
  }
}

export interface TurnResult {
  turn: number;
  accepted: true;
  action: DecisionRequest;
  state: SimulationState;
  events: {
    event_type: string;
    turn_number: number;
    payload: Record<string, unknown>;
    engine_version: string;
  }[];
  water_accounting: {
    opening_reservoir: number;
    inflow: number;
    closing_reservoir: number;
    withdrawals_by_sector: Record<Sector, number>;
    leakage: number;
    overflow: number;
  };
  idempotent_replay: boolean;
}

/** Mutable private copy of the canonical state used during one calculation. */
interface DraftState {
  leakage: number;
  demand_by_sector: Record<Sector, number>;
  service_levels: Record<Sector, number>;
  unmet_demand_by_sector: Record<Sector, number>;
  allocation_policy: string;
  reservoir_capacity: number;
  budget_remaining: number;
  used_actions: string[];
  pending_effects: ScheduledEffectDraft[];
  [key: string]: unknown;
}

interface ScheduledEffectDraft {
  action_type?: string;
  apply_turn: number;
  effect_type?: string;
  sector: Sector;
  reduction_ratio: number;
  [key: string]: unknown;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Python's round() uses banker's rounding; the indicator formulas rely on it. */
function pythonRound(value: number): number {
  const floor = Math.floor(value);
  const difference = value - floor;
  if (Math.abs(difference - 0.5) < 1e-9) {
    return floor % 2 === 0 ? floor : floor + 1;
  }
  return Math.round(value);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asState(value: unknown): SimulationState {
  if (!isRecord(value)) throw new EngineValidationError("invalid world state");
  const sectors: Sector[] = ["households", "school", "clinic", "farms"];
  const demand = value.demand_by_sector;
  const service = value.service_levels;
  const unmet = value.unmet_demand_by_sector;
  if (!isRecord(demand) || !isRecord(service) || !isRecord(unmet)) {
    throw new EngineValidationError("sector records are required");
  }
  for (const sector of sectors) {
    if (
      !isFiniteNumber(demand[sector]) ||
      !isFiniteNumber(service[sector]) ||
      !isFiniteNumber(unmet[sector])
    ) {
      throw new EngineValidationError(`sector ${sector} is incomplete`);
    }
    if (demand[sector] < 0 || unmet[sector] < 0) {
      throw new EngineValidationError(`sector ${sector} cannot be negative`);
    }
    if (service[sector] < 0 || service[sector] > 1) {
      throw new EngineValidationError(
        `service level for ${sector} must be in [0, 1]`,
      );
    }
  }

  return {
    current_turn: Number(value.current_turn),
    reservoir_level: Number(value.reservoir_level),
    reservoir_capacity: Number(value.reservoir_capacity),
    demand_by_sector: {
      households: Number(demand.households),
      school: Number(demand.school),
      clinic: Number(demand.clinic),
      farms: Number(demand.farms),
    },
    leakage: Number(value.leakage),
    budget_remaining: Number(value.budget_remaining),
    service_levels: {
      households: Number(service.households),
      school: Number(service.school),
      clinic: Number(service.clinic),
      farms: Number(service.farms),
    },
    unmet_demand_by_sector: {
      households: Number(unmet.households),
      school: Number(unmet.school),
      clinic: Number(unmet.clinic),
      farms: Number(unmet.farms),
    },
    crop_health: Number(value.crop_health),
    wellbeing: Number(value.wellbeing),
    allocation_policy: String(value.allocation_policy),
    used_actions: Array.isArray(value.used_actions)
      ? value.used_actions.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    pending_effects: Array.isArray(value.pending_effects)
      ? (value.pending_effects as SimulationState["pending_effects"])
      : [],
  };
}

function validateAction(
  action: DecisionRequest,
  state: SimulationState,
  scenario: Scenario,
): ScenarioAction {
  const definition = scenario.actions[action.action_type];
  if (!definition) {
    throw new EngineValidationError("unknown action type");
  }
  if (action.expected_turn !== state.current_turn) {
    throw new EngineValidationError("expected_turn is stale");
  }
  const parameterRules = Object.keys(definition.parameters).sort();
  const providedParameters = Object.keys(action.parameters ?? {}).sort();
  if (
    parameterRules.length !== providedParameters.length ||
    parameterRules.some((name, index) => name !== providedParameters[index])
  ) {
    throw new EngineValidationError(
      "action parameters do not match the configured schema",
    );
  }
  for (const [name, rule] of Object.entries(definition.parameters)) {
    const raw = action.parameters[name];
    if (rule.allowed) {
      if (!rule.allowed.includes(String(raw))) {
        throw new EngineValidationError(`${name} is not an allowed value`);
      }
      continue;
    }
    if (!isFiniteNumber(Number(raw))) {
      throw new EngineValidationError(`${name} must be numeric`);
    }
    const value = Number(raw);
    if (rule.minimum !== undefined && value < rule.minimum) {
      throw new EngineValidationError(
        `${name} is below its configured minimum`,
      );
    }
    if (rule.maximum !== undefined && value > rule.maximum) {
      throw new EngineValidationError(
        `${name} is above its configured maximum`,
      );
    }
  }
  for (const prerequisite of definition.prerequisites ?? []) {
    if (!state.used_actions.includes(prerequisite)) {
      throw new EngineValidationError(
        `action prerequisite not met: ${prerequisite}`,
      );
    }
  }
  if (definition.one_time && state.used_actions.includes(action.action_type)) {
    throw new EngineValidationError("one-time action has already been used");
  }
  if (definition.cost > state.budget_remaining) {
    throw new EngineValidationError("insufficient budget for this action");
  }
  if (
    definition.effect.type === "reduce_demand" &&
    !Object.prototype.hasOwnProperty.call(
      state.demand_by_sector,
      String(definition.effect.sector),
    )
  ) {
    throw new EngineValidationError(
      "demand effect refers to an unknown sector",
    );
  }
  if (
    action.action_type === "change_allocation" &&
    !Object.prototype.hasOwnProperty.call(
      scenario.allocation_policies,
      String(action.parameters.policy_id),
    )
  ) {
    throw new EngineValidationError(
      "allocation policy is not configured for this scenario",
    );
  }
  return definition;
}

function applyEffect(
  draft: DraftState,
  effect: Record<string, unknown>,
  parameters: Record<string, unknown>,
): void {
  const effectType = effect.type;
  if (effectType === "reduce_leakage") {
    draft.leakage = Math.max(0, Number(draft.leakage) - Number(effect.amount));
    return;
  }
  if (effectType === "reduce_demand") {
    const sector = String(effect.sector) as Sector;
    const parameter = String(effect.ratio_parameter);
    const ratio = Number(parameters[parameter]);
    draft.demand_by_sector[sector] = Math.max(
      0,
      Number(draft.demand_by_sector[sector]) * (1 - ratio),
    );
    return;
  }
  if (effectType === "set_allocation_policy") {
    draft.allocation_policy = String(parameters[String(effect.parameter)]);
    return;
  }
  if (effectType === "increase_capacity") {
    draft.reservoir_capacity =
      Number(draft.reservoir_capacity) +
      Number(parameters[String(effect.parameter)]);
    return;
  }
  throw new EngineValidationError("unsupported configured action effect");
}

function applyDueEffects(draft: DraftState, turnNumber: number): void {
  const pending: ScheduledEffectDraft[] = [];
  for (const effect of draft.pending_effects) {
    if (Number(effect.apply_turn) <= turnNumber) {
      const sector = String(effect.sector) as Sector;
      const ratio = Number(effect.reduction_ratio);
      draft.demand_by_sector[sector] = Math.max(
        0,
        Number(draft.demand_by_sector[sector]) * (1 - ratio),
      );
    } else {
      pending.push(effect);
    }
  }
  draft.pending_effects = pending;
}

function allocateWater(
  available: number,
  demand: Record<Sector, number>,
  weights: Record<Sector, number>,
  criticalMinimums: Partial<Record<Sector, number>>,
): Record<Sector, number> {
  if (!Number.isFinite(available) || available < 0) {
    throw new EngineValidationError("available water must be non-negative");
  }
  const sectors = Object.keys(demand) as Sector[];
  if (sectors.length === 0) {
    throw new EngineValidationError("sector demands are required");
  }
  for (const sector of sectors) {
    if (!Number.isFinite(demand[sector]) || demand[sector] < 0) {
      throw new EngineValidationError("sector demands must be non-negative");
    }
    if (!Number.isFinite(weights[sector]) || weights[sector] <= 0) {
      throw new EngineValidationError("allocation weight must be positive");
    }
  }

  const allocations = Object.fromEntries(
    sectors.map((sector) => [sector, 0]),
  ) as Record<Sector, number>;

  const minimumRequirements = new Map<Sector, number>();
  for (const [sector, minimumShare] of Object.entries(criticalMinimums) as [
    Sector,
    number,
  ][]) {
    if (!Object.prototype.hasOwnProperty.call(demand, sector)) {
      throw new EngineValidationError(
        `critical minimum refers to unknown sector ${sector}`,
      );
    }
    if (
      !Number.isFinite(minimumShare) ||
      minimumShare < 0 ||
      minimumShare > 1
    ) {
      throw new EngineValidationError(
        `critical minimum for ${sector} must be in [0, 1]`,
      );
    }
    minimumRequirements.set(sector, demand[sector] * minimumShare);
  }

  const requestedCritical = [...minimumRequirements.values()].reduce(
    (sum, value) => sum + value,
    0,
  );
  const criticalWater = Math.min(available, requestedCritical);
  if (requestedCritical > ALLOCATION_EPSILON && criticalWater > 0) {
    let remainingCritical = criticalWater;
    const criticalSectors = [...minimumRequirements.keys()];
    criticalSectors.forEach((sector, index) => {
      const requirement = minimumRequirements.get(sector) as number;
      const share =
        index === criticalSectors.length - 1
          ? remainingCritical
          : (criticalWater * requirement) / requestedCritical;
      remainingCritical -= share;
      allocations[sector] = Math.min(requirement, Math.max(0, share));
    });
  }

  let remainingWater = Math.max(
    0,
    available - sectors.reduce((sum, sector) => sum + allocations[sector], 0),
  );
  const remainingDemand = Object.fromEntries(
    sectors.map((sector) => [
      sector,
      Math.max(0, demand[sector] - allocations[sector]),
    ]),
  ) as Record<Sector, number>;

  while (remainingWater > ALLOCATION_EPSILON) {
    const eligible = sectors.filter(
      (sector) => remainingDemand[sector] > ALLOCATION_EPSILON,
    );
    if (eligible.length === 0) break;
    const weightTotal = eligible.reduce(
      (sum, sector) => sum + weights[sector],
      0,
    );
    let distributed = 0;
    for (const sector of eligible) {
      const proposed = (remainingWater * weights[sector]) / weightTotal;
      const amount = Math.min(proposed, remainingDemand[sector]);
      allocations[sector] += amount;
      remainingDemand[sector] -= amount;
      distributed += amount;
    }
    if (distributed <= ALLOCATION_EPSILON) break;
    remainingWater = Math.max(0, remainingWater - distributed);
  }

  return Object.fromEntries(
    sectors.map((sector) => [
      sector,
      Math.min(demand[sector], Math.max(0, allocations[sector])),
    ]),
  ) as Record<Sector, number>;
}

export function calculateNextState(
  currentState: SimulationState,
  action: DecisionRequest,
  scenario: Scenario = MTONI_SCENARIO,
): TurnResult {
  const state = asState(currentState);
  const definition = validateAction(action, state, scenario);

  const nextTurn = state.current_turn + 1;
  if (nextTurn > scenario.number_of_turns) {
    throw new EngineValidationError("mission has reached its final turn");
  }
  const inflow = Number(scenario.inflow_schedule[nextTurn - 1]);

  const draft: DraftState = {
    ...state,
    demand_by_sector: { ...state.demand_by_sector },
    service_levels: { ...state.service_levels },
    unmet_demand_by_sector: { ...state.unmet_demand_by_sector },
    used_actions: [...state.used_actions],
    pending_effects: state.pending_effects.map((effect) => ({ ...effect })),
  };
  draft.budget_remaining =
    Number(state.budget_remaining) - Number(definition.cost);
  if (definition.one_time) {
    draft.used_actions.push(action.action_type);
  }

  applyDueEffects(draft, nextTurn);
  const effectDefinition = definition.effect ?? {};
  if (definition.delay_turns === 0) {
    applyEffect(draft, effectDefinition, action.parameters);
  } else if (effectDefinition.type === "reduce_demand") {
    const sector = String(effectDefinition.sector) as Sector;
    const parameter = String(effectDefinition.ratio_parameter);
    draft.pending_effects.push({
      action_type: action.action_type,
      apply_turn: nextTurn + definition.delay_turns,
      effect_type: "reduce_demand",
      sector,
      reduction_ratio: Number(action.parameters[parameter]),
    });
  } else {
    throw new EngineValidationError("only demand reductions may be delayed");
  }

  const openingReservoir = Number(state.reservoir_level);
  const capacity = Number(draft.reservoir_capacity);
  const grossWater = openingReservoir + inflow;
  const overflow = Math.max(0, grossWater - capacity);
  const availableWater = grossWater - overflow;
  const actualLeakage = Math.min(Number(draft.leakage), availableWater);
  const distributableWater = Math.max(0, availableWater - actualLeakage);

  const policyId = String(draft.allocation_policy);
  const policy = scenario.allocation_policies[policyId];
  if (!policy) {
    throw new EngineValidationError(
      "selected allocation policy is not configured",
    );
  }
  const withdrawals = allocateWater(
    distributableWater,
    draft.demand_by_sector,
    policy.weights,
    scenario.critical_service_minimums,
  );
  const totalWithdrawals = Object.values(withdrawals).reduce(
    (sum, value) => sum + value,
    0,
  );
  let closingReservoir =
    grossWater - overflow - actualLeakage - totalWithdrawals;
  if (closingReservoir < 0 && Math.abs(closingReservoir) <= EPSILON) {
    closingReservoir = 0;
  }
  closingReservoir = clamp(closingReservoir, 0, capacity);

  const unmetDemand = {} as Record<Sector, number>;
  const serviceLevels = {} as Record<Sector, number>;
  for (const [sector, demand] of Object.entries(draft.demand_by_sector) as [
    Sector,
    number,
  ][]) {
    const delivered = Math.min(demand, withdrawals[sector]);
    unmetDemand[sector] = Math.max(0, demand - delivered);
    serviceLevels[sector] = demand ? clamp(delivered / demand, 0, 1) : 1;
  }

  const cropHealthDelta = pythonRound(10 * (serviceLevels.farms - 0.7));
  const wellbeingDelta = pythonRound(
    6 * (serviceLevels.households - 0.7) + 8 * (serviceLevels.clinic - 0.7),
  );

  const nextState = asState({
    ...draft,
    current_turn: nextTurn,
    reservoir_level: closingReservoir,
    reservoir_capacity: capacity,
    service_levels: serviceLevels,
    unmet_demand_by_sector: unmetDemand,
    crop_health: clamp(Number(state.crop_health) + cropHealthDelta, 0, 100),
    wellbeing: clamp(Number(state.wellbeing) + wellbeingDelta, 0, 100),
  });

  const events = scenario.scripted_events
    .filter((entry) => entry.turn === nextTurn)
    .map((entry) => ({
      event_type: entry.event_id,
      turn_number: nextTurn,
      payload: { message: entry.message },
      engine_version: scenario.rules_version,
    }));

  const accounting = {
    opening_reservoir: openingReservoir,
    inflow,
    closing_reservoir: closingReservoir,
    withdrawals_by_sector: withdrawals,
    leakage: actualLeakage,
    overflow,
  };

  const lhs = openingReservoir + inflow;
  const rhs = closingReservoir + totalWithdrawals + actualLeakage + overflow;
  if (Math.abs(lhs - rhs) > EPSILON) {
    throw new EngineValidationError("water accounting invariant was violated");
  }

  return {
    turn: nextTurn,
    accepted: true,
    action,
    state: nextState,
    events,
    water_accounting: accounting,
    idempotent_replay: false,
  };
}
