import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MissionDetail } from "../../types/api";
import { PortfolioRunPage } from "./PortfolioRunPage";

vi.mock("../../services/supabase", () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession: async () => ({
        data: { session: { access_token: "test-token" } },
      }),
    },
  }),
}));

vi.mock("../../services/demo", () => ({
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

const mission: MissionDetail = {
  id: "m1",
  title: "Mama Mboga Market",
  description: "Run a fictional market stall across six market days.",
  subject: "Business studies",
  grade_band: "Teacher assigned",
  scenario_version: 1,
  learning_objectives: ["Explain how price, demand and stock interact."],
  scenario_id: "soko_market",
  rules_version: "soko-market-v1",
  turn_duration: { value: 1, unit: "market day" },
  number_of_turns: 6,
  units: { cash: "fictional credits", stock: "fictional units" },
  action_catalogue: [
    {
      action_type: "market_plan",
      label: "Choose a market plan",
      choices: [
        { id: "value", label: "Value" },
        { id: "steady", label: "Steady" },
      ],
    },
  ],
  allocation_policies: [],
  reflection_choices: {
    "1": { tag: "over-order", label: "I ordered too much" },
    "2": { tag: "price-demand", label: "Price changed demand" },
    "3": { tag: "hint-requested", label: "I need a hint" },
  },
  hint_ladder: { en: ["Compare stock with expected demand."] },
};

const initialState = {
  current_turn: 0,
  cash_credits: 100,
  stock_units: 10,
  selling_price: 8,
  total_sold: 0,
  total_spoiled: 0,
  completed_actions: [],
};

const nextState = {
  ...initialState,
  current_turn: 1,
  cash_credits: 92,
  stock_units: 5,
  total_sold: 8,
  total_spoiled: 1,
};

describe("PortfolioRunPage", () => {
  it("submits one confirmed decision, then requires a reflection before the next turn", async () => {
    let stateReads = 0;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (method === "GET" && url.endsWith("/api/missions/m1")) {
          return response(mission);
        }
        if (method === "GET" && url.includes("/api/simulations/s1/state")) {
          stateReads += 1;
          return response({
            session_id: "s1",
            turn: stateReads === 1 ? 0 : 1,
            status: "active",
            scenario_id: "soko_market",
            state: stateReads === 1 ? initialState : nextState,
          });
        }
        if (method === "POST" && url.includes("/decisions")) {
          return response({
            session_id: "s1",
            turn: 1,
            accepted: true,
            state: nextState,
            events: [],
            ai_feedback_status: "pending",
          });
        }
        if (method === "POST" && url.includes("/reflections")) {
          return response({
            session_id: "s1",
            turn_number: 1,
            answer_code: "1",
            misconception_tag: "over-order",
            accepted: true,
            idempotent_replay: false,
          });
        }
        throw new Error(`Unexpected request: ${method} ${url}`);
      });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter initialEntries={["/simulation?sessionId=s1&missionId=m1"]}>
        <PortfolioRunPage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Mama Mboga Market" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Turn 0 of 6")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Steady" }));

    expect(
      await screen.findByRole("heading", {
        name: "Why do you think this happened?",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Steady" })).toBeDisabled();

    const decisionCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/decisions"),
    );
    expect(decisionCall).toBeDefined();
    const decisionHeaders = decisionCall?.[1]?.headers as Headers;
    expect(decisionHeaders.get("Idempotency-Key")).toBeTruthy();
    expect(JSON.parse(String(decisionCall?.[1]?.body))).toEqual({
      action_type: "market_plan",
      parameters: { plan_id: "steady" },
      expected_turn: 0,
    });

    fireEvent.click(screen.getByRole("button", { name: /I ordered too much/ }));

    expect(
      await screen.findByText(/Explanation saved: over order/),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Steady" })).toBeEnabled();
    });

    const reflectionCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/reflections"),
    );
    expect(JSON.parse(String(reflectionCall?.[1]?.body))).toEqual({
      turn_number: 1,
      answer_code: "1",
    });
    expect(stateReads).toBe(2);
  });
});
