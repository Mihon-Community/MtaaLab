import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  XAxis,
  YAxis,
} from "recharts";
import { CloudRain, Droplets } from "lucide-react";
import { ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { useReducedMotionPreference } from "@/lib/theme";
import type { Sector, WaterAccounting } from "@/types/api";
import { ChartFrame } from "./ChartFrame";
import {
  formatNumber,
  SECTOR_LABELS,
  SECTOR_ORDER,
  sectorChartConfig,
} from "./chartData";

interface WaterAccountingChartProps {
  accounting: WaterAccounting;
  waterUnit: string;
}

/**
 * Horizontal bars for the one-turn ledger returned by the API. Inflow,
 * sector withdrawals, leakage and overflow are all server-confirmed values.
 */
export function WaterAccountingChart({
  accounting,
  waterUnit,
}: WaterAccountingChartProps) {
  const reducedMotion = useReducedMotionPreference();
  const config: ChartConfig = {
    inflow: { label: "Inflow", color: "var(--primary)", icon: CloudRain },
    leakage: {
      label: "Leakage",
      color: "var(--destructive)",
      icon: Droplets,
    },
    overflow: {
      label: "Overflow",
      color: "var(--muted-foreground)",
      icon: Droplets,
    },
    ...sectorChartConfig(),
  };

  const rows = [
    { key: "inflow", label: "Inflow", value: accounting.inflow },
    ...SECTOR_ORDER.map((sector: Sector) => ({
      key: sector,
      label: SECTOR_LABELS[sector],
      value: accounting.withdrawals_by_sector[sector],
    })),
    { key: "leakage", label: "Leakage", value: accounting.leakage },
    { key: "overflow", label: "Overflow", value: accounting.overflow },
  ];
  const delivered = SECTOR_ORDER.reduce(
    (sum, sector) => sum + accounting.withdrawals_by_sector[sector],
    0,
  );
  const summary = `The confirmed turn recorded ${formatNumber(accounting.inflow)} ${waterUnit} inflow, ${formatNumber(delivered)} delivered to sectors, ${formatNumber(accounting.leakage)} lost to leakage and ${formatNumber(accounting.overflow)} overflow.`;

  return (
    <ChartFrame
      title="One-turn water balance"
      summary={summary}
      config={config}
      table={{
        columns: ["Item", `Value (${waterUnit})`],
        rows: rows.map((row) => [row.label, row.value]),
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
          tick={{ fontSize: 11 }}
          stroke="var(--muted-foreground)"
          tickFormatter={(value: number) => formatNumber(value, 0)}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={96}
          tick={{ fontSize: 11 }}
          stroke="var(--muted-foreground)"
        />
        <ChartTooltip
          valueFormatter={(value) => `${formatNumber(value)} ${waterUnit}`}
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
            formatter={(value) => formatNumber(Number(value ?? 0), 0)}
          />
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}
