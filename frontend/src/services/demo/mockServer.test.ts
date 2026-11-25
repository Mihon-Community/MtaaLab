import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  handleDemoRequest,
  resetDemoStore,
  type DemoResponse,
} from "./mockServer";
import { MTONI_MISSION_ID } from "./scenario";

/** Narrow an unknown JSON value to a plain object so tests stay type-safe. */
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    throw new Error("Expected an object response body");
  }
  return value as Record<string, unknown>;
}

function post(
  path: string,
  body: unknown,
  idempotencyKey?: string,
): Promise<DemoResponse> {
  return handleDemoRequest(path, {
    method: "POST",
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
    body: JSON.stringify(body),
  });
}

function get(path: string): Promise<DemoResponse> {
  return handleDemoRequest(path);
}

async function createSession(): Promise<string> {
  const created = await post("/api/simulations", {
    mission_id: MTONI_MISSION_ID,
  });
  expect(created.status).toBe(201);
  return record(created.body).session_id as string;
}

beforeEach(() => {
  window.localStorage.clear();
  resetDemoStore();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("demo transport", () => {
  it("requires an idempotency key for decisions", async () => {
    const sessionId = await createSession();

    const rejected = await post(`/api/simulations/${sessionId}/decisions`, {
      action_type: "repair_main_pipe",
      parameters: {},
      expected_turn: 0,
    });
    expect(rejected.status).toBe(400);
  });

  it("commits one turn per idempotency key and replays duplicates", async () => {
    const sessionId = await createSession();

    const decision = {
      action_type: "repair_main_pipe",
      parameters: {},
      expected_turn: 0,
    };
    const first = await post(
      `/api/simulations/${sessionId}/decisions`,
      decision,
      "key-1",
    );
    expect(first.status).toBe(200);
    expect(record(first.body).turn).toBe(1);
    expect(record(record(first.body).water_accounting).closing_reservoir).toBe(
      14,
    );

    const replay = await post(
      `/api/simulations/${sessionId}/decisions`,
      decision,
      "key-1",
    );
    expect(replay.status).toBe(200);
    expect(record(replay.body).turn).toBe(1);

    const history = await get(`/api/simulations/${sessionId}/history`);
    const entries = record(history.body).entries as Array<
      Record<string, unknown>
    >;
    expect(record(history.body).total).toBe(1);
    expect(record(entries[0].state).reservoir_level).toBe(14);
  });

  it("rejects a stale expected_turn with a conflict", async () => {
    const sessionId = await createSession();

    const stale = await post(
      `/api/simulations/${sessionId}/decisions`,
      {
        action_type: "repair_main_pipe",
        parameters: {},
        expected_turn: 3,
      },
      "key-stale",
    );
    expect(stale.status).toBe(409);
  });

  it("does not assess reasoning before the mission completes", async () => {
    const sessionId = await createSession();

    const debrief = await post(
      `/api/simulations/${sessionId}/debrief`,
      { student_explanation: "I balanced every sector carefully." },
      "key-debrief",
    );
    expect(debrief.status).toBe(409);
  });

  it("replays the source scenario from its immutable initial state", async () => {
    const sessionId = await createSession();
    await post(
      `/api/simulations/${sessionId}/decisions`,
      {
        action_type: "install_storage",
        parameters: { capacity_increase: 20 },
        expected_turn: 0,
      },
      "key-storage",
    );

    const replay = await post(
      `/api/simulations/${sessionId}/replay`,
      { label: "Alternative plan" },
      "key-replay",
    );
    expect(replay.status).toBe(201);
    expect(record(replay.body).parent_session_id).toBe(sessionId);
    expect(record(replay.body).turn).toBe(0);
    expect(record(record(replay.body).state).reservoir_level).toBe(60);
    expect(record(record(replay.body).state).used_actions).toEqual([]);
  });
});
