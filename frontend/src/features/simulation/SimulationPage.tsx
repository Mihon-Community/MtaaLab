import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ApiError,
  getMission,
  getSimulationDebrief,
  getSimulationHistory,
  getSimulationReport,
  getSimulationState,
  submitDecision,
} from "../../services/api";
import {
  readConfirmedSession,
  saveConfirmedSession,
} from "../../services/sessionCache";
import type {
  DecisionRequest,
  DebriefResponse,
  HistoryEntry,
  MissionDetail,
  SessionStateResponse,
  WaterAccounting,
} from "../../types/api";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { BudgetTrendChart, ReservoirTrendChart } from "@/components/charts";
import { EventPanel } from "./EventPanel";
import { InspectionPanel } from "./InspectionPanel";
import { ResourceHUD } from "./ResourceHUD";
import { DecisionPanel } from "./DecisionPanel";
import { StakeholderPanel } from "./StakeholderPanel";
import { TurnTimeline } from "./TurnTimeline";
import { WORLD_LOCATIONS, type LocationId } from "./worldLocations";
import { WorldCanvas } from "./WorldCanvas";

export function SimulationPage() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const missionIdParam = searchParams.get("mission_id");
  const compareSessionId = searchParams.get("compare_session_id");
  const [session, setSession] = useState<SessionStateResponse | null>(null);
  const [mission, setMission] = useState<MissionDetail | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [selectedLocation, setSelectedLocation] =
    useState<LocationId>("reservoir");
  const [stateLoading, setStateLoading] = useState(true);
  const [missionLoading, setMissionLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [stateError, setStateError] = useState<string | null>(null);
  const [missionError, setMissionError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [reflection, setReflection] = useState<DebriefResponse | null>(null);
  const [reflectionLoading, setReflectionLoading] = useState(false);
  const [reflectionError, setReflectionError] = useState<string | null>(null);
  const [feedbackStatus, setFeedbackStatus] = useState<string | null>(null);
  const [lastEvents, setLastEvents] = useState<NonNullable<
    HistoryEntry["events"]
  > | null>(null);
  const [lastAccounting, setLastAccounting] = useState<WaterAccounting | null>(
    null,
  );
  const [stateAttempt, setStateAttempt] = useState(0);
  const [missionAttempt, setMissionAttempt] = useState(0);
  const [historyAttempt, setHistoryAttempt] = useState(0);
  const [historyVersion, setHistoryVersion] = useState(0);
  const submitLock = useRef(false);
  const pendingRequest = useRef<{ fingerprint: string; key: string } | null>(
    null,
  );

  useEffect(() => {
    setHistory([]);
    setLastEvents(null);
    setLastAccounting(null);
    setFeedbackStatus(null);
    setReflection(null);
  }, [sessionId]);

  useEffect(() => {
    let active = true;
    if (!sessionId) {
      setSession(null);
      setStateError(null);
      setStateLoading(false);
      return () => {
        active = false;
      };
    }

    const cached = readConfirmedSession(sessionId);
    setSession((current) =>
      current?.session_id === sessionId && current.turn > (cached?.turn ?? -1)
        ? current
        : cached,
    );
    setStateError(null);
    setStateLoading(true);
    void getSimulationState(sessionId)
      .then((result) => {
        if (!active) return;
        setSession(result);
        saveConfirmedSession(result);
        setStateError(null);
      })
      .catch((cause: unknown) => {
        if (active) {
          setStateError(
            describeError(
              cause,
              cached
                ? "The latest state could not be refreshed. Showing the last confirmed state saved on this device."
                : "We couldn't load this simulation. Check your connection and try again.",
            ),
          );
        }
      })
      .finally(() => {
        if (active) setStateLoading(false);
      });

    return () => {
      active = false;
    };
  }, [sessionId, stateAttempt]);

  useEffect(() => {
    let active = true;
    if (!sessionId) {
      setMission(null);
      setMissionError(null);
      setMissionLoading(false);
      return () => {
        active = false;
      };
    }

    setMission(null);
    setMissionError(null);
    setMissionLoading(true);
    void (async () => {
      try {
        const missionId =
          missionIdParam ?? (await getSimulationReport(sessionId)).mission_id;
        const result = await getMission(missionId);
        if (active) setMission(result);
      } catch (cause) {
        if (active) {
          setMissionError(
            describeError(
              cause,
              "Mission rules could not be loaded. Reconnect before making a decision.",
            ),
          );
        }
      } finally {
        if (active) setMissionLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [sessionId, missionIdParam, missionAttempt]);

  useEffect(() => {
    let active = true;
    if (!sessionId) {
      setHistory([]);
      setHistoryError(null);
      setHistoryLoading(false);
      return () => {
        active = false;
      };
    }

    setHistoryLoading(true);
    setHistoryError(null);
    void getSimulationHistory(sessionId)
      .then((result) => {
        if (active) setHistory(result.entries);
      })
      .catch((cause: unknown) => {
        if (active) {
          setHistoryError(
            describeError(
              cause,
              "The saved timeline could not be loaded. Retry when you are connected.",
            ),
          );
        }
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });

    return () => {
      active = false;
    };
  }, [sessionId, historyAttempt, historyVersion]);

  useEffect(() => {
    const reconnect = () => setStateAttempt((current) => current + 1);
    window.addEventListener("online", reconnect);
    return () => window.removeEventListener("online", reconnect);
  }, []);

  const activeSession = session?.session_id === sessionId ? session : null;
  const activeMission =
    mission && (!missionIdParam || mission.id === missionIdParam)
      ? mission
      : null;
  const state = activeSession?.state ?? null;
  const currentEntry =
    history.length > 0 ? history[history.length - 1] : undefined;
  const events = lastEvents ?? currentEntry?.events ?? [];
  const aiStatus = feedbackStatus ?? currentEntry?.ai_feedback_status ?? null;
  const missionComplete =
    activeSession?.status === "completed" ||
    (activeMission !== null &&
      activeSession !== null &&
      activeSession.turn >= activeMission.number_of_turns);

  async function handleSubmitDecision(decision: DecisionRequest) {
    if (!sessionId || !activeSession || submitLock.current) return;
    submitLock.current = true;
    setSubmitting(true);
    setDecisionError(null);
    const fingerprint = JSON.stringify(decision);
    if (pendingRequest.current?.fingerprint !== fingerprint) {
      pendingRequest.current = { fingerprint, key: crypto.randomUUID() };
    }

    try {
      const result = await submitDecision(
        sessionId,
        decision,
        pendingRequest.current.key,
      );
      const confirmed: SessionStateResponse = {
        session_id: result.session_id,
        turn: result.turn,
        status: activeSession.status,
        state: result.state,
      };
      setSession(confirmed);
      saveConfirmedSession(confirmed);
      setLastEvents(result.events);
      setLastAccounting(result.water_accounting);
      setFeedbackStatus(result.ai_feedback_status);
      toast.success(`Turn ${result.turn} confirmed`);
      setReflection(null);
      pendingRequest.current = null;
      setStateError(null);
      setHistoryVersion((current) => current + 1);

      try {
        const refreshed = await getSimulationState(sessionId);
        setSession(refreshed);
        saveConfirmedSession(refreshed);
      } catch (cause) {
        setStateError(
          describeError(
            cause,
            "The decision was confirmed, but the latest session status could not be refreshed. The confirmed decision remains visible.",
          ),
        );
      }
    } catch (cause) {
      const message =
        cause instanceof ApiError && cause.status === 409
          ? "The session changed before this decision could be applied. Refreshing the confirmed state; review it before trying again."
          : describeError(
              cause,
              "The decision was not confirmed. Your last confirmed state is unchanged; retrying will reuse the same request key.",
            );
      setDecisionError(message);
      if (cause instanceof ApiError && cause.status === 409) {
        setStateAttempt((current) => current + 1);
        setHistoryVersion((current) => current + 1);
      }
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  async function handleRequestReflection() {
    if (!sessionId || reflectionLoading) return;
    setReflectionLoading(true);
    setReflectionError(null);
    try {
      const result = await getSimulationDebrief(sessionId);
      setReflection(result);
    } catch (cause) {
      setReflectionError(
        describeError(
          cause,
          "The reflection could not be generated. Try again when connected.",
        ),
      );
    } finally {
      setReflectionLoading(false);
    }
  }

  if (!sessionId) {
    return (
      <section aria-labelledby="simulation-title">
        <p className="eyebrow">Mtoni catchment · Simulation</p>
        <h1 id="simulation-title">No active mission yet.</h1>
        <p className="page-intro">
          Choose an assigned mission to inspect locations and make decisions.
        </p>
        <Link className="primary-action" to="/">
          Go to mission lobby
        </Link>
      </section>
    );
  }

  if (!state && stateLoading) {
    return (
      <section aria-labelledby="simulation-title">
        <p className="eyebrow">Mtoni catchment · Simulation</p>
        <h1 id="simulation-title">Preparing your world…</h1>
        <p className="loading-state" role="status">
          Loading the latest confirmed state and mission rules.
        </p>
      </section>
    );
  }

  if (!activeSession || !state) {
    return (
      <section aria-labelledby="simulation-title">
        <p className="eyebrow">Mtoni catchment · Simulation</p>
        <h1 id="simulation-title">The world could not be loaded.</h1>
        <div className="notice-card notice-card-error" role="alert">
          <p>
            {stateError ??
              "This session is not available. Return to the mission lobby and try again."}
          </p>
          <button
            className="notice-action"
            type="button"
            onClick={() => setStateAttempt((current) => current + 1)}
            disabled={stateLoading}
          >
            Reconnect and retry
          </button>
        </div>
        <Link className="text-link" to="/">
          Mission lobby
        </Link>
      </section>
    );
  }

  if (missionLoading || !activeMission) {
    return (
      <section aria-labelledby="simulation-title">
        <p className="eyebrow">Mtoni catchment · Simulation</p>
        <h1 id="simulation-title">Loading mission rules…</h1>
        {missionError ? (
          <div className="notice-card notice-card-error" role="alert">
            <p>{missionError}</p>
            <button
              className="notice-action"
              type="button"
              onClick={() => setMissionAttempt((current) => current + 1)}
              disabled={missionLoading}
            >
              Retry mission rules
            </button>
          </div>
        ) : (
          <p className="loading-state" role="status">
            Fetching the approved scenario and action catalogue.
          </p>
        )}
      </section>
    );
  }

  const waterUnit = activeMission.units.water ?? "fictional water units";
  const budgetUnit = activeMission.units.budget ?? "fictional budget credits";
  const isReadOnly = Boolean(stateError || missionError);

  return (
    <section className="simulation-page" aria-labelledby="simulation-title">
      <PageHeader
        eyebrow={`Mtoni catchment · ${activeMission.subject}`}
        title={activeMission.title}
        description={activeMission.description}
        titleId="simulation-title"
        className="mb-6"
        actions={
          <>
            {stateError && (
              <span className="cached-state-label">
                Showing last confirmed state
              </span>
            )}
            <Link
              className="text-link"
              to={`/report?session_id=${encodeURIComponent(sessionId)}`}
            >
              Learning report
            </Link>
            <Link
              className="text-link"
              to={`/replay?source_session_id=${encodeURIComponent(sessionId)}`}
            >
              Replay this run
            </Link>
            {compareSessionId && (
              <Link
                className="text-link"
                to={`/replay?source_session_id=${encodeURIComponent(compareSessionId)}&replay_session_id=${encodeURIComponent(sessionId)}&mission_id=${encodeURIComponent(activeMission.id)}`}
              >
                Compare with original
              </Link>
            )}
          </>
        }
      />

      {(stateError || missionError) && (
        <div className="notice-card notice-card-error" role="alert">
          <p>{stateError ?? missionError}</p>
          <button
            className="notice-action"
            type="button"
            onClick={() => {
              if (stateError) setStateAttempt((current) => current + 1);
              if (missionError) setMissionAttempt((current) => current + 1);
            }}
            disabled={stateLoading || missionLoading}
          >
            Reconnect and retry
          </button>
        </div>
      )}

      {activeMission.learning_objectives[0] && (
        <div className="mission-objective">
          <span className="objective-label">Mission objective</span>
          <p>{activeMission.learning_objectives[0]}</p>
        </div>
      )}

      <ResourceHUD
        state={state}
        turn={activeSession.turn}
        totalTurns={activeMission.number_of_turns}
        waterUnit={waterUnit}
        budgetUnit={budgetUnit}
      />
      <section
        className="environment-indicators"
        aria-label="Community and environmental indicators"
      >
        <div>
          <span className="metric-label">Community wellbeing</span>
          <strong>{Math.round(state.wellbeing)}%</strong>
        </div>
        <div>
          <span className="metric-label">Crop health</span>
          <strong>{Math.round(state.crop_health)}%</strong>
        </div>
      </section>

      {history.length > 0 ? (
        <section
          className="grid gap-6 lg:grid-cols-2"
          aria-label="Confirmed trends across turns"
        >
          <ReservoirTrendChart entries={history} unit={waterUnit} />
          <BudgetTrendChart entries={history} unit={budgetUnit} />
        </section>
      ) : null}

      <div className="world-inspection-layout">
        <section
          className="surface-card world-section"
          aria-labelledby="world-title"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">Investigate the system</p>
              <h2 id="world-title">Mtoni world view</h2>
            </div>
            <span className="map-key">
              <span aria-hidden="true" /> Connected water system
            </span>
          </div>
          <WorldCanvas onSelect={setSelectedLocation} state={state} />
          <div
            className="world-location-list"
            role="group"
            aria-label="Inspect a location"
          >
            {WORLD_LOCATIONS.map((location) => (
              <button
                className="location-button"
                key={location.id}
                type="button"
                aria-pressed={selectedLocation === location.id}
                onClick={() => setSelectedLocation(location.id)}
              >
                <span>{location.label}</span>
                <small>{locationSummary(location.id, state)}</small>
              </button>
            ))}
          </div>
        </section>

        <InspectionPanel
          state={state}
          selectedLocation={selectedLocation}
          waterUnit={waterUnit}
        />
      </div>

      <DecisionPanel
        mission={activeMission}
        state={state}
        expectedTurn={activeSession.turn}
        isSubmitting={submitting}
        isComplete={missionComplete}
        isReadOnly={isReadOnly}
        errorMessage={decisionError}
        onSubmit={(decision) => void handleSubmitDecision(decision)}
      />

      <StakeholderPanel
        state={state}
        events={events}
        waterUnit={waterUnit}
        aiFeedbackStatus={aiStatus}
      />

      <div className="simulation-detail-grid">
        <EventPanel
          events={events}
          turn={activeSession.turn}
          aiFeedbackStatus={aiStatus}
          reflection={reflection}
          isLoadingReflection={reflectionLoading}
          reflectionError={reflectionError}
          onRequestReflection={() => void handleRequestReflection()}
          accounting={lastAccounting}
          waterUnit={waterUnit}
        />
        <TurnTimeline
          entries={history}
          mission={activeMission}
          loading={historyLoading}
          errorMessage={historyError}
          onRetry={() => setHistoryAttempt((current) => current + 1)}
        />
      </div>
    </section>
  );
}

function locationSummary(
  locationId: LocationId,
  state: SessionStateResponse["state"],
) {
  const location = WORLD_LOCATIONS.find(({ id }) => id === locationId);
  if (location?.sector) {
    return `${Math.round(state.service_levels[location.sector] * 100)}% service`;
  }
  if (locationId === "reservoir") {
    return `${state.reservoir_level} / ${state.reservoir_capacity} units`;
  }
  if (locationId === "main-pipe") {
    return `${state.leakage} units leaking`;
  }
  return "Inspect community needs";
}

function describeError(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (error.status === 401)
      return "Your session is not signed in or has expired. Sign in, then retry.";
    if (error.status === 404)
      return "This simulation is not available to your account.";
    if (error.status === 409)
      return "The session changed on the server. Refresh the confirmed state before continuing.";
  }
  return fallback;
}
