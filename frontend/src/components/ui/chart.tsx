import {
  createContext,
  useContext,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from "react";
import { ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { cn } from "@/lib/utils";

export interface ChartSeriesConfig {
  /** Human-readable series name, used in legends and tooltips. */
  label: string;
  /** CSS colour, normally `var(--sector-households)` or another design token. */
  color: string;
  /** Optional lucide icon so meaning is never carried by colour alone. */
  icon?: ComponentType<{ size?: number; "aria-hidden"?: boolean | "true" }>;
  /**
   * Dash pattern for high-contrast mode, where lines and bars also need a
   * non-colour discriminator.
   */
  dash?: string;
}

export type ChartConfig = Record<string, ChartSeriesConfig>;

const ChartConfigContext = createContext<ChartConfig>({});

export function useChartConfig(): ChartConfig {
  return useContext(ChartConfigContext);
}

interface ChartContainerProps {
  config: ChartConfig;
  className?: string;
  /** Accessible description for the whole plot; the visible caption lives in ChartFrame. */
  ariaLabel?: string;
  children: ReactElement;
}

/**
 * Recharts wrapper that carries the series config down to tooltips and
 * legends, and keeps every plot inside the layout box the guide requires.
 */
export function ChartContainer({
  config,
  className,
  ariaLabel,
  children,
}: ChartContainerProps) {
  return (
    <ChartConfigContext.Provider value={config}>
      <div
        role="group"
        aria-label={ariaLabel}
        data-chart="true"
        className={cn(
          "aspect-[16/9] min-h-[200px] w-full md:aspect-[2/1]",
          className,
        )}
      >
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </ChartConfigContext.Provider>
  );
}

export interface ChartTooltipItem {
  name?: string | number;
  dataKey?: string | number;
  value?: number | string;
  color?: string;
  payload?: Record<string, unknown>;
}

interface ChartTooltipContentProps {
  active?: boolean;
  label?: string | number;
  payload?: ChartTooltipItem[];
  /** Formats the tooltip heading (usually the x-axis value). */
  labelFormatter?: (label: string | number | undefined) => ReactNode;
  /** Formats each value; receives the raw value and the series key. */
  valueFormatter?: (value: number, seriesKey: string) => ReactNode;
}

export function ChartTooltipContent({
  active,
  label,
  payload,
  labelFormatter,
  valueFormatter,
}: ChartTooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="min-w-[10rem] rounded-lg border border-border bg-popover p-3 text-sm text-popover-foreground shadow-md">
      <p className="mb-2 font-semibold">
        {labelFormatter ? labelFormatter(label) : label}
      </p>
      <ul className="flex flex-col gap-1.5">
        {payload.map((item, index) => {
          const raw =
            typeof item.value === "number" ? item.value : Number(item.value);
          const seriesKey = String(item.dataKey ?? index);
          return (
            <li
              key={`${seriesKey}-${index}`}
              className="flex items-center justify-between gap-4"
            >
              <span className="flex items-center gap-2 text-muted-foreground">
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-sm"
                  style={{ background: item.color }}
                />
                {item.name ?? seriesKey}
              </span>
              <span className="font-semibold tabular-nums">
                {valueFormatter
                  ? valueFormatter(raw, seriesKey)
                  : Number.isFinite(raw)
                    ? raw.toLocaleString()
                    : "—"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface ChartTooltipProps {
  labelFormatter?: (label: string | number | undefined) => ReactNode;
  valueFormatter?: (value: number, seriesKey: string) => ReactNode;
}

/** Tooltip bound to the container's series config; works on hover, focus and tap. */
export function ChartTooltip({
  labelFormatter,
  valueFormatter,
}: ChartTooltipProps) {
  return (
    <RechartsTooltip
      cursor={{ fill: "var(--muted)", opacity: 0.5 }}
      content={(props) => (
        <ChartTooltipContent
          active={props.active}
          label={props.label}
          payload={props.payload as unknown as ChartTooltipItem[] | undefined}
          labelFormatter={labelFormatter}
          valueFormatter={valueFormatter}
        />
      )}
    />
  );
}

interface ChartLegendProps {
  /** Series keys to list, in visual order. Defaults to every configured key. */
  keys?: string[];
  className?: string;
}

/** Always-visible legend: colour swatch, icon and text label. */
export function ChartLegend({ keys, className }: ChartLegendProps) {
  const config = useChartConfig();
  const entries = (keys ?? Object.keys(config))
    .map((key) => ({ key, series: config[key] }))
    .filter((entry): entry is { key: string; series: ChartSeriesConfig } =>
      Boolean(entry.series),
    );

  if (entries.length === 0) return null;

  return (
    <ul
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs",
        className,
      )}
    >
      {entries.map(({ key, series }) => {
        const Icon = series.icon;
        return (
          <li
            key={key}
            className="flex items-center gap-1.5 text-muted-foreground"
          >
            <span
              aria-hidden="true"
              className="size-2.5 rounded-sm"
              style={{ background: series.color }}
            />
            {Icon ? <Icon size={14} aria-hidden="true" /> : null}
            <span>{series.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
