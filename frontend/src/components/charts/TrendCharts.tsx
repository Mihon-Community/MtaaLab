import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Coins, Waves } from "lucide-react";
import { ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import {
  useHighContrastPreference,
  useReducedMotionPreference,
} from "@/lib/theme";
import type { HistoryEntry } from "@/types/api";
import { ChartFrame } from "./ChartFrame";
import { formatNumber } from "./chartData";

interface TrendChartProps {
  entries: HistoryEntry[];
  unit: string;
  loading?: boolean;
}

type TrendKey = "reservoir_level" | "budget_remaining";

const TREND_META = {
  reservoir_level: {
    label: "Reservoir",
    icon: Waves,
    color: "var(--sector-households)",
    noun: "water units",
  },
  budget_remaining: {
    label: "Budget remaining",
    icon: Coins,
    color: "var(--sector-school)",
    noun: "credits",
  },
} as const;

function TrendChart({
  entries,
  unit,
  loading = false,
  dataKey,
}: TrendChartProps & { dataKey: TrendKey }) {
  const meta = TREND_META[dataKey];
  const reducedMotion = useReducedMotionPreference();
  const highContrast = useHighContrastPreference();
  const points = entries.map((entry) => ({
    turn: `Turn ${entry.turn + 1}`,
    value: entry.state[dataKey],
  }));
  const config: ChartConfig = {
    [dataKey]: {
      label: meta.label,
      color: meta.color,
      icon: meta.icon,
      dash: highContrast ? "6 3" : undefined,
    },
  };
  const first = points[0]?.value;
  const last = points[points.length - 1]?.value;
  const summary =
    first === undefined || last === undefined
      ? `No confirmed ${meta.label.toLowerCase()} history is available yet.`
      : `${meta.label} went from ${formatNumber(first)} to ${formatNumber(last)} ${unit || meta.noun} across ${points.length} recorded ${points.length === 1 ? "turn" : "turns"}.`;

  return (
    <ChartFrame
      title={`${meta.label} over turns`}
      summary={summary}
      config={config}
      loading={loading}
      table={{
        columns: ["Turn", `${meta.label} (${unit || meta.noun})`],
        rows: points.map((point) => [point.turn, point.value]),
      }}
    >
      <LineChart
        accessibilityLayer
        data={points}
        margin={{ top: 8, right: 16, bottom: 4, left: 0 }}
      >
        <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
        <XAxis
          dataKey="turn"
          tick={{ fontSize: 11 }}
          stroke="var(--muted-foreground)"
        />
        <YAxis
          width={56}
          tick={{ fontSize: 11 }}
          stroke="var(--muted-foreground)"
          tickFormatter={(value: number) => formatNumber(value, 0)}
        />
        <ChartTooltip
          valueFormatter={(value) =>
            `${formatNumber(value)} ${unit || meta.noun}`
          }
        />
        <Line
          type="monotone"
          dataKey="value"
          name={meta.label}
          stroke={meta.color}
          strokeWidth={2}
          strokeDasharray={highContrast ? "6 3" : undefined}
          dot={{ r: 4, fill: meta.color }}
          activeDot={{ r: 6 }}
          isAnimationActive={!reducedMotion}
        />
      </LineChart>
    </ChartFrame>
  );
}

/** Reservoir levels from GET .../history; never a forecast. */
export function ReservoirTrendChart({
  entries,
  unit,
  loading,
}: TrendChartProps) {
  return (
    <TrendChart
      entries={entries}
      unit={unit}
      loading={loading}
      dataKey="reservoir_level"
    />
  );
}

/** Budget values from GET .../history, on their own axis. */
export function BudgetTrendChart({ entries, unit, loading }: TrendChartProps) {
  return (
    <TrendChart
      entries={entries}
      unit={unit}
      loading={loading}
      dataKey="budget_remaining"
    />
  );
}
