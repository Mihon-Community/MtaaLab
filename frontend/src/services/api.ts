import { getSupabaseClient } from "./supabase";
import { handleDemoRequest, isDemoMode } from "./demo";
import type {
  DecisionRequest,
  DecisionResponse,
  DebriefResponse,
  HealthResponse,
  HistoryResponse,
  MissionDetail,
  MissionListResponse,
  MissionReport,
  MobileJoinCodeResponse,
  MobileRosterResponse,
  ReflectionRequest,
  ReflectionResponse,
  ReflectionStatusResponse,
  ReplayResponse,
  SessionCreatedResponse,
  SessionStateResponse,
  SimulationState,
} from "../types/api";

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function readErrorDetail(
  response: Response,
): Promise<string | undefined> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && "detail" in body) {
      const detail = (body as { detail?: unknown }).detail;
      if (typeof detail === "string") return detail;
    }
  } catch {
    // Some failures (proxies, 502 pages) are not JSON; keep the status message.
  }
  return undefined;
}

/**
 * Typed API fetch wrapper; it never treats an unconfirmed write as accepted.
 * Errors carry the FastAPI `detail` message when the backend supplies one.
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  idempotencyKey?: string,
): Promise<T> {
  if (isDemoMode()) {
    const demoHeaders = new Headers(init.headers);
    if (idempotencyKey) demoHeaders.set("Idempotency-Key", idempotencyKey);
    const demo = await handleDemoRequest(path, {
      ...init,
      headers: demoHeaders,
    });
    if (!demo.ok) {
      const detail =
        typeof demo.body === "object" &&
        demo.body !== null &&
        "detail" in demo.body
          ? String((demo.body as { detail: unknown }).detail)
          : undefined;
      throw new ApiError(
        `API request failed (${demo.status})`,
        demo.status,
        detail,
      );
    }
    return demo.body as T;
  }

  const { data } = (await getSupabaseClient()?.auth.getSession()) ?? {
    data: { session: null },
  };
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (data.session?.access_token)
    headers.set("Authorization", `Bearer ${data.session.access_token}`);
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new ApiError(
      detail
        ? `API request failed (${response.status}): ${detail}`
        : `API request failed (${response.status})`,
      response.status,
      detail,
    );
  }
  return response.json() as Promise<T>;
}

export function getHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>("/api/health");
}

export function getMissions(): Promise<MissionListResponse> {
  return apiFetch<MissionListResponse>("/api/missions");
}

export function getMission(missionId: string): Promise<MissionDetail> {
  return apiFetch<MissionDetail>(
    `/api/missions/${encodeURIComponent(missionId)}`,
  );
}

export function createSimulation(
  missionId: string,
  idempotencyKey: string,
): Promise<SessionCreatedResponse> {
  return apiFetch<SessionCreatedResponse>(
    "/api/simulations",
    {
      method: "POST",
      body: JSON.stringify({ mission_id: missionId }),
    },
    idempotencyKey,
  );
}

export function getSimulationState<S = SimulationState>(
  sessionId: string,
): Promise<SessionStateResponse<S>> {
  return apiFetch<SessionStateResponse<S>>(
    `/api/simulations/${encodeURIComponent(sessionId)}/state`,
  );
}

export function getSimulationHistory<S = SimulationState>(
  sessionId: string,
  options: { limit?: number; offset?: number } = {},
): Promise<HistoryResponse<S>> {
  const query = new URLSearchParams();
  query.set("limit", String(options.limit ?? 50));
  if (options.offset !== undefined) query.set("offset", String(options.offset));
  return apiFetch<HistoryResponse<S>>(
    `/api/simulations/${encodeURIComponent(sessionId)}/history?${query.toString()}`,
  );
}

export function submitDecision<S = SimulationState>(
  sessionId: string,
  decision: DecisionRequest,
  idempotencyKey: string,
): Promise<DecisionResponse<S>> {
  return apiFetch<DecisionResponse<S>>(
    `/api/simulations/${encodeURIComponent(sessionId)}/decisions`,
    {
      method: "POST",
      body: JSON.stringify(decision),
    },
    idempotencyKey,
  );
}

/**
 * `POST /api/simulations/{id}/advance` is intentionally not wrapped: the API
 * always returns 409 because a decision advances the simulation.
 */

export function getSimulationReport<S = Record<string, unknown>>(
  sessionId: string,
): Promise<MissionReport<S>> {
  return apiFetch<MissionReport<S>>(
    `/api/simulations/${encodeURIComponent(sessionId)}/report`,
  );
}

export function getSimulationDebrief(
  sessionId: string,
  studentExplanation?: string,
): Promise<DebriefResponse> {
  return apiFetch<DebriefResponse>(
    `/api/simulations/${encodeURIComponent(sessionId)}/debrief`,
    {
      method: "POST",
      body: JSON.stringify(
        studentExplanation ? { student_explanation: studentExplanation } : {},
      ),
    },
  );
}

export function createReplay(
  sessionId: string,
  idempotencyKey: string,
  label?: string,
): Promise<ReplayResponse> {
  return apiFetch<ReplayResponse>(
    `/api/simulations/${encodeURIComponent(sessionId)}/replay`,
    {
      method: "POST",
      body: JSON.stringify(label ? { label } : {}),
    },
    idempotencyKey,
  );
}

export function getReflection(
  sessionId: string,
  turnNumber: number,
): Promise<ReflectionStatusResponse> {
  return apiFetch<ReflectionStatusResponse>(
    `/api/simulations/${encodeURIComponent(sessionId)}/reflections/${turnNumber}`,
  );
}

export function saveReflection(
  sessionId: string,
  reflection: ReflectionRequest,
  idempotencyKey?: string,
): Promise<ReflectionResponse> {
  return apiFetch<ReflectionResponse>(
    `/api/simulations/${encodeURIComponent(sessionId)}/reflections`,
    {
      method: "POST",
      body: JSON.stringify(reflection),
    },
    idempotencyKey,
  );
}

export function getMobileRoster(): Promise<MobileRosterResponse> {
  return apiFetch<MobileRosterResponse>("/api/mobile/classes");
}

export function createMobileJoinCode(
  classId: string,
  studentId: string,
): Promise<MobileJoinCodeResponse> {
  return apiFetch<MobileJoinCodeResponse>("/api/mobile/join-codes", {
    method: "POST",
    body: JSON.stringify({ class_id: classId, student_id: studentId }),
  });
}
