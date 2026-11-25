import type { SimulationState } from "../../types/api";
import { WORLD_LOCATIONS, type LocationId } from "./worldLocations";

interface InspectionPanelProps {
  state: SimulationState;
  selectedLocation: LocationId;
  waterUnit: string;
}

export function InspectionPanel({
  state,
  selectedLocation,
  waterUnit,
}: InspectionPanelProps) {
  const location = WORLD_LOCATIONS.find(({ id }) => id === selectedLocation);
  if (!location) return null;

  const sector = location.sector;
  const values = sector
    ? [
        {
          label: "Demand",
          value: `${state.demand_by_sector[sector]} ${waterUnit}`,
        },
        {
          label: "Service level",
          value: `${Math.round(state.service_levels[sector] * 100)}%`,
        },
        {
          label: "Unmet demand",
          value: `${state.unmet_demand_by_sector[sector]} ${waterUnit}`,
        },
      ]
    : location.id === "reservoir"
      ? [
          {
            label: "Stored water",
            value: `${state.reservoir_level} / ${state.reservoir_capacity} ${waterUnit}`,
          },
        ]
      : location.id === "main-pipe"
        ? [{ label: "Network leakage", value: `${state.leakage} ${waterUnit}` }]
        : [];

  return (
    <section className="surface-card inspection-panel" aria-live="polite">
      <p className="eyebrow">Location inspection</p>
      <h2>{location.label}</h2>
      <p className="briefing-description">{explanation(location.id)}</p>
      {values.length > 0 ? (
        <dl className="inspection-values">
          {values.map(({ label, value }) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="briefing-description">
          No separate system value is available for this location.
        </p>
      )}
    </section>
  );
}

function explanation(locationId: LocationId) {
  switch (locationId) {
    case "reservoir":
      return "The reservoir stores the water available to the whole community. Capacity is a limit, not a source of new water.";
    case "main-pipe":
      return "Water can be lost through the network before it reaches community services.";
    case "homes":
      return "Household demand and delivered service are recorded separately by the simulation.";
    case "school":
      return "The school depends on reliable water for learners and daily activities.";
    case "clinic":
      return "The clinic has a critical service minimum defined by the mission rules.";
    case "farms":
      return "Farms need water for irrigation; allocation can involve trade-offs with other sectors.";
  }
}
