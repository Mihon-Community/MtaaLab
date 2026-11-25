import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  XAxis,
  YAxis,
} from "recharts";
import { ChartTooltip } from "@/components/ui/chart";
import { useReducedMotionPreference } from "@/lib/theme";
import type { Sector } from "@/types/api";
import { ChartFrame } from "./ChartFrame";
import {
  formatNumber,
  formatPercent,
  SECTOR_LABELS,
  SECTOR_ORDER,
  sectorChartConfig,
} from "./chartData";

interface ServiceLevelChartProps {
  serviceLevels: Record<Sector, number>;
  unmetDemand?: Record<Sector, number>;
}

/** Service level by sector; direct labels and a table keep low-contrast hues readable. */
export function ServiceLevelChart({
  serviceLevels,
  unmetDemand,
}: ServiceLevelChartProps) {
  const reducedMotion = useReducedMotionPreference();
  const config = sectorChartConfig();
  const rows = SECTOR_ORDER.map((sector) => ({
    key: sector,
    sector: SECTOR_LABELS[sector],
    value: Math.round(serviceLevels[sector] * 100),
    unmet: unmetDemand ? formatNumber(unmetDemand[sector]) : undefined,
  }));
  const highest = rows.reduce((best, row) =>
    row.value > best.value ? row : best,
  );
  const lowest = rows.reduce((best, row) =>
    row.value < best.value ? row : best,
  );
  const summary = `Confirmed service levels range from ${lowest.value}% for ${lowest.sector} to ${highest.value}% for ${highest.sector}.`;

  return (
    <ChartFrame
      title="Service level by sector"
      summary={summary}
      config={config}
      table={{
        columns: unmetDemand
          ? ["Sector", "Service level", "Unmet demand"]
          : ["Sector", "Service level"],
        rows: rows.map((row) =>
          unmetDemand
            ? [row.sector, `${row.value}%`, row.unmet ?? "—"]
            : [row.sector, `${row.value}%`],
        ),
      }}
    >
      <BarChart
        data={rows}
        layout="vertical"
        margin={{ top: 4, right: 56, bottom: 4, left: 4 }}
      >
        <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
        <XAxis
          type="number"
          domain={[0, 100]}
          tick={{ fontSize: 11 }}
          stroke="var(--muted-foreground)"
          tickFormatter={(value: number) => `${value}%`}
        />
        <YAxis
          type="category"
          dataKey="sector"
          width={96}
          tick={{ fontSize: 11 }}
          stroke="var(--muted-foreground)"
        />
        <ChartTooltip
          valueFormatter={(value) =>
            `${formatNumber(value)}%${unmetDemand ? " service" : ""}`
          }
        />
        <Bar
          dataKey="value"
          radius={[0, 4, 4, 0]}
          isAnimationActive={!reducedMotion}
        >
          {rows.map((row) => (
            <Cell key={row.key} fill={config[row.key]?.color} />
          ))}
          <LabelList
            dataKey="value"
            position="right"
            formatter={(value) => formatPercent(Number(value ?? 0) / 100)}
          />
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}
