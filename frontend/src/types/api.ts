/** Mirrors backend/app/api/schemas.py; keep changes reviewed by both developers. */
export interface DecisionRequest {
  action_type: string;
  parameters: Record<string, unknown>;
  expected_turn: number;
}
export interface SimulationState {
  reservoir_level: number;
  budget_remaining: number;
}
export interface DecisionResponse {
  session_id: string;
  turn: number;
  accepted: boolean;
  state: SimulationState;
  events: unknown[];
  ai_feedback_status: string;
}
export interface StakeholderDialogue {
  actor_id: string;
  message: string;
  referenced_facts: string[];
  suggested_question: string;
}
