import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SimulationState } from "../../types/api";
import { SimulationPage } from "./SimulationPage";

vi.mock("./WorldCanvas", () => ({
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

function state(turn: number, reservoirLevel: number): SimulationState {
  return {
    current_turn: turn,
    reservoir_level: reservoirLevel,
    reservoir_capacity: 100,
    demand_by_sector: { households: 20, school: 8, clinic: 6, farms: 15 },
    leakage: 4,
    budget_remaining: 75,
    service_levels: { households: 1, school: 1, clinic: 1, farms: 1 },
    unmet_demand_by_sector: { households: 0, school: 0, clinic: 0, farms: 0 },
    crop_health: 70,
    wellbeing: 70,
    allocation_policy: "balanced",
    used_actions: [],
    pending_effects: [],
  };
}

describe("SimulationPage", () => {
  it("submits a selected action and updates the HUD only from confirmed API state", async () => {
    let stateReadCount = 0;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.endsWith("/api/missions/mission-1")) {
          return response({
            id: "mission-1",
            title: "Mtoni water resilience",
            description: "Manage water across community needs.",
            subject: "Environmental science",
            grade_band: "7",
            scenario_version: 1,
            learning_objectives: ["Explain how water needs interact."],
            scenario_id: "mtoni",
            rules_version: "mtoni-rules-v1",
            turn_duration: { value: 1, unit: "week" },
            number_of_turns: 6,
            units: {
              water: "fictional water units",
              budget: "fictional budget credits",
            },
            action_catalogue: [
              {
                action_type: "repair_main_pipe",
                label: "Repair main leaking pipe",
                cost: 25,
                delay_turns: 0,
                one_time: true,
                parameters: {},
                effect: { type: "reduce_leakage", amount: 2 },
              },
            ],
            allocation_policies: [],
          });
        }

        if (url.endsWith("/api/simulations/session-1/history")) {
          return response({
            session_id: "session-1",
            entries: [
              {
                turn: 0,
                action: null,
                events: [],
                state: state(0, 60),
                state_hash: null,
                ai_feedback_status: null,
              },
            ],
            limit: 100,
            offset: 0,
            total: 1,
          });
        }

        if (
          url.endsWith("/api/simulations/session-1/decisions") &&
          init?.method === "POST"
        ) {
          return response(
            {
              session_id: "session-1",
              turn: 1,
              accepted: true,
              state: state(1, 62),
              events: [
                {
                  event_type: "weekly_water_report",
                  turn_number: 1,
                  payload: {
                    message: "The community reviews this week's use.",
                  },
                  engine_version: "mtoni-rules-v1",
                },
              ],
              water_accounting: {
                opening_reservoir: 60,
                inflow: 5,
                closing_reservoir: 62,
                withdrawals_by_sector: {
                  households: 0,
                  school: 0,
                  clinic: 0,
                  farms: 0,
                },
                leakage: 2,
                overflow: 0,
              },
              ai_feedback_status: "pending",
            },
            200,
          );
        }

        if (url.endsWith("/api/simulations/session-1/state")) {
          stateReadCount += 1;
          const turn = stateReadCount > 1 ? 1 : 0;
          return response({
            session_id: "session-1",
            turn,
            status: "active",
            state: state(turn, turn === 0 ? 60 : 62),
          });
        }

        throw new Error(`Unexpected API request: ${url}`);
      });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter
        initialEntries={[
          "/simulation?session_id=session-1&mission_id=mission-1",
        ]}
      >
        <Routes>
          <Route path="/simulation" element={<SimulationPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const reservoirMeter = await screen.findByRole("meter", {
      name: "Reservoir level",
    });
    expect(reservoirMeter).toHaveAttribute("value", "60");

    fireEvent.click(
      screen.getByRole("radio", { name: /Repair main leaking pipe/ }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm decision & advance" }),
    );

    await waitFor(() => {
      expect(reservoirMeter).toHaveAttribute("value", "62");
    });
    expect(
      await screen.findByText("The community reviews this week's use."),
    ).toBeInTheDocument();

    const decisionCall = fetchMock.mock.calls.find(([input]) =>
      String(input).endsWith("/api/simulations/session-1/decisions"),
    );
    expect(decisionCall).toBeDefined();
    expect(decisionCall?.[1]?.method).toBe("POST");
    expect(JSON.parse(String(decisionCall?.[1]?.body))).toEqual({
      action_type: "repair_main_pipe",
      parameters: {},
      expected_turn: 0,
    });
    expect(
      new Headers(decisionCall?.[1]?.headers).get("Idempotency-Key"),
    ).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
