import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("renders the mission lobby with the app shell", async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("link", { name: "Skip to content" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", {
        name: "A living world, shaped by your choices.",
      }),
    ).toBeInTheDocument();
  });

  it("renders a real 404 page for unknown routes", async () => {
    render(
      <MemoryRouter initialEntries={["/does-not-exist"]}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", {
        name: "This page is not part of the simulation.",
      }),
    ).toBeInTheDocument();
    const main = screen.getByRole("main");
    expect(
      within(main).getByRole("link", { name: /Mission lobby/i }),
    ).toHaveAttribute("href", "/");
  });

  it("announces the current page and disables session routes before a start", async () => {
    render(
      <MemoryRouter initialEntries={["/briefing"]}>
        <App />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: /briefing|Mission/i });
    const locked = await screen.findAllByTitle("Start a mission first");
    expect(locked.length).toBeGreaterThan(0);
  });
});
