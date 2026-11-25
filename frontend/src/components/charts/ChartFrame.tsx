import { useState, type ReactElement } from "react";
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
  className,
}: ChartFrameProps) {
  const [view, setView] = useState<"chart" | "table">("chart");

  return (
    <figure className={cn("chart-frame flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <figcaption className="min-w-0 flex-1">
          <strong className="block text-sm font-semibold text-foreground">
            {title}
          </strong>
          <span className="block text-sm text-muted-foreground">{summary}</span>
        </figcaption>
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
      </div>

      {view === "chart" ? (
        <ChartContainer
          config={config}
          ariaLabel={ariaLabel ?? `${title}. ${summary}`}
        >
          {children}
        </ChartContainer>
      ) : (
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
      )}
    </figure>
  );
}
