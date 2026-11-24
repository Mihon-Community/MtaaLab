import type {
  DebriefResponse,
  SimulationEvent,
  WaterAccounting,
} from "../../types/api";
import { WaterAccountingPanel } from "./WaterAccountingPanel";

interface EventPanelProps {
  events: SimulationEvent[];
  turn: number;
  aiFeedbackStatus: string | null;
  reflection: DebriefResponse | null;
  isLoadingReflection: boolean;
  reflectionError: string | null;
  onRequestReflection: () => void;
  accounting?: WaterAccounting | null;
  waterUnit?: string;
}

export function EventPanel({
  events,
  turn,
  aiFeedbackStatus,
  reflection,
  isLoadingReflection,
  reflectionError,
  onRequestReflection,
  accounting = null,
  waterUnit = "fictional water units",
}: EventPanelProps) {
  return (
    <section className="surface-card event-panel" aria-labelledby="event-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Community voice</p>
          <h2 id="event-title">Events & reflection</h2>
        </div>
        {aiFeedbackStatus && (
          <span className={`feedback-status feedback-${aiFeedbackStatus}`}>
            Feedback {formatLabel(aiFeedbackStatus)}
          </span>
        )}
      </div>

      <div className="event-list" aria-live="polite">
        {events.length > 0 ? (
          events.map((event, index) => {
            const message = event.payload.message;
            return (
              <article
                className="event-note"
                key={`${event.turn_number}-${event.event_type}-${index}`}
              >
                <span className="event-turn">Turn {event.turn_number}</span>
                <h3>{formatLabel(event.event_type)}</h3>
                <p>
                  {typeof message === "string"
                    ? message
                    : "A scripted event was recorded for this turn."}
                </p>
              </article>
            );
          })
        ) : (
          <p className="briefing-description">
            No new community event has been recorded for turn {turn}.
          </p>
        )}
      </div>

      <div className="reflection-box">
        <div>
          <h3>Ask for a community reflection</h3>
          <p>
            Request a short debrief grounded in the saved decisions and
            outcomes. The engine remains the source of all simulation values.
          </p>
        </div>
        <button
          className="secondary-action"
          type="button"
          onClick={onRequestReflection}
          disabled={isLoadingReflection}
        >
          {isLoadingReflection ? "Preparing reflection…" : "Get reflection"}
        </button>
      </div>

      {reflectionError && (
        <div className="notice-card notice-card-error" role="alert">
          <p>{reflectionError}</p>
        </div>
      )}
      {reflection && (
        <article className="reflection-result" aria-live="polite">
          <div className="reflection-result-heading">
            <h3>Reflection from the saved run</h3>
            <span>
              {reflection.source === "nvidia"
                ? "AI-assisted"
                : "Factual fallback"}
            </span>
          </div>
          <p>{reflection.debrief.summary}</p>
          {reflection.debrief.trade_offs.length > 0 && (
            <ul>
              {reflection.debrief.trade_offs.map((tradeOff) => (
                <li key={tradeOff}>{tradeOff}</li>
              ))}
            </ul>
          )}
          {reflection.ai_feedback_status === "ai_unavailable" && (
            <p className="form-hint">
              AI is unavailable right now. This reflection uses saved facts
              only.
            </p>
          )}
        </article>
      )}

      <WaterAccountingPanel accounting={accounting} waterUnit={waterUnit} />
    </section>
  );
}

function formatLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
