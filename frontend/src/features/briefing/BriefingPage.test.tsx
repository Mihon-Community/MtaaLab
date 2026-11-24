import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BriefingPage } from "./BriefingPage";
import { SimulationPage } from "../simulation/SimulationPage";

vi.mock("../simulation/WorldCanvas", () => ({
  WorldCanvas: () => <div aria-label="Mtoni map" role="img" />,
}));

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("mission start flow", () => {
  it("retries session creation with the same idempotency key and shows confirmed state", async () => {
    const missionId = "9f8e7d6c-5b4a-3928-1706-f5e4d3c2b1a0";
    let createAttempts = 0;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.endsWith("/api/missions/" + missionId)) {
          return response({
            id: missionId,
            title: "Keep the water flowing",
            description: "Balance water needs across the community.",
            subject: "Environmental science",
            grade_band: "7–9",
            scenario_version: 1,
            learning_objectives: ["Compare community water needs."],
            scenario_id: "mtoni",
            rules_version: "mtoni-rules-v1",
            turn_duration: { value: 1, unit: "week" },
            number_of_turns: 6,
            units: {
              water: "fictional water units",
              budget: "fictional budget credits",
            },
            action_catalogue: [],
            allocation_policies: [],
          });
        }

        if (url.endsWith("/api/simulations") && init?.method === "POST") {
          createAttempts += 1;
          if (createAttempts === 1) throw new Error("network interrupted");
          return response(
            {
              session_id: "session-1",
              mission_id: missionId,
              turn: 0,
              status: "active",
              state: {},
            },
            201,
          );
        }

        if (url.endsWith("/api/simulations/session-1/state")) {
          return response({
            session_id: "session-1",
            turn: 0,
            status: "active",
            state: {
              current_turn: 0,
              reservoir_level: 80,
              reservoir_capacity: 100,
              demand_by_sector: {
                households: 20,
                school: 10,
                clinic: 8,
                farms: 25,
              },
              leakage: 2,
              budget_remaining: 50,
              service_levels: {
                households: 0.8,
                school: 1,
                clinic: 0.9,
                farms: 0.6,
              },
              unmet_demand_by_sector: {
                households: 0,
                school: 0,
                clinic: 0,
                farms: 0,
              },
              crop_health: 75,
              wellbeing: 82,
              allocation_policy: "balanced",
              used_actions: [],
              pending_effects: [],
            },
          });
        }

        if (url.endsWith("/api/simulations/session-1/history")) {
          return response({
            session_id: "session-1",
            entries: [],
            limit: 100,
            offset: 0,
            total: 0,
          });
        }

        throw new Error(`Unexpected API request: ${url}`);
      });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter initialEntries={[`/briefing?mission_id=${missionId}`]}>
        <Routes>
          <Route path="/briefing" element={<BriefingPage />} />
          <Route path="/simulation" element={<SimulationPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Begin mission" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Retry starting mission" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Keep the water flowing" }),
    ).toBeInTheDocument();
    expect(
      await screen.findAllByText("80 / 100 fictional water units"),
    ).toHaveLength(2);
    expect(
      screen.getByRole("region", {
        name: "Community and environmental indicators",
      }),
    ).toHaveTextContent("82%");

    const createCalls = fetchMock.mock.calls.filter(
      ([input, init]) =>
        String(input).endsWith("/api/simulations") && init?.method === "POST",
    );
    expect(createCalls).toHaveLength(2);
    const firstKey = new Headers(createCalls[0][1]?.headers).get(
      "Idempotency-Key",
    );
    const retryKey = new Headers(createCalls[1][1]?.headers).get(
      "Idempotency-Key",
    );
    expect(firstKey).toMatch(/^[0-9a-f-]{36}$/i);
    expect(retryKey).toBe(firstKey);
    expect(createCalls[0][1]?.body).toBe(
      JSON.stringify({ mission_id: missionId }),
    );
  });
});
