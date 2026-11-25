import type { Sector, SimulationEvent, SimulationState } from "../../types/api";

interface StakeholderPanelProps {
  state: SimulationState;
  events: SimulationEvent[];
  waterUnit: string;
  aiFeedbackStatus: string | null;
}

const VOICES: {
  sector: Sector;
  name: string;
  perspective: string;
}[] = [
  {
    sector: "households",
    name: "Households",
    perspective:
      "Families need reliable water for cooking, cleaning, and hygiene every day.",
  },
  {
    sector: "school",
    name: "School",
    perspective:
      "Learners depend on safe water at school; the mission rules set a critical minimum.",
  },
  {
    sector: "clinic",
    name: "Clinic",
    perspective:
      "The clinic's essential water needs have a critical minimum defined by the mission rules.",
  },
  {
    sector: "farms",
    name: "Farms",
    perspective:
      "Irrigation supports crops and livelihoods, and competes with other sectors.",
  },
];

/**
 * Community voices grounded only in the confirmed simulation state. Dialogue
 * text from the AI stakeholder channel is supplied by the server; this panel
 * never invents it locally.
 */
export function StakeholderPanel({
  state,
  events,
  waterUnit,
  aiFeedbackStatus,
}: StakeholderPanelProps) {
  const latestEvents = events.slice(-2);

  return (
    <section
      className="surface-card stakeholder-panel"
      aria-labelledby="stakeholder-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Community voices</p>
          <h2 id="stakeholder-title">Who is affected</h2>
        </div>
        {aiFeedbackStatus && (
          <span className={`feedback-status feedback-${aiFeedbackStatus}`}>
            Recorded stakeholder feedback: {formatLabel(aiFeedbackStatus)}
          </span>
        )}
      </div>

      <ul className="voice-list">
        {VOICES.map((voice) => {
          const relatedEvent = latestEvents.find((event) =>
            eventMentionsSector(event.event_type, voice.sector),
          );
          return (
            <li className="voice-card" key={voice.sector}>
              <div className="voice-card-heading">
                <h3>{voice.name}</h3>
                <span className="voice-service">
                  {Math.round(state.service_levels[voice.sector] * 100)}%
                  service
                </span>
              </div>
              <p className="voice-perspective">{voice.perspective}</p>
              <dl className="voice-facts">
                <div>
                  <dt>Demand</dt>
                  <dd>{state.demand_by_sector[voice.sector]}</dd>
                </div>
                <div>
                  <dt>Unmet</dt>
                  <dd>{state.unmet_demand_by_sector[voice.sector]}</dd>
                </div>
              </dl>
              {relatedEvent?.payload.message ? (
                <p className="voice-event">
                  {String(relatedEvent.payload.message)}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p className="form-hint">
        Values above are from the latest confirmed state ({waterUnit}). The AI
        stakeholder dialogue for each turn is written by the simulation service;
        this panel reports its recorded status and never generates dialogue
        locally.
      </p>
    </section>
  );
}

function eventMentionsSector(eventType: string, sector: Sector): boolean {
  switch (eventType) {
    case "school_meeting":
      return sector === "school";
    case "clinic_update":
      return sector === "clinic";
    case "market_update":
      return sector === "farms";
    default:
      // Community-wide updates already appear in the events panel; repeating
      // them on every voice card would duplicate the same sentence.
      return false;
  }
}

function formatLabel(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
