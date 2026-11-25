import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PALETTES } from "@/lib/palettes";
import { ThemeProvider, useTheme } from "@/lib/theme";
import type { WaterAccounting } from "@/types/api";
import { ChartFrame } from "./ChartFrame";
import { ServiceLevelChart } from "./ServiceLevelChart";
import { WaterAccountingChart } from "./WaterAccountingChart";

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.className = "";
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-palette");
  document.documentElement.removeAttribute("data-contrast");
  document.documentElement.removeAttribute("data-motion");
  document.documentElement.removeAttribute("style");
});

function PaletteChart() {
  const { setPalette } = useTheme();
  return (
    <>
      {PALETTES.map(({ id, label }) => (
        <button key={id} type="button" onClick={() => setPalette(id)}>
          {label}
        </button>
      ))}
      <ServiceLevelChart
        serviceLevels={{
          households: 0.5,
          school: 0.8,
          clinic: 0.6,
          farms: 0.4,
        }}
      />
    </>
  );
}

describe("chart accessibility", () => {
  it("keeps the chart frame and token-based plot available in all six themes", () => {
    render(
      <ThemeProvider>
        <PaletteChart />
      </ThemeProvider>,
    );

    const frame = screen.getByRole("figure", {
      name: /Service level by sector/,
    });
    expect(frame).toHaveClass("bg-card", "border");

    for (const palette of PALETTES) {
      fireEvent.click(screen.getByRole("button", { name: palette.label }));
      expect(document.documentElement.dataset.palette).toBe(palette.id);
      expect(
        within(frame).getByRole("group", {
          name: /Service level by sector/,
        }),
      ).toBeInTheDocument();
    }
  });

  it("shows a clear empty state instead of an empty plot or table", () => {
    render(
      <ChartFrame
        title="Reservoir over turns"
        summary="No confirmed reservoir history is available yet."
        config={{}}
        table={{ columns: ["Turn", "Reservoir"], rows: [] }}
      >
        <div />
      </ChartFrame>,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "No chart data is available yet.",
    );
    expect(screen.queryByRole("group")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("group", { name: /view/ })).toBeNull();
  });

  it("generates a caption from the API values and offers an identical table", () => {
    render(
      <ServiceLevelChart
        serviceLevels={{
          households: 0.5,
          school: 0.8,
          clinic: 0.6,
          farms: 0.4,
        }}
        unmetDemand={{
          households: 12,
          school: 4,
          clinic: 6,
          farms: 20,
        }}
      />,
    );

    expect(
      screen.getByText(/range from 40% for Farms to 80% for School/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: /Service level by sector/ }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("Table"));
    const table = screen.getByRole("table");
    expect(within(table).getByText("Households")).toBeInTheDocument();
    expect(within(table).getByText("50%")).toBeInTheDocument();
    expect(within(table).getByText("20")).toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: /Service level by sector/ }),
    ).toBeNull();
  });

  it("plots only the confirmed one-turn ledger values", () => {
    const accounting: WaterAccounting = {
      opening_reservoir: 60,
      inflow: 5,
      closing_reservoir: 14,
      withdrawals_by_sector: {
        households: 20,
        school: 12,
        clinic: 10,
        farms: 7,
      },
      leakage: 2,
      overflow: 0,
    };
    render(
      <WaterAccountingChart accounting={accounting} waterUnit="water units" />,
    );

    expect(
      screen.getByText(
        /5 water units inflow, 49 delivered to sectors, 2 lost to leakage/,
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("Table"));
    const table = screen.getByRole("table");
    expect(within(table).getByText("Leakage")).toBeInTheDocument();
    expect(within(table).getByText("2")).toBeInTheDocument();
    expect(within(table).getByText("Households")).toBeInTheDocument();
    expect(within(table).getByText("20")).toBeInTheDocument();
  });
});
