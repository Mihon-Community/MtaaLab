/**
 * Declarative scenario metric mapping shared by the portfolio canvas, report,
 * and replay comparison. Adding a scenario is a data change, not a layout one.
 */

export interface ScenarioMetricDefinition {
  key: string;
  label: string;
  unit: string;
  maximum?: (state: Record<string, unknown>) => number;
}

type UnitOverrides = Record<string, string>;

export function stateRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function numericValue(
  state: Record<string, unknown>,
  key: string,
): number {
  const value = state[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function percentage(): string {
  return "%";
}

export function metricsForScenario(
  scenarioId: string,
  units: UnitOverrides = {},
): ScenarioMetricDefinition[] {
  if (scenarioId === "soko_market") {
    return [
      {
        key: "cash_credits",
        label: "Cash",
        unit: units.cash ?? "credits",
      },
      {
        key: "stock_units",
        label: "Stock",
        unit: units.stock ?? "units",
      },
      {
        key: "selling_price",
        label: "Selling price",
        unit: units.cash ?? "credits",
      },
      {
        key: "total_sold",
        label: "Units sold",
        unit: units.stock ?? "units",
      },
      {
        key: "total_spoiled",
        label: "Spoiled units",
        unit: units.stock ?? "units",
      },
    ];
  }
  if (scenarioId === "mtoni_fever") {
    return [
      {
        key: "safe_water_points",
        label: "Safe water access",
        unit: units.access ?? "points",
      },
      {
        key: "handwashing_points",
        label: "Handwashing access",
        unit: units.access ?? "points",
      },
      {
        key: "clinic_readiness",
        label: "Clinic readiness",
        unit: units.access ?? "points",
      },
      {
        key: "budget_tokens",
        label: "Budget remaining",
        unit: units.budget ?? "tokens",
      },
    ];
  }
  if (scenarioId === "chama_circle") {
    return [
      {
        key: "pool_tokens",
        label: "Group pool",
        unit: units.fund ?? "tokens",
      },
      {
        key: "reserve_tokens",
        label: "Protected reserve",
        unit: units.fund ?? "tokens",
      },
      {
        key: "outstanding_tokens",
        label: "Outstanding",
        unit: units.fund ?? "tokens",
      },
      {
        key: "repayments_received",
        label: "Repayments received",
        unit: units.fund ?? "tokens",
      },
      {
        key: "delayed_tokens",
        label: "Delayed repayment",
        unit: units.fund ?? "tokens",
      },
    ];
  }
  return [
    {
      key: "reservoir_level",
      label: "Reservoir",
      unit: units.water ?? "water units",
      maximum: (state) =>
        Math.max(1, numericValue(state, "reservoir_capacity")),
    },
    {
      key: "budget_remaining",
      label: "Budget remaining",
      unit: units.budget ?? "credits",
    },
    {
      key: "leakage",
      label: "Leakage",
      unit: units.water ?? "water units",
    },
    {
      key: "wellbeing",
      label: "Community wellbeing",
      unit: percentage(),
    },
    {
      key: "crop_health",
      label: "Crop health",
      unit: percentage(),
    },
  ];
}

export function metricDisplayValue(
  metric: ScenarioMetricDefinition,
  state: Record<string, unknown>,
): string {
  const value = formatNumber(numericValue(state, metric.key));
  if (metric.key === "reservoir_level") {
    const capacity = formatNumber(numericValue(state, "reservoir_capacity"));
    return `${value} / ${capacity} ${metric.unit}`;
  }
  return metric.unit === "%" ? `${value}%` : `${value} ${metric.unit}`.trim();
}

export function scenarioTitle(scenarioId: string): string {
  if (scenarioId === "soko_market") return "Market snapshot";
  if (scenarioId === "mtoni_fever") return "Community readiness";
  if (scenarioId === "chama_circle") return "Group ledger";
  return "Water system";
}

export function scenarioDisclaimer(scenarioId: string): string {
  if (scenarioId === "mtoni_fever")
    return "Fictional access and readiness indicators; these are not health outcomes.";
  if (scenarioId === "chama_circle")
    return "Fictional group tokens; no real money or lending is involved.";
  if (scenarioId === "soko_market")
    return "Fictional market units; values are not Kenyan shillings.";
  return "Fictional community water and budget values.";
}
