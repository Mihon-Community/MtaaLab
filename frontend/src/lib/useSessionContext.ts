import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { readLastConfirmedSessionId } from "@/services/sessionCache";

export interface SessionLinkOverrides {
  sessionId?: string | null;
  missionId?: string | null;
  compareSessionId?: string | null;
}

export interface SessionContextValue {
  /** Active simulation session, from the URL or the last confirmed one. */
  sessionId: string | null;
  missionId: string | null;
  compareSessionId: string | null;
  /** False until a mission has been started somewhere. */
  hasSession: boolean;
  /** True when the URL carried no session and the cached one filled the gap. */
  fromCache: boolean;
  /** Build a route href that keeps the active session. */
  buildHref: (path: string, overrides?: SessionLinkOverrides) => string;
}

const SESSION_ROUTES = new Set(["/simulation", "/report", "/replay"]);

/**
 * Single source of truth for session-aware navigation. Nav links must never
 * silently drop `session_id`/`mission_id`: moving from Simulation to Report
 * without them would strand the learner on an empty screen.
 */
export function useSessionContext(): SessionContextValue {
  const [searchParams] = useSearchParams();

  const urlSessionId = searchParams.get("session_id");
  const urlMissionId = searchParams.get("mission_id");
  const compareSessionId = searchParams.get("compare_session_id");
  const urlSourceSessionId = searchParams.get("source_session_id");

  return useMemo(() => {
    const cachedSessionId = readLastConfirmedSessionId();
    const sessionId = urlSessionId ?? urlSourceSessionId ?? cachedSessionId;
    const missionId = urlMissionId;
    const fromCache = !urlSessionId && Boolean(cachedSessionId);

    const buildHref = (
      path: string,
      overrides: SessionLinkOverrides = {},
    ): string => {
      const effectiveSession =
        overrides.sessionId === undefined ? sessionId : overrides.sessionId;
      const effectiveMission =
        overrides.missionId === undefined ? missionId : overrides.missionId;
      const effectiveCompare =
        overrides.compareSessionId === undefined
          ? compareSessionId
          : overrides.compareSessionId;

      const params = new URLSearchParams();
      if (path === "/simulation") {
        if (effectiveSession) params.set("session_id", effectiveSession);
        if (effectiveMission) params.set("mission_id", effectiveMission);
        if (effectiveCompare) {
          params.set("compare_session_id", effectiveCompare);
        }
      } else if (path === "/report") {
        if (effectiveSession) params.set("session_id", effectiveSession);
      } else if (path === "/replay") {
        if (effectiveSession) params.set("source_session_id", effectiveSession);
        if (effectiveMission) params.set("mission_id", effectiveMission);
      } else if (path === "/briefing") {
        if (effectiveMission) params.set("mission_id", effectiveMission);
      }

      const query = params.toString();
      return query ? `${path}?${query}` : path;
    };

    return {
      sessionId,
      missionId,
      compareSessionId,
      hasSession: Boolean(sessionId),
      fromCache,
      buildHref,
    };
  }, [urlSessionId, urlSourceSessionId, urlMissionId, compareSessionId]);
}

/** Routes that need an active session before they can render anything useful. */
export function routeNeedsSession(path: string): boolean {
  return SESSION_ROUTES.has(path);
}

/** Stable callback-friendly wrapper used by nav components. */
export function useSessionHref() {
  const { buildHref } = useSessionContext();
  return useCallback((path: string) => buildHref(path), [buildHref]);
}
