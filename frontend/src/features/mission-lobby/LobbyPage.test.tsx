import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LobbyPage } from "./LobbyPage";

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderLobby() {
  return render(
    <MemoryRouter>
      <LobbyPage />
    </MemoryRouter>,
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
        name: "Read briefing for Keep the water flowing",
      }),
    ).toHaveAttribute("href", "/briefing?mission_id=mission-1");
    expect(screen.getByText("1 mission")).toBeInTheDocument();
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
