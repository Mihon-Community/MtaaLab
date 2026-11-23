import { WorldCanvas } from "./WorldCanvas";
import { InspectionPanel } from "./InspectionPanel";
import { ResourceHUD } from "./ResourceHUD";
import { DecisionPanel } from "./DecisionPanel";
import { EventPanel } from "./EventPanel";
import { TurnTimeline } from "./TurnTimeline";

export function SimulationPage() {
  return (
    <section>
      <h1>Mtoni simulation</h1>
      <p>TODO: render only server-confirmed state.</p>
      <ResourceHUD />
      <div className="simulation-layout">
        <WorldCanvas />
        <InspectionPanel />
      </div>
      <DecisionPanel />
      <EventPanel />
      <TurnTimeline />
    </section>
  );
}
