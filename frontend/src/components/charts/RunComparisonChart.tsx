import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import { House, School } from "lucide-react";
import { ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import {
  useHighContrastPreference,
  useReducedMotionPreference,
} from "@/lib/theme";
import type { HistoryEntry, MissionReport, Sector } from "@/types/api";
import { ChartFrame } from "./ChartFrame";
import { formatNumber, SECTOR_LABELS, SECTOR_ORDER } from "./chartData";

interface RunComparisonChartProps {
  original: MissionReport;
  alternative: MissionReport;
  originalHistory?: HistoryEntry[];
  alternativeHistory?: HistoryEntry[];
  waterUnit: string;
}

const comparisonConfig: ChartConfig = {
  original: {
    label: "Original run",
    color: "var(--sector-households)",
    icon: House,
  },
  alternative: {
    label: "Alternative run",
    color: "var(--sector-school)",
    icon: School,
    dash: "6 3",
  },
};

interface MetricRow {
  metric: string;
  original: number;
  alternative: number;
}

function buildRows(
  original: MissionReport,
  alternative: MissionReport,
): MetricRow[] {
  return [
    {
      metric: "Reservoir",
      original: original.outcomes.reservoir_level,
      alternative: alternative.outcomes.reservoir_level,
    },
    {
      metric: "Budget",
      original: original.outcomes.budget_remaining,
      alternative: alternative.outcomes.budget_remaining,
    },
    {
      metric: "Wellbeing",
      original: original.outcomes.wellbeing,
      alternative: alternative.outcomes.wellbeing,
    },
    {
      metric: "Crop health",
      original: original.outcomes.crop_health,
      alternative: alternative.outcomes.crop_health,
    },
    ...SECTOR_ORDER.map((sector: Sector) => ({
      metric: `${SECTOR_LABELS[sector]} service`,
      original: original.outcomes.service_levels[sector] * 100,
      alternative: alternative.outcomes.service_levels[sector] * 100,
    })),
  ];
}

/** Grouped bars per outcome (slot 1 vs slot 2) plus paired reservoir lines. */
export function RunComparisonChart({
  original,
  alternative,
  originalHistory = [],
  alternativeHistory = [],
  waterUnit,
}: RunComparisonChartProps) {
  const reducedMotion = useReducedMotionPreference();
  const highContrast = useHighContrastPreference();
  const rows = buildRows(original, alternative);
  const originalReservoir = formatNumber(original.outcomes.reservoir_level);
  const alternativeReservoir = formatNumber(
    alternative.outcomes.reservoir_level,
  );
  const summary = `The original run ended with ${originalReservoir} ${waterUnit} in the reservoir; the alternative ended with ${alternativeReservoir}. All values come from the two saved reports.`;

  const linePoints = originalHistory.map((entry, index) => ({
    turn: `Turn ${entry.turn + 1}`,
    original: entry.state.reservoir_level,
    alternative: alternativeHistory[index]?.state.reservoir_level,
  }));
  const hasLineData = linePoints.some(
    (point) => typeof point.alternative === "number",
  );

  return (
    <div className="chart-group flex flex-col gap-6">
      <ChartFrame
        title="Outcome comparison"
        summary={summary}
        config={comparisonConfig}
        table={{
          columns: ["Indicator", "Original", "Alternative", "Difference"],
          rows: rows.map((row) => [
            row.metric,
            formatNumber(row.original),
            formatNumber(row.alternative),
            `${row.alternative - row.original > 0 ? "+" : ""}${formatNumber(row.alternative - row.original)}`,
          ]),
        }}
      >
        <BarChart
          data={rows}
          margin={{ top: 8, right: 8, bottom: 48, left: 0 }}
        >
          <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
          <XAxis
            dataKey="metric"
            tick={{ fontSize: 10 }}
            stroke="var(--muted-foreground)"
            interval={0}
            angle={-30}
            textAnchor="end"
            height={48}
          />
          <YAxis
            width={48}
            tick={{ fontSize: 11 }}
            stroke="var(--muted-foreground)"
            tickFormatter={(value: number) => formatNumber(value, 0)}
          />
          <ChartTooltip valueFormatter={(value) => formatNumber(value)} />
          <Legend />
          <Bar
            dataKey="original"
            name="Original run"
            fill="var(--sector-households)"
            radius={[4, 4, 0, 0]}
            isAnimationActive={!reducedMotion}
          />
          <Bar
            dataKey="alternative"
            name="Alternative run"
            fill="var(--sector-school)"
            radius={[4, 4, 0, 0]}
            isAnimationActive={!reducedMotion}
          />
        </BarChart>
      </ChartFrame>

      {hasLineData ? (
        <ChartFrame
          title="Reservoir across turns"
          summary={`Both runs start from the same saved initial state; by the last recorded turn the original held ${originalReservoir} and the alternative ${alternativeReservoir} ${waterUnit}.`}
          config={comparisonConfig}
          table={{
            columns: [
              "Turn",
              `Original (${waterUnit})`,
              `Alternative (${waterUnit})`,
            ],
            rows: linePoints.map((point) => [
              point.turn,
              point.original,
              point.alternative ?? "—",
            ]),
          }}
        >
          <LineChart
            data={linePoints}
            margin={{ top: 8, right: 8, bottom: 4, left: 0 }}
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
              valueFormatter={(value) => `${formatNumber(value)} ${waterUnit}`}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="original"
              name="Original run"
              stroke="var(--sector-households)"
              strokeWidth={2}
              dot={{ r: 4 }}
              isAnimationActive={!reducedMotion}
            />
            <Line
              type="monotone"
              dataKey="alternative"
              name="Alternative run"
              stroke="var(--sector-school)"
              strokeWidth={2}
              strokeDasharray={highContrast ? "6 3" : undefined}
              dot={{ r: 4 }}
              isAnimationActive={!reducedMotion}
            />
          </LineChart>
        </ChartFrame>
      ) : null}
    </div>
  );
}
