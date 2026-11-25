/**
 * Committed Mtoni scenario definition, mirrored from
 * backend/app/simulation/scenarios/mtoni_v1.json.
 * The client never edits these values; they describe server-approved rules.
 */

export interface ScenarioParameterRule {
  minimum?: number;
  maximum?: number;
  allowed?: string[];
}

export interface ScenarioAction {
  label: string;
  cost: number;
  delay_turns: number;
  one_time: boolean;
  parameters: Record<string, ScenarioParameterRule>;
  effect: { type: string } & Record<string, unknown>;
  prerequisites?: string[];
}

export interface ScenarioPolicy {
  label: string;
  weights: Record<"households" | "school" | "clinic" | "farms", number>;
}

export interface Scenario {
  scenario_id: string;
  rules_version: string;
  title: string;
  summary: string;
  turn_duration: { value: number; unit: string };
  number_of_turns: number;
  units: Record<string, string>;
  reservoir_capacity: number;
  initial_state: SimulationStateSeed;
  inflow_schedule: number[];
  critical_service_minimums: Partial<
    Record<"households" | "school" | "clinic" | "farms", number>
  >;
  allocation_policies: Record<string, ScenarioPolicy>;
  actions: Record<string, ScenarioAction>;
  scripted_events: { turn: number; event_id: string; message: string }[];
  approved_actors: { actor_id: string; persona: string; rules: string }[];
  learning_objectives: string[];
}

export interface SimulationStateSeed {
  current_turn: number;
  reservoir_level: number;
  reservoir_capacity: number;
  demand_by_sector: Record<string, number>;
  leakage: number;
  budget_remaining: number;
  service_levels: Record<string, number>;
  unmet_demand_by_sector: Record<string, number>;
  crop_health: number;
  wellbeing: number;
  allocation_policy: string;
  used_actions: string[];
  pending_effects: unknown[];
}

export const MTONI_MISSION_ID = "40000000-0000-4000-8000-000000000001";

export const MTONI_SCENARIO: Scenario = {
  scenario_id: "mtoni",
  rules_version: "mtoni-rules-v1",
  title: "Mtoni water resilience",
  summary:
    "A fictional East African community plans for a prolonged water shortage.",
  turn_duration: { value: 1, unit: "week" },
  number_of_turns: 6,
  units: { water: "fictional water units", budget: "fictional budget credits" },
  reservoir_capacity: 100,
  initial_state: {
    current_turn: 0,
    reservoir_level: 60,
    reservoir_capacity: 100,
    demand_by_sector: { households: 20, school: 8, clinic: 6, farms: 15 },
    leakage: 4,
    budget_remaining: 100,
    service_levels: { households: 1, school: 1, clinic: 1, farms: 1 },
    unmet_demand_by_sector: {
      households: 0,
      school: 0,
      clinic: 0,
      farms: 0,
    },
    crop_health: 70,
    wellbeing: 70,
    allocation_policy: "balanced",
    used_actions: [],
    pending_effects: [],
  },
  inflow_schedule: [5, 4, 5, 3, 4, 5],
  critical_service_minimums: { clinic: 0.7, school: 0.6 },
  allocation_policies: {
    balanced: {
      label: "Balanced needs",
      weights: { households: 1, school: 1, clinic: 1, farms: 1 },
    },
    household_focus: {
      label: "Household focus",
      weights: { households: 2, school: 1, clinic: 1, farms: 1 },
    },
    farm_focus: {
      label: "Farm focus",
      weights: { households: 1, school: 1, clinic: 1, farms: 2 },
    },
  },
  actions: {
    repair_main_pipe: {
      label: "Repair main leaking pipe",
      cost: 25,
      delay_turns: 0,
      one_time: true,
      parameters: {},
      effect: { type: "reduce_leakage", amount: 2 },
    },
    conservation_campaign: {
      label: "Introduce conservation campaign",
      cost: 15,
      delay_turns: 1,
      one_time: true,
      parameters: {
        household_reduction_ratio: { minimum: 0.05, maximum: 0.2 },
      },
      effect: {
        type: "reduce_demand",
        sector: "households",
        ratio_parameter: "household_reduction_ratio",
      },
    },
    change_allocation: {
      label: "Change water allocation",
      cost: 0,
      delay_turns: 0,
      one_time: false,
      parameters: {
        policy_id: {
          allowed: ["balanced", "household_focus", "farm_focus"],
        },
      },
      effect: { type: "set_allocation_policy", parameter: "policy_id" },
    },
    install_storage: {
      label: "Install storage capacity",
      cost: 30,
      delay_turns: 0,
      one_time: true,
      parameters: { capacity_increase: { minimum: 10, maximum: 30 } },
      effect: { type: "increase_capacity", parameter: "capacity_increase" },
    },
    efficient_irrigation: {
      label: "Adopt efficient irrigation",
      cost: 20,
      delay_turns: 1,
      one_time: true,
      parameters: { farm_reduction_ratio: { minimum: 0.05, maximum: 0.25 } },
      effect: {
        type: "reduce_demand",
        sector: "farms",
        ratio_parameter: "farm_reduction_ratio",
      },
    },
  },
  scripted_events: [
    {
      turn: 1,
      event_id: "weekly_water_report",
      message: "The community reviews the first week's water use.",
    },
    {
      turn: 2,
      event_id: "school_meeting",
      message: "The school asks how the plan protects learners.",
    },
    {
      turn: 3,
      event_id: "market_update",
      message: "Farmers share an update from the local market.",
    },
    {
      turn: 4,
      event_id: "clinic_update",
      message: "The clinic reports on its essential water needs.",
    },
    {
      turn: 5,
      event_id: "community_forum",
      message: "Community members compare the effects of the plan.",
    },
    {
      turn: 6,
      event_id: "mission_review",
      message: "The community reviews the final mission results.",
    },
  ],
  approved_actors: [
    {
      actor_id: "clinic_nurse",
      persona:
        "A fictional clinic nurse who explains essential clinic water needs.",
      rules:
        "Use calm, age-appropriate English. Ask about trade-offs; never prescribe medical care or change simulation values.",
    },
    {
      actor_id: "farmer",
      persona:
        "A fictional farmer who explains irrigation and crop trade-offs.",
      rules:
        "Use respectful, age-appropriate English. Do not claim facts absent from the supplied state.",
    },
    {
      actor_id: "head_teacher",
      persona: "A fictional head teacher who explains school water needs.",
      rules:
        "Use supportive, age-appropriate English. Ask evidence-based questions and never grade a learner.",
    },
  ],
  learning_objectives: [
    "Explain how finite water, infrastructure loss, and sector demands interact.",
    "Compare allocation trade-offs using recorded simulation evidence.",
    "Use a replay to evaluate an alternative plan.",
  ],
};
