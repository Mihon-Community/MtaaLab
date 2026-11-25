import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LazyMotion, domAnimation } from "motion/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/lib/theme";
import { LobbyPage } from "./LobbyPage";

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  document.documentElement.className = "";
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-palette");
  document.documentElement.removeAttribute("data-contrast");
  document.documentElement.removeAttribute("data-motion");
});

function renderLobby() {
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <LazyMotion features={domAnimation}>
          <LobbyPage />
        </LazyMotion>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe("LobbyPage", () => {
  it("shows assigned missions returned by the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            missions: [
              {
                id: "mission-1",
                title: "Keep the water flowing",
                description: "Balance water needs across the community.",
                subject: "Environmental science",
                grade_band: "7–9",
                scenario_version: 1,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    renderLobby();

    expect(screen.getByRole("status")).toHaveTextContent(
      "Checking your class assignments",
    );
    expect(
      await screen.findByRole("heading", { name: "Keep the water flowing" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "View briefing for Keep the water flowing",
      }),
    ).toHaveAttribute("href", "/briefing?mission_id=mission-1");
    expect(screen.getByText("1 mission")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Welcome to Mtoni" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Explore missions" }),
    ).toHaveLength(2);
    for (const link of screen.getAllByRole("link", {
      name: "Explore missions",
    })) {
      expect(link).toHaveAttribute("href", "#missions");
    }
    expect(
      screen.getByRole("heading", { name: "How a mission works" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Systems are hard to learn about from a distance.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "A scenario you can question, not just watch.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Built around the work learners actually do.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Ready to begin?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open teacher view" }),
    ).toHaveAttribute("href", "/teacher");
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });

  it("keeps landing content visible without reveal motion when reduced motion is selected", () => {
    window.localStorage.setItem(
      "mtaalab.ui-preferences",
      JSON.stringify({
        mode: "system",
        palette: "mtoni",
        contrast: "standard",
        textScale: 1,
        motion: "reduce",
      }),
    );

    renderLobby();

    expect(
      screen
        .getByRole("heading", {
          name: "Systems are hard to learn about from a distance.",
        })
        .closest('[data-motion="reduced"]'),
    ).toBeInTheDocument();
    expect(document.querySelector('[data-motion="animated"]')).toBeNull();
  });

  it("shows the empty state when no missions are assigned", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ missions: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    renderLobby();

    expect(
      await screen.findByText("No missions are assigned to your class yet."),
    ).toBeInTheDocument();
  });

  it("offers a retry after the mission request fails", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ missions: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    renderLobby();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Check your connection and try again",
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(
        screen.getByText("No missions are assigned to your class yet."),
      ).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
