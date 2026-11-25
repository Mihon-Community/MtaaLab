import { useEffect, useState } from "react";
import { getHealth } from "../services/api";
import { isDemoMode } from "../services/demo";
import { getSupabaseClient } from "../services/supabase";

/**
 * Uses the dependency-free health endpoint only to distinguish an unreachable
 * API from an authorization problem. It never substitutes for confirmed
 * simulation state.
 */
export function ApiStatusBanner() {
  const [offline, setOffline] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (isDemoMode() || !getSupabaseClient()) return;
    let active = true;
    void getHealth()
      .then(() => {
        if (active) setOffline(false);
      })
      .catch(() => {
        if (active) setOffline(true);
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  if (!offline) return null;

  return (
    <div
      className="notice-card notice-card-error api-status-banner"
      role="alert"
    >
      <p>
        <strong>The MtaaLab API is not reachable.</strong> Saved games cannot
        load until the connection is restored.
      </p>
      <button
        className="notice-action"
        type="button"
        onClick={() => setAttempt((current) => current + 1)}
      >
        Retry connection
      </button>
    </div>
  );
}
