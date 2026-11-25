import { useId, useState, type ReactElement, type ReactNode } from "react";
import { BarChart3, Table as TableIcon } from "lucide-react";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface ChartTableData {
  columns: string[];
  rows: Array<Array<string | number>>;
}

interface ChartFrameProps {
  title: string;
  /** One-sentence, value-derived summary shown under the title. */
  summary: string;
  config: ChartConfig;
  ariaLabel?: string;
  table: ChartTableData;
  children: ReactElement;
  legend?: ReactNode;
  className?: string;
}

/**
 * Shared figure wrapper: visible title, generated caption, Chart/Table toggle
 * and a table containing exactly the same numbers as the plot.
 */
export function ChartFrame({
  title,
  summary,
  config,
  ariaLabel,
  table,
  children,
  legend,
  className,
}: ChartFrameProps) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const hasData = table.rows.length > 0;
  const titleId = useId();
  const summaryId = useId();

  return (
    <figure
      aria-labelledby={`${titleId} ${summaryId}`}
      className={cn(
        "chart-frame flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <figcaption className="min-w-0 flex-1">
          <strong
            id={titleId}
            className="block text-base font-semibold leading-tight text-foreground"
          >
            {title}
          </strong>
          <span
            id={summaryId}
            className="mt-1 block text-sm leading-relaxed text-muted-foreground"
          >
            {summary}
          </span>
        </figcaption>
        {hasData ? (
          <ToggleGroup
            type="single"
            value={view}
            aria-label={`${title} view`}
            onValueChange={(next) => {
              if (next === "chart" || next === "table") setView(next);
            }}
            className="shrink-0"
          >
            <ToggleGroupItem value="chart" aria-label="Chart view">
              <BarChart3 size={14} aria-hidden="true" />
              <span className="ml-1.5">Chart</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="table" aria-label="Table view">
              <TableIcon size={14} aria-hidden="true" />
              <span className="ml-1.5">Table</span>
            </ToggleGroupItem>
          </ToggleGroup>
        ) : null}
      </div>

      {!hasData ? (
        <p
          role="status"
          className="flex min-h-40 items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 px-4 text-center text-sm text-muted-foreground"
        >
          No chart data is available yet.
        </p>
      ) : view === "chart" ? (
        <ChartContainer
          config={config}
          ariaLabel={ariaLabel ?? `${title}. ${summary}`}
        >
          {children}
        </ChartContainer>
      ) : (
        <div className="max-w-full overflow-x-auto">
          <Table>
            <caption className="sr-only">{summary}</caption>
            <TableHeader>
              <TableRow>
                {table.columns.map((column) => (
                  <TableHead key={column} scope="col">
                    {column}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.rows.map((row, rowIndex) => (
                <TableRow key={`${row[0]}-${rowIndex}`}>
                  {row.map((cell, cellIndex) =>
                    cellIndex === 0 ? (
                      <TableCell
                        key={cellIndex}
                        scope="row"
                        className="font-medium"
                      >
                        {cell}
                      </TableCell>
                    ) : (
                      <TableCell key={cellIndex} className="tabular-nums">
                        {cell}
                      </TableCell>
                    ),
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {view === "chart" && hasData && legend}
    </figure>
  );
}
