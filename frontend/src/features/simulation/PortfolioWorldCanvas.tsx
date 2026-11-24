type State = Record<string, unknown>;

interface Metric {
  label: string;
  value: number;
  maximum: number;
  unit: string;
}

function numeric(state: State, key: string): number {
  const value = state[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function metricsFor(scenarioId: string, state: State): Metric[] {
  if (scenarioId === "soko_market") {
    return [
      {
        label: "Cash",
        value: numeric(state, "cash_credits"),
        maximum: 100,
        unit: "credits",
      },
      {
        label: "Stock",
        value: numeric(state, "stock_units"),
        maximum: 20,
        unit: "units",
      },
      {
        label: "Selling price",
        value: numeric(state, "selling_price"),
        maximum: 10,
        unit: "credits",
      },
    ];
  }
  if (scenarioId === "mtoni_fever") {
    return [
      {
        label: "Safe water access",
        value: numeric(state, "safe_water_points"),
        maximum: 100,
        unit: "fictional points",
      },
      {
        label: "Handwashing access",
        value: numeric(state, "handwashing_points"),
        maximum: 100,
        unit: "fictional points",
      },
      {
        label: "Clinic readiness",
        value: numeric(state, "clinic_readiness"),
        maximum: 100,
        unit: "fictional points",
      },
    ];
  }
  if (scenarioId === "chama_circle") {
    return [
      {
        label: "Group pool",
        value: numeric(state, "pool_tokens"),
        maximum: 120,
        unit: "tokens",
      },
      {
        label: "Protected reserve",
        value: numeric(state, "reserve_tokens"),
        maximum: 100,
        unit: "tokens",
      },
      {
        label: "Outstanding",
        value: numeric(state, "outstanding_tokens"),
        maximum: 100,
        unit: "tokens",
      },
    ];
  }
  return [
    {
      label: "Reservoir",
      value: numeric(state, "reservoir_level"),
      maximum: Math.max(1, numeric(state, "reservoir_capacity")),
      unit: "fictional units",
    },
    {
      label: "Budget remaining",
      value: numeric(state, "budget_remaining"),
      maximum: 100,
      unit: "credits",
    },
    {
      label: "Leakage",
      value: numeric(state, "leakage"),
      maximum: 10,
      unit: "units",
    },
  ];
}

function titleFor(scenarioId: string): string {
  if (scenarioId === "soko_market") return "Market snapshot";
  if (scenarioId === "mtoni_fever") return "Community readiness";
  if (scenarioId === "chama_circle") return "Group ledger";
  return "Water system";
}

function format(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function PortfolioWorldCanvas({
  scenarioId,
  state,
}: {
  scenarioId: string;
  state: State;
}) {
  const metrics = metricsFor(scenarioId, state);
  const turn = numeric(state, "current_turn");
  const disclaimer =
    scenarioId === "mtoni_fever"
      ? "Fictional access and readiness indicators; these are not health outcomes."
      : scenarioId === "chama_circle"
        ? "Fictional group tokens; no real money or lending is involved."
        : scenarioId === "soko_market"
          ? "Fictional market units; values are not Kenyan shillings."
          : "Fictional community water and budget values.";

  return (
    <section
      className="portfolio-world"
      aria-label={`${titleFor(scenarioId)} at turn ${turn}`}
    >
      <div className="portfolio-world-heading">
        <div>
          <p className="eyebrow">Confirmed snapshot</p>
          <h2>{titleFor(scenarioId)}</h2>
        </div>
        <p className="world-turn">Turn {turn}</p>
      </div>
      <ul className="world-metric-grid">
        {metrics.map((metric) => {
          const progress = Math.min(
            100,
            Math.max(0, (metric.value / metric.maximum) * 100),
          );
          return (
            <li className="world-metric-card" key={metric.label}>
              <div className="world-metric-heading">
                <span>{metric.label}</span>
                <strong>{format(metric.value)}</strong>
              </div>
              <div className="world-meter" aria-hidden="true">
                <span style={{ width: `${progress}%` }} />
              </div>
              <span className="world-metric-unit">{metric.unit}</span>
            </li>
          );
        })}
      </ul>
      <p className="world-disclaimer">{disclaimer}</p>
    </section>
  );
}
