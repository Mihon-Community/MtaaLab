import { renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { useSessionContext } from "./useSessionContext";
import { saveConfirmedSession } from "@/services/sessionCache";
import type { SessionStateResponse } from "@/types/api";

function wrapperAt(url: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>;
  };
}

const confirmedSession: SessionStateResponse = {
  session_id: "session-url",
  turn: 3,
  status: "active",
  scenario_id: "mtoni",
  state: {
    current_turn: 3,
    reservoir_level: 640,
    reservoir_capacity: 1000,
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
  },
};

beforeEach(() => {
  window.localStorage.clear();
});

describe("useSessionContext", () => {
  it("carries the active session into every session-aware route", () => {
    const { result } = renderHook(() => useSessionContext(), {
      wrapper: wrapperAt(
        "/simulation?session_id=session-url&mission_id=mission-1",
      ),
    });

    expect(result.current.sessionId).toBe("session-url");
    expect(result.current.missionId).toBe("mission-1");
    expect(result.current.hasSession).toBe(true);

    expect(result.current.buildHref("/report")).toBe(
      "/report?session_id=session-url",
    );
    expect(result.current.buildHref("/replay")).toBe(
      "/replay?source_session_id=session-url&mission_id=mission-1",
    );
    expect(result.current.buildHref("/simulation")).toBe(
      "/simulation?session_id=session-url&mission_id=mission-1",
    );
    expect(result.current.buildHref("/briefing")).toBe(
      "/briefing?mission_id=mission-1",
    );
    expect(result.current.buildHref("/teacher")).toBe("/teacher");
    expect(result.current.buildHref("/")).toBe("/");
  });

  it("falls back to the last confirmed session when the URL has none", () => {
    saveConfirmedSession(confirmedSession);

    const { result } = renderHook(() => useSessionContext(), {
      wrapper: wrapperAt("/report"),
    });

    expect(result.current.sessionId).toBe("session-url");
    expect(result.current.fromCache).toBe(true);
    expect(result.current.hasSession).toBe(true);
    expect(result.current.buildHref("/simulation")).toBe(
      "/simulation?session_id=session-url",
    );
  });

  it("reports no session before a mission is started", () => {
    const { result } = renderHook(() => useSessionContext(), {
      wrapper: wrapperAt("/briefing"),
    });

    expect(result.current.sessionId).toBeNull();
    expect(result.current.hasSession).toBe(false);
    expect(result.current.fromCache).toBe(false);
  });

  it("accepts explicit overrides for replay comparisons", () => {
    const { result } = renderHook(() => useSessionContext(), {
      wrapper: wrapperAt(
        "/simulation?session_id=session-url&mission_id=mission-1",
      ),
    });

    expect(
      result.current.buildHref("/simulation", {
        compareSessionId: "original-1",
      }),
    ).toBe(
      "/simulation?session_id=session-url&mission_id=mission-1&compare_session_id=original-1",
    );
  });
});
