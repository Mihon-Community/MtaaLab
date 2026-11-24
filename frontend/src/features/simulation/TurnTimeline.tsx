import type { HistoryEntry, MissionDetail } from "../../types/api";

interface TurnTimelineProps {
  entries: HistoryEntry[];
  mission: MissionDetail;
  loading: boolean;
  errorMessage: string | null;
  onRetry: () => void;
}

export function TurnTimeline({
  entries,
  mission,
  loading,
  errorMessage,
  onRetry,
}: TurnTimelineProps) {
  return (
    <section
      className="surface-card turn-timeline"
      aria-labelledby="timeline-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Saved as you go</p>
          <h2 id="timeline-title">Turn timeline</h2>
        </div>
        <span className="assignment-count">
          {entries.length} {entries.length === 1 ? "snapshot" : "snapshots"}
        </span>
      </div>

      {loading && (
        <p className="loading-state" role="status">
          Loading the saved timeline…
        </p>
      )}
      {errorMessage && (
        <div className="notice-card notice-card-error" role="alert">
          <p>{errorMessage}</p>
          <button className="notice-action" type="button" onClick={onRetry}>
            Retry timeline
          </button>
        </div>
      )}
      {!loading && !errorMessage && entries.length === 0 && (
        <p className="briefing-description">
          No saved turns are available yet.
        </p>
      )}

      <ol className="timeline-list">
        {entries.map((entry, index) => {
          const actionLabel = entry.action
            ? (mission.action_catalogue.find(
                (action) => action.action_type === entry.action?.action_type,
              )?.label ?? formatLabel(entry.action.action_type))
            : "Mission started";
          const previous = index > 0 ? entries[index - 1] : null;
          const reservoirDelta = previous
            ? roundDelta(entry.state.reservoir_level - previous.state.reservoir_level)
            : null;
          const budgetDelta = previous
            ? roundDelta(entry.state.budget_remaining - previous.state.budget_remaining)
            : null;
          return (
            <li className="timeline-entry" key={entry.turn}>
              <span className="timeline-marker" aria-hidden="true" />
              <div className="timeline-entry-heading">
                <h3>Turn {entry.turn}</h3>
                <span>{entry.ai_feedback_status ?? "Saved"}</span>
              </div>
              <p>{actionLabel}</p>
              {previous && (
                <p className="timeline-delta">
                  <span>
                    Reservoir{" "}
                    {reservoirDelta !== null && reservoirDelta > 0
                      ? `+${reservoirDelta}`
                      : reservoirDelta}{" "}
                    units
                  </span>
                  <span>
                    Budget{" "}
                    {budgetDelta !== null && budgetDelta > 0
                      ? `+${budgetDelta}`
                      : budgetDelta}{" "}
                    credits
                  </span>
                </p>
              )}
              {entry.events.map((event, index) => {
                const message = event.payload.message;
                return (
                  <p
                    className="timeline-event"
                    key={`${event.event_type}-${index}`}
                  >
                    {typeof message === "string"
                      ? message
                      : formatLabel(event.event_type)}
                  </p>
                );
              })}
              {entry.action && (
                <p className="timeline-evidence">
                  Confirmed reservoir: {entry.state.reservoir_level} /{" "}
                  {entry.state.reservoir_capacity} fictional water units ·
                  Budget: {entry.state.budget_remaining} credits
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function formatLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function roundDelta(value: number): number {
  return Math.round(value * 100) / 100;
}
