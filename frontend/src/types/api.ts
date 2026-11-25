/** Mirrors backend/app/api/schemas.py; keep changes reviewed by both developers. */
export type Sector = "households" | "school" | "clinic" | "farms";

export interface MissionListItem {
  id: string;
  title: string;
  description: string;
  subject: string;
  grade_band: string;
  scenario_version: number;
  recommended?: boolean;
  recommendation_reason?: string | null;
  last_session_id?: string | null;
  last_session_status?: string | null;
  current_turn?: number;
}

export interface MissionListResponse {
  missions: MissionListItem[];
}

export interface ActionParameterDefinition {
  minimum?: number;
  maximum?: number;
  allowed?: string[];
}

export interface MissionAction {
  action_type: string;
  label: string;
  cost: number;
  delay_turns: number;
  one_time: boolean;
  parameters: Record<string, ActionParameterDefinition>;
  effect: Record<string, unknown>;
  choices?: Array<{ id: string; label: string }>;
  [key: string]: unknown;
}

export interface AllocationPolicy {
  policy_id: string;
  label: string;
  weights: Record<Sector, number>;
}

export interface MissionDetail extends MissionListItem {
  learning_objectives: string[];
  scenario_id: string;
  rules_version: string;
  turn_duration: { value?: number; unit?: string };
  number_of_turns: number;
  units: Record<string, string>;
  action_catalogue: MissionAction[];
  allocation_policies: AllocationPolicy[];
  plans?: Record<
    string,
    { label: string; order_quantity: number; price: number }
  >;
  reflection_choices?: Record<string, { tag: string; label: string }>;
  hint_ladder?: Record<string, string[]>;
}

export interface ScheduledEffect {
  action_type: string;
  apply_turn: number;
  effect_type: "reduce_demand";
  sector: Sector;
  reduction_ratio: number;
}

export interface SimulationState {
  current_turn: number;
  reservoir_level: number;
  reservoir_capacity: number;
  demand_by_sector: Record<Sector, number>;
  leakage: number;
  budget_remaining: number;
  service_levels: Record<Sector, number>;
  unmet_demand_by_sector: Record<Sector, number>;
  crop_health: number;
  wellbeing: number;
  allocation_policy: string;
  used_actions: string[];
  pending_effects: ScheduledEffect[];
}

export interface SessionStateResponse {
  session_id: string;
  turn: number;
  status: string;
  state: SimulationState;
}

export interface SessionCreatedResponse extends SessionStateResponse {
  mission_id: string;
}

export interface DecisionRequest {
  action_type: string;
  parameters: Record<string, unknown>;
  expected_turn: number;
}

export interface MobileRosterLearner {
  student_id: string;
  display_name: string;
}
export interface MobileRosterClass {
  class_id: string;
  name: string;
  learners: MobileRosterLearner[];
}
export interface MobileRosterResponse {
  classes: MobileRosterClass[];
}
export interface MobileJoinCodeResponse {
  join_code: string;
  expires_at: string;
  message: string;
}

export interface SimulationEvent {
  event_type: string;
  turn_number: number;
  payload: Record<string, unknown>;
  engine_version: string;
}

export interface SessionCreated extends SessionStateResponse {
  mission_id: string;
  scenario_id?: string;
}

export interface WaterAccounting {
  opening_reservoir: number;
  inflow: number;
  closing_reservoir: number;
  withdrawals_by_sector: Record<Sector, number>;
  leakage: number;
  overflow: number;
}

export interface DecisionResponse {
  session_id: string;
  turn: number;
  accepted: boolean;
  state: SimulationState;
  events: SimulationEvent[];
  water_accounting?: WaterAccounting | null;
  ai_feedback_status: string;
}

export interface HistoryEntry {
  turn: number;
  action: DecisionRequest | null;
  events: SimulationEvent[];
  state: SimulationState;
  state_hash: string | null;
  ai_feedback_status: string | null;
}

export interface HistoryResponse {
  session_id: string;
  entries: HistoryEntry[];
  limit: number;
  offset: number;
  total: number;
}

export interface MissionReport {
  session_id: string;
  mission_id: string;
  status: string;
  current_turn: number;
  outcomes: {
    reservoir_level: number;
    reservoir_capacity: number;
    budget_remaining: number;
    service_levels: Record<Sector, number>;
    unmet_demand_by_sector: Record<Sector, number>;
    crop_health: number;
    wellbeing: number;
  };
  decisions: DecisionRequest[];
  events: SimulationEvent[];
  assessment: Record<string, unknown> | null;
}

export interface CriterionFeedback {
  criterion_id: string;
  evidence: string;
  feedback: string;
}

export interface ReasoningAssessment {
  rubric_version: string;
  criteria: CriterionFeedback[];
  overall_feedback: string;
  referenced_facts: string[];
}

export interface Debrief {
  summary: string;
  trade_offs: string[];
  replay_suggestion: string;
  referenced_facts: string[];
  reasoning_assessment?: ReasoningAssessment;
}

export interface DebriefResponse {
  session_id: string;
  debrief: Debrief;
  source: "nvidia" | "fallback";
  ai_feedback_status: "available" | "ai_unavailable";
}

export interface StakeholderDialogue {
  actor_id: string;
  message: string;
  referenced_facts: string[];
  suggested_question: string;
}
