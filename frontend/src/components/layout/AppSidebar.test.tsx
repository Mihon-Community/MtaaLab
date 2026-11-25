import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";

function mockViewport({ mobile }: { mobile: boolean }) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: mobile && query.includes("max-width: 767px"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

function mockTablet() {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.includes("min-width: 768px"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

function renderShell(url = "/report?session_id=session-1") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarTrigger />
      </SidebarProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = "sidebar_state=; max-age=0; path=/";
});

describe("app navigation", () => {
  it("preserves the active session in every nav link", () => {
    mockViewport({ mobile: false });
    renderShell("/simulation?session_id=session-1&mission_id=mission-2");

    expect(
      screen.getByRole("link", { name: "Learning report" }),
    ).toHaveAttribute("href", "/report?session_id=session-1");
    expect(screen.getByRole("link", { name: "Replay" })).toHaveAttribute(
      "href",
      "/replay?source_session_id=session-1&mission_id=mission-2",
    );
    expect(screen.getByRole("link", { name: "Simulation" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("disables session routes with a visible reason before a mission starts", () => {
    mockViewport({ mobile: false });
    renderShell("/briefing");

    const simulation = screen.getAllByTitle("Start a mission first")[0];
    expect(simulation).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByRole("link", { name: "Simulation" })).toBeNull();
  });

  it("collapses the desktop sidebar and persists the choice in a cookie", async () => {
    mockViewport({ mobile: false });
    renderShell();

    const trigger = screen.getAllByRole("button", {
      name: "Collapse sidebar",
    })[0];
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(trigger);

    await waitFor(() => {
      expect(
        screen.getAllByRole("button", { name: "Expand sidebar" })[0],
      ).toHaveAttribute("aria-expanded", "false");
    });
    expect(document.cookie).toContain("sidebar_state=closed");
  });

  it("starts tablets with the keyboard-accessible icon rail", () => {
    mockTablet();
    renderShell();

    const trigger = screen.getAllByRole("button", {
      name: "Expand sidebar",
    })[0];
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.getByRole("link", { name: "Learning report" }),
    ).toHaveAttribute("aria-label", "Learning report");
  });

  it("opens navigation as a sheet on phones, closes on Escape and returns focus", async () => {
    mockViewport({ mobile: true });
    renderShell("/report?session_id=session-1");

    const trigger = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(trigger);

    const sheet = await screen.findByRole("dialog");
    expect(
      within(sheet).getByRole("link", { name: "Mission lobby" }),
    ).toHaveAttribute("href", "/");

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });
});
