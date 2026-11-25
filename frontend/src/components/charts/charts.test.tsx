import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { WaterAccounting } from "@/types/api";
import { ServiceLevelChart } from "./ServiceLevelChart";
import { WaterAccountingChart } from "./WaterAccountingChart";

describe("chart accessibility", () => {
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
      screen.getByRole("img", { name: /Service level by sector/ }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("Table"));
    const table = screen.getByRole("table");
    expect(within(table).getByText("Households")).toBeInTheDocument();
    expect(within(table).getByText("50%")).toBeInTheDocument();
    expect(within(table).getByText("20")).toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: /Service level by sector/ }),
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
