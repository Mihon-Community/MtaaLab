import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReplayPage } from "./ReplayPage";

afterEach(() => {
  vi.unstubAllGlobals();
});

function response(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function state(sessionId: string, reservoirLevel: number) {
  return {
    session_id: sessionId,
    turn: 2,
    status: "active",
    state: {
      current_turn: 2,
      reservoir_level: reservoirLevel,
      reservoir_capacity: 100,
      demand_by_sector: {
        households: 10,
        school: 5,
        clinic: 5,
        farms: 20,
      },
      leakage: 2,
      budget_remaining: 30,
      service_levels: {
        households: 0.9,
        school: 1,
        clinic: 1,
        farms: 0.7,
      },
      unmet_demand_by_sector: {
        households: 1,
        school: 0,
        clinic: 0,
        farms: 6,
      },
      crop_health: 75,
      wellbeing: 80,
      allocation_policy: "balanced",
      used_actions: [],
      pending_effects: [],
    },
  };
}

function report(sessionId: string) {
  return {
    session_id: sessionId,
    mission_id: "mission-1",
    status: "active",
    current_turn: 2,
    outcomes: {
      reservoir_level: 70,
      reservoir_capacity: 100,
      budget_remaining: 30,
      service_levels: {
        households: 0.9,
        school: 1,
        clinic: 1,
        farms: 0.7,
      },
      unmet_demand_by_sector: {
        households: 1,
        school: 0,
        clinic: 0,
        farms: 6,
      },
      crop_health: 75,
      wellbeing: 80,
    },
    decisions: [],
    events: [],
    assessment: null,
  };
}

describe("ReplayPage", () => {
  it("creates a separate replay and compares confirmed values", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.endsWith("/api/simulations/source-1/state")) {
          return response(state("source-1", 70));
        }
        if (url.endsWith("/api/simulations/source-1/report")) {
          return response(report("source-1"));
        }
        if (
          url.endsWith("/api/simulations/source-1/replay") &&
          init?.method === "POST"
        ) {
          return response({
            ...state("replay-1", 70),
            mission_id: "mission-1",
          });
        }
        if (url.includes("/api/simulations/source-1/history")) {
          return response({
            session_id: "source-1",
            entries: [
              {
                turn: 0,
                action: null,
                events: [],
                state: state("source-1", 70).state,
                state_hash: null,
                ai_feedback_status: null,
              },
            ],
            limit: 100,
            offset: 0,
            total: 1,
          });
        }
        if (url.includes("/api/simulations/replay-1/history")) {
          return response({
            session_id: "replay-1",
            entries: [],
            limit: 100,
            offset: 0,
            total: 0,
          });
        }
        if (url.endsWith("/api/simulations/replay-1/state")) {
          return response(state("replay-1", 82));
        }
        if (url.endsWith("/api/simulations/replay-1/report")) {
          return response(report("replay-1"));
        }
        throw new Error(`Unexpected API request: ${url}`);
      });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter initialEntries={["/replay?source_session_id=source-1"]}>
        <ReplayPage />
      </MemoryRouter>,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Start alternative run" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Run comparison" }),
    ).toBeInTheDocument();
    expect(screen.getByText("70 water units")).toBeInTheDocument();
    expect(screen.getByText("82 water units")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Continue the alternative run" }),
    ).toHaveAttribute(
      "href",
      "/simulation?session_id=replay-1&mission_id=mission-1&compare_session_id=source-1",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/simulations/source-1/replay"),
      expect.objectContaining({ method: "POST" }),
    );
  });
});
