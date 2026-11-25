import { getSupabaseClient } from "./supabase";
import { handleDemoRequest, isDemoMode } from "./demo";
import type {
  DecisionRequest,
  DecisionResponse,
  DebriefResponse,
  HistoryResponse,
  MissionDetail,
  MissionListResponse,
  MissionReport,
  SessionCreatedResponse,
  SessionStateResponse,
} from "../types/api";

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Typed API fetch wrapper; it never treats an unconfirmed write as accepted. */
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
    if (!demo.ok)
      throw new ApiError(`API request failed (${demo.status})`, demo.status);
    return demo.body as Promise<T>;
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
  if (!response.ok)
    throw new ApiError(
      `API request failed (${response.status})`,
      response.status,
    );
  return response.json() as Promise<T>;
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

export function getSimulationState(
  sessionId: string,
): Promise<SessionStateResponse> {
  return apiFetch<SessionStateResponse>(
    `/api/simulations/${encodeURIComponent(sessionId)}/state`,
  );
}

export function getSimulationHistory(
  sessionId: string,
): Promise<HistoryResponse> {
  return apiFetch<HistoryResponse>(
    `/api/simulations/${encodeURIComponent(sessionId)}/history`,
  );
}

export function submitDecision(
  sessionId: string,
  decision: DecisionRequest,
  idempotencyKey: string,
): Promise<DecisionResponse> {
  return apiFetch<DecisionResponse>(
    `/api/simulations/${encodeURIComponent(sessionId)}/decisions`,
    {
      method: "POST",
      body: JSON.stringify(decision),
    },
    idempotencyKey,
  );
}

export function getSimulationReport(sessionId: string): Promise<MissionReport> {
  return apiFetch<MissionReport>(
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
): Promise<SessionCreatedResponse> {
  return apiFetch<SessionCreatedResponse>(
    `/api/simulations/${encodeURIComponent(sessionId)}/replay`,
    {
      method: "POST",
      body: JSON.stringify({ label: "Alternative plan" }),
    },
    idempotencyKey,
  );
}
