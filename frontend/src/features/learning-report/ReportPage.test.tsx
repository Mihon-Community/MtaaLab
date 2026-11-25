import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportPage } from "./ReportPage";

afterEach(() => {
  vi.unstubAllGlobals();
});

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ReportPage", () => {
  it("shows persisted outcomes and requests an evidence-grounded debrief", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.endsWith("/api/simulations/session-1/report")) {
          return response({
            session_id: "session-1",
            mission_id: "mission-1",
            status: "completed",
            current_turn: 6,
            outcomes: {
              reservoir_level: 70,
              reservoir_capacity: 100,
              budget_remaining: 35,
              service_levels: {
                households: 0.9,
                school: 1,
                clinic: 0.95,
                farms: 0.6,
              },
              unmet_demand_by_sector: {
                households: 2,
                school: 0,
                clinic: 0,
                farms: 6,
              },
              crop_health: 72,
              wellbeing: 81,
            },
            decisions: [],
            events: [],
            assessment: null,
          });
        }

        if (url.endsWith("/api/missions/mission-1")) {
          return response({
            id: "mission-1",
            title: "Mtoni water resilience",
            description: "Manage water across community needs.",
            subject: "Environmental science",
            grade_band: "7",
            scenario_version: 1,
            learning_objectives: [
              "Compare allocation trade-offs using recorded evidence.",
            ],
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

        if (url.includes("/api/simulations/session-1/history")) {
          return response({
            session_id: "session-1",
            entries: [],
            limit: 100,
            offset: 0,
            total: 0,
          });
        }

        if (
          url.endsWith("/api/simulations/session-1/debrief") &&
          init?.method === "POST"
        ) {
          return response({
            session_id: "session-1",
            source: "fallback",
            ai_feedback_status: "ai_unavailable",
            debrief: {
              summary: "Six confirmed turns were recorded for this run.",
              trade_offs: ["Review how your choices affected farm service."],
              replay_suggestion:
                "Try a different allocation policy in a replay.",
              referenced_facts: ["entries.5.state.service_levels.farms"],
            },
          });
        }

        throw new Error(`Unexpected API request: ${url}`);
      });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter initialEntries={["/report?session_id=session-1"]}>
        <ReportPage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "What changed" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("70 / 100 fictional water units"),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Generate learning debrief" }),
    );

    expect(
      await screen.findByText(
        "Six confirmed turns were recorded for this run.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /AI is unavailable; this feedback uses validated saved facts only/,
      ),
    ).toBeInTheDocument();
    const debriefCall = fetchMock.mock.calls.find(([input]) =>
      String(input).endsWith("/api/simulations/session-1/debrief"),
    );
    expect(debriefCall?.[1]?.method).toBe("POST");
  });
});
