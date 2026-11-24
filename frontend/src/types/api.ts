/** Mirrors backend/app/api/schemas.py; keep changes reviewed by both developers. */
export interface DecisionRequest {
  action_type: string;
  parameters: Record<string, unknown>;
  expected_turn: number;
}
export interface SimulationState {
  reservoir_level: number;
  budget_remaining: number;
  current_turn?: number;
  [key: string]: unknown;
}
export interface MissionListItem {
  id: string;
  title: string;
  description: string;
  subject: string;
  grade_band: string;
  scenario_version: number;
  recommended: boolean;
  recommendation_reason: string | null;
  last_session_id: string | null;
  last_session_status: string | null;
  current_turn: number;
}
export interface MissionListResponse {
  missions: MissionListItem[];
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
export interface MissionDetail extends MissionListItem {
  learning_objectives: string[];
  scenario_id: string;
  rules_version: string;
  turn_duration: Record<string, unknown>;
  number_of_turns: number;
  units: Record<string, string>;
  action_catalogue: Array<Record<string, unknown>>;
  allocation_policies: Array<Record<string, unknown>>;
  plans: Record<
    string,
    { label: string; order_quantity: number; price: number }
  >;
  reflection_choices: Record<string, { tag: string; label: string }>;
  hint_ladder: Record<string, string[]>;
}
export interface SessionCreated {
  session_id: string;
  mission_id: string;
  scenario_id: string;
  turn: number;
  status: string;
  state: Record<string, unknown>;
}
export interface DecisionResponse {
  session_id: string;
  turn: number;
  accepted: boolean;
  state: Record<string, unknown>;
  events: Array<{
    event_type: string;
    turn_number: number;
    payload: Record<string, unknown>;
  }>;
  water_accounting?: Record<string, unknown> | null;
  ai_feedback_status: string;
}
export interface StakeholderDialogue {
  actor_id: string;
  message: string;
  referenced_facts: string[];
  suggested_question: string;
}
