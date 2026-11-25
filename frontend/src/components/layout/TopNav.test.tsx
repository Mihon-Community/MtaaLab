import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { ThemeProvider } from "@/lib/theme";
import { TopNav } from "./TopNav";

function renderNav(url = "/simulation?session_id=session-1") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <SidebarProvider>
        <ThemeProvider>
          <TopNav />
        </ThemeProvider>
      </SidebarProvider>
    </MemoryRouter>,
  );
}

describe("top navigation", () => {
  it("shows branding, the current page, account controls and the theme selector", () => {
    renderNav();

    expect(screen.getByRole("link", { name: "MtaaLab home" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByText("Simulation")).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("button", { name: "Account controls" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Display settings" }),
    ).toBeInTheDocument();
  });

  it("states plainly when sign-in is not configured", async () => {
    renderNav("/");

    fireEvent.keyDown(
      screen.getByRole("button", { name: "Account controls" }),
      { key: "Enter" },
    );

    expect(
      await screen.findByText("Sign-in is not configured for this installation."),
    ).toBeInTheDocument();
  });
});
