import type { Sector, SessionStateResponse } from "../types/api";

const cachePrefix = "mtaalab:confirmed-session:";
const sectors: Sector[] = ["households", "school", "clinic", "farms"];

export function readConfirmedSession(
  sessionId: string,
): SessionStateResponse | null {
  try {
    const stored = window.localStorage.getItem(`${cachePrefix}${sessionId}`);
    if (!stored) return null;
    const value: unknown = JSON.parse(stored);
    if (!isSessionState(value) || value.session_id !== sessionId) {
      console.warn("Ignoring an invalid cached simulation snapshot.");
      return null;
    }
    return value;
  } catch (error) {
    console.warn("Could not read the cached simulation snapshot.", error);
    return null;
  }
}

export function saveConfirmedSession(session: SessionStateResponse): void {
  try {
    window.localStorage.setItem(
      `${cachePrefix}${session.session_id}`,
      JSON.stringify(session),
    );
  } catch (error) {
    console.warn("Could not save the confirmed simulation snapshot.", error);
  }
}

function isSessionState(value: unknown): value is SessionStateResponse {
  if (!isRecord(value) || !isRecord(value.state)) return false;
  const { state } = value;
  return (
    typeof value.session_id === "string" &&
    typeof value.turn === "number" &&
    typeof value.status === "string" &&
    typeof state.current_turn === "number" &&
    typeof state.reservoir_level === "number" &&
    typeof state.reservoir_capacity === "number" &&
    typeof state.budget_remaining === "number" &&
    typeof state.leakage === "number" &&
    typeof state.crop_health === "number" &&
    typeof state.wellbeing === "number" &&
    typeof state.allocation_policy === "string" &&
    Array.isArray(state.used_actions) &&
    state.used_actions.every((action) => typeof action === "string") &&
    Array.isArray(state.pending_effects) &&
    isSectorRecord(state.demand_by_sector) &&
    isSectorRecord(state.service_levels) &&
    isSectorRecord(state.unmet_demand_by_sector)
  );
}

function isSectorRecord(value: unknown): value is Record<Sector, number> {
  return (
    isRecord(value) &&
    sectors.every((sector) => typeof value[sector] === "number")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
