/**
 * Local demo transport.
 *
 * Activated only when VITE_USE_MOCKS is explicitly enabled, so the UI can be
 * rehearsed before Supabase/FastAPI credentials exist. Every value returned
 * here is produced by the demo engine (a port of the FastAPI rules) and is
 * persisted in this browser only; it is never presented as server-confirmed
 * data in a production build.
 */
import type {
  DecisionRequest,
  DecisionResponse,
  Debrief,
  DebriefResponse,
  HistoryEntry,
  HistoryResponse,
  MissionDetail,
  MissionListItem,
  MissionReport,
  ReasoningAssessment,
  Sector,
  SessionCreatedResponse,
  SessionStateResponse,
  SimulationEvent,
  SimulationState,
  StakeholderDialogue,
  WaterAccounting,
} from "../../types/api";
import { calculateNextState, EngineValidationError } from "./engine";
import { MTONI_MISSION_ID, MTONI_SCENARIO } from "./scenario";

const STORAGE_KEY = "mtaalab:demo-store:v1";

interface StoredDecision {
  turn: number;
  action_type: string;
  parameters: Record<string, unknown>;
  idempotency_key: string;
  expected_turn: number;
}

interface DemoSession {
  session_id: string;
  mission_id: string;
  parent_session_id?: string;
  label?: string;
  turn: number;
  status: "active" | "completed";
  created_at: string;
  decisions: StoredDecision[];
  snapshots: SimulationState[];
  events_by_turn: Record<number, SimulationEvent[]>;
  accounting_by_turn: Record<number, WaterAccounting>;
  feedback: Record<number, StakeholderDialogue>;
  assessment: Record<string, unknown> | null;
}

interface DemoStore {
  sessions: Record<string, DemoSession>;
  session_keys: Record<string, string>;
  replay_keys: Record<string, string>;
}

export class DemoHttpError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(detail);
    this.name = "DemoHttpError";
  }
}

export interface DemoResponse {
  ok: boolean;
  status: number;
  body: unknown;
}

function emptyStore(): DemoStore {
  return { sessions: {}, session_keys: {}, replay_keys: {} };
}

export function loadStore(): DemoStore {
  if (typeof window === "undefined") return emptyStore();
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return emptyStore();
    const value: unknown = JSON.parse(stored);
    if (
      typeof value !== "object" ||
      value === null ||
      typeof (value as DemoStore).sessions !== "object" ||
      typeof (value as DemoStore).session_keys !== "object" ||
      typeof (value as DemoStore).replay_keys !== "object"
    ) {
      return emptyStore();
    }
    return value as DemoStore;
  } catch {
    return emptyStore();
  }
}

export function saveStore(store: DemoStore): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // A full or unavailable storage area only affects demo persistence.
  }
}

export function resetDemoStore(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `demo-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function missionListItem(): MissionListItem {
  return {
    id: MTONI_MISSION_ID,
    title: MTONI_SCENARIO.title,
    description: MTONI_SCENARIO.summary,
    subject: "Systems science",
    grade_band: "Grade 7",
    scenario_version: 1,
  };
}

function missionDetail(): MissionDetail {
  return {
    ...missionListItem(),
    learning_objectives: [...MTONI_SCENARIO.learning_objectives],
    scenario_id: MTONI_SCENARIO.scenario_id,
    rules_version: MTONI_SCENARIO.rules_version,
    turn_duration: { ...MTONI_SCENARIO.turn_duration },
    number_of_turns: MTONI_SCENARIO.number_of_turns,
    units: { ...MTONI_SCENARIO.units },
    action_catalogue: Object.entries(MTONI_SCENARIO.actions).map(
      ([actionType, definition]) => ({
        action_type: actionType,
        ...clone(definition),
      }),
    ),
    allocation_policies: Object.entries(MTONI_SCENARIO.allocation_policies).map(
      ([policyId, definition]) => ({
        policy_id: policyId,
        ...clone(definition),
      }),
    ),
  };
}

function createSession(
  store: DemoStore,
  missionId: string,
  idempotencyKey?: string,
  parentSessionId?: string,
  label?: string,
): SessionCreatedResponse {
  if (missionId !== MTONI_MISSION_ID) {
    throw new DemoHttpError(404, "Mission not found");
  }
  const keyScope = `${missionId}:${idempotencyKey ?? ""}`;
  if (idempotencyKey && store.session_keys[keyScope]) {
    const existing = store.sessions[store.session_keys[keyScope]];
    if (existing) return sessionCreatedResponse(existing);
  }
  if (parentSessionId) {
    const parent = store.sessions[parentSessionId];
    if (!parent) throw new DemoHttpError(404, "Resource not found");
    const replayScope = `${parentSessionId}:${idempotencyKey ?? ""}`;
    if (idempotencyKey && store.replay_keys[replayScope]) {
      const existing = store.sessions[store.replay_keys[replayScope]];
      if (existing) return sessionCreatedResponse(existing);
    }
    const child = buildSession(parent.mission_id, parentSessionId, label);
    store.sessions[child.session_id] = child;
    if (idempotencyKey) store.replay_keys[replayScope] = child.session_id;
    saveStore(store);
    return sessionCreatedResponse(child);
  }

  const session = buildSession(missionId, undefined, label);
  store.sessions[session.session_id] = session;
  if (idempotencyKey) store.session_keys[keyScope] = session.session_id;
  saveStore(store);
  return sessionCreatedResponse(session);
}

function buildSession(
  missionId: string,
  parentSessionId?: string,
  label?: string,
): DemoSession {
  const initialState = clone<SimulationState>(
    MTONI_SCENARIO.initial_state as unknown as SimulationState,
  );
  return {
    session_id: newId(),
    mission_id: missionId,
    parent_session_id: parentSessionId,
    label,
    turn: 0,
    status: "active",
    created_at: new Date().toISOString(),
    decisions: [],
    snapshots: [initialState],
    events_by_turn: {},
    accounting_by_turn: {},
    feedback: {},
    assessment: null,
  };
}

function sessionCreatedResponse(session: DemoSession): SessionCreatedResponse {
  return {
    session_id: session.session_id,
    mission_id: session.mission_id,
    turn: session.turn,
    status: session.status,
    state: clone(session.snapshots[session.snapshots.length - 1]),
  };
}

function requireSession(
  store: DemoStore,
  sessionId: string,
): DemoSession {
  const session = store.sessions[sessionId];
  if (!session) throw new DemoHttpError(404, "Resource not found");
  return session;
}

function historyEntries(session: DemoSession): HistoryEntry[] {
  return session.decisions.map((decision, index) => {
    const turn = index + 1;
    return {
      turn,
      action: {
        action_type: decision.action_type,
        parameters: clone(decision.parameters),
        expected_turn: decision.expected_turn,
      },
      events: clone(session.events_by_turn[turn] ?? []),
      state: clone(session.snapshots[turn]),
      state_hash: hashState(session.snapshots[turn]),
      ai_feedback_status: session.feedback[turn] ? "available" : "pending",
    };
  });
}

function hashState(state: SimulationState): string {
  const source = JSON.stringify(state);
  let hash = 5381;
  for (let index = 0; index < source.length; index += 1) {
    hash = ((hash << 5) + hash + source.charCodeAt(index)) | 0;
  }
  return `demo-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function buildFeedback(
  session: DemoSession,
  turn: number,
): StakeholderDialogue {
  if (session.feedback[turn]) return session.feedback[turn];
  const state = session.snapshots[turn];
  const actors = MTONI_SCENARIO.approved_actors;
  const actor = actors[(turn - 1) % actors.length];
  const waterUnit = MTONI_SCENARIO.units.water;
  const facts: string[] = [];
  let message = "";

  if (actor.actor_id === "clinic_nurse") {
    const service = Math.round(state.service_levels.clinic * 100);
    facts.push("service_levels.clinic", "critical_service_minimums.clinic");
    message =
      service >= 70
        ? `The clinic's confirmed service level this turn is ${service}%, which meets the mission's critical minimum. Which community need will you weigh next?`
        : `The clinic's confirmed service level this turn is ${service}%, below the mission's critical minimum. Essential care is under pressure. What would you protect?`;
  } else if (actor.actor_id === "farmer") {
    const service = Math.round(state.service_levels.farms * 100);
    facts.push("service_levels.farms", "crop_health");
    message = `Farm service is ${service}% this turn and crop health is ${Math.round(state.crop_health)}%. Irrigation and other needs are competing for the same water.`;
  } else {
    const service = Math.round(state.service_levels.school * 100);
    facts.push("service_levels.school", "critical_service_minimums.school");
    message = `The school's confirmed service level this turn is ${service}%. Learners notice when water is unreliable. What evidence will you use for your next choice?`;
  }

  const dialogue: StakeholderDialogue = {
    actor_id: actor.actor_id,
    message: `${message} (Confidential scenario values: ${waterUnit}.)`,
    referenced_facts: facts,
    suggested_question: "Which trade-off matters most to your community plan?",
  };
  session.feedback[turn] = dialogue;
  return dialogue;
}

function reportFor(session: DemoSession): MissionReport {
  const state = session.snapshots[session.snapshots.length - 1];
  return {
    session_id: session.session_id,
    mission_id: session.mission_id,
    status: session.status,
    current_turn: session.turn,
    outcomes: {
      reservoir_level: state.reservoir_level,
      reservoir_capacity: state.reservoir_capacity,
      budget_remaining: state.budget_remaining,
      service_levels: clone(state.service_levels),
      unmet_demand_by_sector: clone(state.unmet_demand_by_sector),
      crop_health: state.crop_health,
      wellbeing: state.wellbeing,
    },
    decisions: session.decisions.map((decision) => ({
      action_type: decision.action_type,
      parameters: clone(decision.parameters),
      expected_turn: decision.expected_turn,
    })),
    events: session.decisions.flatMap((_decision, index) =>
      clone(session.events_by_turn[index + 1] ?? []),
    ),
    assessment: session.assessment ? clone(session.assessment) : null,
  };
}

function debriefFor(
  store: DemoStore,
  session: DemoSession,
  explanation?: string,
): DebriefResponse {
  const entries = historyEntries(session);
  const finalState = session.snapshots[session.snapshots.length - 1];
  const unmet = (Object.entries(finalState.unmet_demand_by_sector) as [
    Sector,
    number,
  ][]).filter(([, amount]) => amount > 0);

  const tradeOffs = unmet.map(
    ([sector, amount]) =>
      `${label(sector)} still had ${amount} fictional water units of unmet demand at the end of the run.`,
  );
  if (finalState.reservoir_level > 0) {
    tradeOffs.push(
      `${finalState.reservoir_level} fictional water units remained stored, so earlier conservation could have helped another sector.`,
    );
  }

  const debrief: Debrief = {
    summary: `The saved run recorded ${entries.length} completed turns. The final reservoir held ${finalState.reservoir_level} of ${finalState.reservoir_capacity} fictional water units, with ${finalState.budget_remaining} budget credits unspent.`,
    trade_offs: tradeOffs,
    replay_suggestion:
      "Replay the mission from the same initial state and try a different allocation policy to compare the recorded outcomes.",
    referenced_facts: [
      "reservoir_level",
      "budget_remaining",
      "unmet_demand_by_sector",
      "recorded_decisions",
    ],
  };

  if (explanation && session.status === "completed") {
    const assessment: ReasoningAssessment = {
      rubric_version: "mtoni-reasoning-v1",
      criteria: [
        {
          criterion_id: "evidence_use",
          evidence: `${entries.length} recorded turns were available to the explanation.`,
          feedback:
            explanation.length > 40
              ? "Your explanation engaged with the recorded run."
              : "Add the specific decision or indicator you used as evidence.",
        },
        {
          criterion_id: "tradeoff_reasoning",
          evidence: unmet.length
            ? `Unmet demand remained in ${unmet.map(([sector]) => label(sector)).join(", ")}.`
            : "No sector ended the run with unmet demand.",
          feedback:
            "Compare at least two sectors when you explain an allocation choice.",
        },
      ],
      overall_feedback:
        "Reflect on the recorded evidence, then replay the mission to test a different plan.",
      referenced_facts: ["recorded_decisions", "final_state"],
    };
    debrief.reasoning_assessment = assessment;
    session.assessment = clone(
      assessment,
    ) as unknown as Record<string, unknown>;
    saveStore(store);
  }

  return {
    session_id: session.session_id,
    debrief,
    source: "fallback",
    ai_feedback_status: "available",
  };
}

function label(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function parseBody(init: RequestInit): Record<string, unknown> {
  if (typeof init.body !== "string") return {};
  try {
    const parsed: unknown = JSON.parse(init.body);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function headerValue(init: RequestInit, name: string): string | null {
  const headers = new Headers(init.headers);
  return headers.get(name);
}

export async function handleDemoRequest(
  path: string,
  init: RequestInit = {},
): Promise<DemoResponse> {
  const method = (init.method ?? "GET").toUpperCase();
  const query = path.includes("?") ? path.slice(path.indexOf("?") + 1) : "";
  const pathname = path.includes("?") ? path.slice(0, path.indexOf("?")) : path;
  const params = new URLSearchParams(query);
  const store = loadStore();

  try {
    if (method === "GET" && pathname === "/api/missions") {
      return json(200, { missions: [missionListItem()] });
    }

    const missionMatch = pathname.match(/^\/api\/missions\/([^/]+)$/);
    if (method === "GET" && missionMatch) {
      const missionId = decodeURIComponent(missionMatch[1]);
      if (missionId !== MTONI_MISSION_ID) {
        throw new DemoHttpError(404, "Mission not found");
      }
      return json(200, missionDetail());
    }

    if (method === "POST" && pathname === "/api/simulations") {
      const body = parseBody(init);
      const session = createSession(
        store,
        String(body.mission_id ?? ""),
        headerValue(init, "Idempotency-Key") ?? undefined,
      );
      return json(201, session);
    }

    const sessionMatch = pathname.match(
      /^\/api\/simulations\/([^/]+)\/(state|history|decisions|replay|debrief|report)$/,
    );
    if (sessionMatch) {
      const sessionId = decodeURIComponent(sessionMatch[1]);
      const action = sessionMatch[2];
      const session = requireSession(store, sessionId);

      if (method === "GET" && action === "state") {
        const response: SessionStateResponse = {
          session_id: session.session_id,
          turn: session.turn,
          status: session.status,
          state: clone(session.snapshots[session.snapshots.length - 1]),
        };
        return json(200, response);
      }

      if (method === "GET" && action === "history") {
        const all = historyEntries(session);
        const limit = Number(params.get("limit") ?? 50);
        const offset = Number(params.get("offset") ?? 0);
        const page = all.slice(offset, offset + limit);
        const response: HistoryResponse = {
          session_id: session.session_id,
          entries: page,
          limit,
          offset,
          total: all.length,
        };
        saveStore(store);
        return json(200, response);
      }

      if (method === "GET" && action === "report") {
        return json(200, reportFor(session));
      }

      if (method === "POST" && action === "replay") {
        const body = parseBody(init);
        const created = createSession(
          store,
          session.mission_id,
          headerValue(init, "Idempotency-Key") ?? undefined,
          session.session_id,
          typeof body.label === "string" ? body.label : "Alternative plan",
        );
        return json(201, { ...created, parent_session_id: session.session_id });
      }

      if (method === "POST" && action === "debrief") {
        const body = parseBody(init);
        const explanation =
          typeof body.student_explanation === "string"
            ? body.student_explanation
            : undefined;
        if (explanation && session.status !== "completed") {
          throw new DemoHttpError(
            409,
            "Reasoning assessment is available after mission completion",
          );
        }
        return json(200, debriefFor(store, session, explanation));
      }

      if (method === "POST" && action === "decisions") {
        const key = headerValue(init, "Idempotency-Key");
        if (!key) throw new DemoHttpError(400, "Idempotency-Key is required");

        const duplicate = session.decisions.find(
          (decision) => decision.idempotency_key === key,
        );
        if (duplicate) {
          const response: DecisionResponse = {
            session_id: session.session_id,
            turn: duplicate.turn,
            accepted: true,
            state: clone(session.snapshots[duplicate.turn]),
            events: clone(session.events_by_turn[duplicate.turn] ?? []),
            water_accounting: clone(
              session.accounting_by_turn[duplicate.turn],
            ) as WaterAccounting,
            ai_feedback_status: session.feedback[duplicate.turn]
              ? "available"
              : "pending",
          };
          return json(200, response);
        }

        const body = parseBody(init);
        const decision: DecisionRequest = {
          action_type: String(body.action_type ?? ""),
          parameters:
            typeof body.parameters === "object" && body.parameters !== null
              ? (body.parameters as Record<string, unknown>)
              : {},
          expected_turn: Number(body.expected_turn ?? -1),
        };

        if (decision.expected_turn !== session.turn) {
          throw new DemoHttpError(
            409,
            "The simulation changed; fetch the latest confirmed state and retry.",
          );
        }
        if (session.status !== "active") {
          throw new DemoHttpError(
            409,
            "The simulation changed; fetch the latest confirmed state and retry.",
          );
        }

        const result = calculateNextState(session.snapshots[session.turn], decision);
        session.decisions.push({
          turn: result.turn,
          action_type: decision.action_type,
          parameters: clone(decision.parameters),
          idempotency_key: key,
          expected_turn: decision.expected_turn,
        });
        session.snapshots.push(clone(result.state));
        session.events_by_turn[result.turn] = clone(result.events);
        session.accounting_by_turn[result.turn] = clone(
          result.water_accounting,
        ) as WaterAccounting;
        session.turn = result.turn;
        if (result.turn >= MTONI_SCENARIO.number_of_turns) {
          session.status = "completed";
        }
        buildFeedback(session, result.turn);
        saveStore(store);

        const response: DecisionResponse = {
          session_id: session.session_id,
          turn: result.turn,
          accepted: true,
          state: clone(result.state),
          events: clone(result.events),
          water_accounting: result.water_accounting as WaterAccounting,
          ai_feedback_status: "pending",
        };
        return json(200, response);
      }
    }

    throw new DemoHttpError(404, "Resource not found");
  } catch (error) {
    if (error instanceof DemoHttpError) {
      return { ok: false, status: error.status, body: { detail: error.detail } };
    }
    if (error instanceof EngineValidationError) {
      return {
        ok: false,
        status: 400,
        body: { detail: "The requested simulation action is invalid." },
      };
    }
    return {
      ok: false,
      status: 500,
      body: { detail: "The request could not be completed." },
    };
  }
}

function json(status: number, body: unknown): DemoResponse {
  return { ok: true, status, body };
}
