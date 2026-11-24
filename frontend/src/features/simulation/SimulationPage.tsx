import { lazy, Suspense } from "react";
import { useLocation } from "react-router-dom";
import { WorldCanvas } from "./WorldCanvas";
import { InspectionPanel } from "./InspectionPanel";
import { ResourceHUD } from "./ResourceHUD";
import { DecisionPanel } from "./DecisionPanel";
import { EventPanel } from "./EventPanel";
import { TurnTimeline } from "./TurnTimeline";

const PortfolioRunPage = lazy(() =>
  import("./PortfolioRunPage").then((module) => ({
    default: module.PortfolioRunPage,
  })),
);

export function SimulationPage() {
  const { search } = useLocation();
  const query = new URLSearchParams(search);
  if (query.has("sessionId") || query.has("missionId")) {
    return (
      <Suspense fallback={<p role="status">Loading saved game…</p>}>
        <PortfolioRunPage />
      </Suspense>
    );
  }

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
