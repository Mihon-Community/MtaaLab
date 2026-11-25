import { Hospital, House, School, Wheat } from "lucide-react";
import type { ChartConfig } from "@/components/ui/chart";
import type { Sector } from "@/types/api";

/** Fixed order and colours: a sector never changes slot or hue. */
export const SECTOR_ORDER: Sector[] = [
  "households",
  "school",
  "clinic",
  "farms",
];

export const SECTOR_LABELS: Record<Sector, string> = {
  households: "Households",
  school: "School",
  clinic: "Clinic",
  farms: "Farms",
};

const SECTOR_ICONS = {
  households: House,
  school: School,
  clinic: Hospital,
  farms: Wheat,
};

export function sectorChartConfig(): ChartConfig {
  return Object.fromEntries(
    SECTOR_ORDER.map((sector, index) => [
      sector,
      {
        label: SECTOR_LABELS[sector],
        color: `var(--sector-${sector})`,
        icon: SECTOR_ICONS[sector],
        // A non-colour discriminator for lines in high-contrast mode.
        dash: ["", "6 3", "2 3", "8 3 2 3"][index] || undefined,
      },
    ]),
  );
}

export function formatNumber(value: number, decimals = 1): string {
  return Number.isInteger(value)
    ? value.toLocaleString()
    : value.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
