import parityFixture from "./engine-parity.fixture.json";
import { describe, expect, it } from "vitest";
import { calculateNextState, EngineValidationError } from "./engine";
import { MTONI_SCENARIO } from "./scenario";
import type { DecisionRequest, SimulationState } from "../../types/api";

const ACTIONS: DecisionRequest[] = [
  {
    action_type: "change_allocation",
    parameters: { policy_id: "household_focus" },
    expected_turn: 0,
  },
  {
    action_type: "repair_main_pipe",
    parameters: {},
    expected_turn: 1,
  },
  {
    action_type: "conservation_campaign",
    parameters: { household_reduction_ratio: 0.15 },
    expected_turn: 2,
  },
  {
    action_type: "change_allocation",
    parameters: { policy_id: "farm_focus" },
    expected_turn: 3,
  },
  {
    action_type: "efficient_irrigation",
    parameters: { farm_reduction_ratio: 0.2 },
    expected_turn: 4,
  },
  {
    action_type: "install_storage",
    parameters: { capacity_increase: 20 },
    expected_turn: 5,
  },
];

describe("demo engine parity", () => {
  it("matches the FastAPI engine turn for turn", () => {
    let state = JSON.parse(
      JSON.stringify(MTONI_SCENARIO.initial_state),
    ) as unknown as SimulationState;
    const actual = ACTIONS.map((action) => {
      const result = calculateNextState(state, action);
      state = result.state;
      return result;
    });

    expect(actual).toEqual(parityFixture.turns);
  });

  it("rejects the same invalid actions as the FastAPI validator", () => {
    const cases: [string, DecisionRequest][] = [
      [
        "stale",
        {
          action_type: "repair_main_pipe",
          parameters: {},
          expected_turn: 9,
        },
      ],
      [
        "unknown",
        {
          action_type: "nuclear_desalination",
          parameters: {},
          expected_turn: 0,
        },
      ],
      [
        "extra_param",
        {
          action_type: "repair_main_pipe",
          parameters: { x: 1 },
          expected_turn: 0,
        },
      ],
      [
        "range",
        {
          action_type: "conservation_campaign",
          parameters: { household_reduction_ratio: 0.9 },
          expected_turn: 0,
        },
      ],
      [
        "bad_policy",
        {
          action_type: "change_allocation",
          parameters: { policy_id: "mars" },
          expected_turn: 0,
        },
      ],
    ];

    const initial = JSON.parse(
      JSON.stringify(MTONI_SCENARIO.initial_state),
    ) as unknown as SimulationState;

    for (const [, action] of cases) {
      expect(() => calculateNextState(initial, action)).toThrow(
        EngineValidationError,
      );
    }
  });
});
