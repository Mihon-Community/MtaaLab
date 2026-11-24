import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TeacherPage } from "./TeacherPage";

afterEach(() => {
  vi.unstubAllGlobals();
});

function response(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("TeacherPage", () => {
  it("lists assigned missions and displays an authorized session report", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.endsWith("/api/missions")) {
          return response({
            missions: [
              {
                id: "mission-1",
                title: "Mtoni water resilience",
                description: "Manage water across community needs.",
                subject: "Environmental science",
                grade_band: "7",
                scenario_version: 1,
              },
            ],
          });
        }
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
        throw new Error(`Unexpected API request: ${url}`);
      });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter>
        <TeacherPage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Mtoni water resilience" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/does not expose an endpoint to create or edit/),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Simulation session ID"), {
      target: { value: "session-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Inspect report" }));

    expect(
      await screen.findByRole("heading", { name: "Completed · Turn 6" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "These are recorded simulation values and formative evidence, not a student grade.",
      ),
    ).toBeInTheDocument();
  });
});
