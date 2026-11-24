import type { SimulationState } from "../../types/api";

interface ResourceHUDProps {
  state: SimulationState;
  turn: number;
  totalTurns: number;
  waterUnit: string;
  budgetUnit: string;
}

export function ResourceHUD({
  state,
  turn,
  totalTurns,
  waterUnit,
  budgetUnit,
}: ResourceHUDProps) {
  const unmetSectors = Object.entries(state.unmet_demand_by_sector).filter(
    ([, amount]) => amount > 0,
  );

  return (
    <section className="resource-hud" aria-label="Mission command panel">
      <div className="command-summary">
        <div>
          <span className="metric-label">Mission turn</span>
          <strong className="command-turn">
            {turn} <span>of {totalTurns}</span>
          </strong>
        </div>
        <div>
          <span className="metric-label">Budget remaining</span>
          <strong className="command-value">
            {state.budget_remaining}{" "}
            <span>{budgetUnit || "fictional budget credits"}</span>
          </strong>
        </div>
      </div>

      <div className="command-reservoir">
        <div className="command-reservoir-label">
          <span>Reservoir</span>
          <strong>
            {state.reservoir_level} / {state.reservoir_capacity}{" "}
            {waterUnit || "fictional water units"}
          </strong>
        </div>
        <meter
          min={0}
          max={state.reservoir_capacity}
          value={state.reservoir_level}
          aria-label="Reservoir level"
        />
      </div>

      <div className="command-alerts" aria-live="polite">
        {unmetSectors.length > 0 ? (
          <p>
            <strong>Unmet demand recorded:</strong>{" "}
            {unmetSectors
              .map(([sector, amount]) => `${formatLabel(sector)} ${amount}`)
              .join(" · ")}{" "}
            {waterUnit || "fictional water units"}
          </p>
        ) : (
          <p>No unmet demand is recorded in the confirmed state.</p>
        )}
      </div>
    </section>
  );
}

function formatLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
