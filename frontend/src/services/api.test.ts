import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  apiFetch,
  createMobileJoinCode,
  getHealth,
  getSimulationHistory,
  submitDecision,
} from "./api";

vi.mock("./supabase", () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession: async () => ({
        data: { session: { access_token: "test-token" } },
      }),
    },
  }),
}));

vi.mock("./demo", () => ({
  isDemoMode: () => false,
  handleDemoRequest: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("api client", () => {
  it("sends the bearer token and an idempotency key on a decision", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        session_id: "s1",
        turn: 1,
        accepted: true,
        state: {},
        events: [],
        ai_feedback_status: "pending",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await submitDecision(
      "s1",
      {
        action_type: "market_plan",
        parameters: { plan_id: "steady" },
        expected_turn: 0,
      },
      "decision-key",
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/simulations/s1/decisions");
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer test-token");
    expect(headers.get("Idempotency-Key")).toBe("decision-key");
    expect(init?.body).toBe(
      JSON.stringify({
        action_type: "market_plan",
        parameters: { plan_id: "steady" },
        expected_turn: 0,
      }),
    );
  });

  it("surfaces FastAPI detail messages on failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockImplementation(async () =>
          response(
            { detail: "The simulation changed; fetch the latest state." },
            409,
          ),
        ),
    );

    await expect(apiFetch("/api/simulations/s1/state")).rejects.toMatchObject({
      name: "ApiError",
      status: 409,
      detail: "The simulation changed; fetch the latest state.",
    });
    await expect(apiFetch("/api/simulations/s1/state")).rejects.toBeInstanceOf(
      ApiError,
    );
  });

  it("encodes history paging and reads health without a session", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ status: "ok" }))
      .mockResolvedValueOnce(
        response({
          session_id: "s1",
          entries: [],
          limit: 100,
          offset: 0,
          total: 0,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getHealth()).resolves.toEqual({ status: "ok" });
    await getSimulationHistory("s 1", { limit: 100 });

    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/health");
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      "/api/simulations/s%201/history?limit=100",
    );
  });

  it("posts join-code assignments with the campus-scoped body", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        join_code: "ABCD-1234",
        expires_at: "2026-12-02T00:00:00Z",
        message: "Give this code to the learner.",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createMobileJoinCode("class-1", "student-1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/mobile/join-codes");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(
      JSON.stringify({ class_id: "class-1", student_id: "student-1" }),
    );
  });
});
