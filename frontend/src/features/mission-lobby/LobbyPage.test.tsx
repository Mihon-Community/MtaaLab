import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LobbyPage } from "./LobbyPage";

vi.mock("../../services/supabase", () => {
  const client = {
    auth: {
      getSession: async () => ({
        data: { session: { access_token: "test-token" } },
      }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
      signInWithPassword: async () => ({ error: null }),
      signOut: async () => ({ error: null }),
    },
  };
  return { getSupabaseClient: () => client };
});

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

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("LobbyPage", () => {
  it("shows assigned missions returned by the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          jsonResponse({
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
        ),
      ),
    );

    renderLobby();

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
      vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(jsonResponse({ missions: [] })),
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
      .mockImplementation(() =>
        Promise.resolve(jsonResponse({ missions: [] })),
      );
    vi.stubGlobal("fetch", fetchMock);

    renderLobby();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Check your connection and try again",
    );
    const callsBeforeRetry = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(
        screen.getByText("No missions are assigned to your class yet."),
      ).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledTimes(callsBeforeRetry + 1);
  });
});
