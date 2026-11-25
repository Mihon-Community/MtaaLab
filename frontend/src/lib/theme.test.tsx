import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  ThemeProvider,
  applyPreferences,
  clampTextScale,
  readStoredPreferences,
  useTheme,
} from "./theme";

function Probe() {
  const {
    mode,
    palette,
    contrast,
    textScale,
    motion,
    resolvedTheme,
    setMode,
    setPalette,
    setContrast,
    setTextScale,
    setMotion,
  } = useTheme();

  return (
    <div>
      <output data-testid="summary">
        {mode}|{contrast}|{textScale}|{motion}|{resolvedTheme}|{palette}
      </output>
      <button type="button" onClick={() => setMode("dark")}>
        dark
      </button>
      <button type="button" onClick={() => setMode("light")}>
        light
      </button>
      <button type="button" onClick={() => setMode("system")}>
        system
      </button>
      <button type="button" onClick={() => setPalette("ocean")}>
        ocean palette
      </button>
      <button type="button" onClick={() => setPalette("contrast")}>
        contrast palette
      </button>
      <button type="button" onClick={() => setContrast("high")}>
        high contrast
      </button>
      <button type="button" onClick={() => setMotion("reduce")}>
        reduce motion
      </button>
      <button type="button" onClick={() => setTextScale(3)}>
        huge text
      </button>
    </div>
  );
}

function renderProvider() {
  return render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
}

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.className = "";
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-palette");
  document.documentElement.removeAttribute("data-contrast");
  document.documentElement.removeAttribute("data-motion");
  document.documentElement.removeAttribute("style");
});

describe("ThemeProvider", () => {
  it("defaults to the system theme and follows the OS preference", () => {
    renderProvider();
    expect(screen.getByTestId("summary")).toHaveTextContent(
      /^system\|\w+\|1\|system\|/,
    );
    expect(document.documentElement.dataset.theme).toMatch(/^(light|dark)$/);
  });

  it("applies and persists the dark theme on <html>", () => {
    renderProvider();

    act(() => screen.getByRole("button", { name: "dark" }).click());

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(readStoredPreferences().mode).toBe("dark");
    expect(
      JSON.parse(window.localStorage.getItem("mtaalab.ui-preferences") ?? "{}"),
    ).toMatchObject({ mode: "dark" });
  });

  it("removes the dark class when switching back to light", () => {
    renderProvider();

    act(() => screen.getByRole("button", { name: "dark" }).click());
    act(() => screen.getByRole("button", { name: "light" }).click());

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(readStoredPreferences().mode).toBe("light");
  });

  it("persists high contrast and the reduced-motion override", () => {
    renderProvider();

    act(() => screen.getByRole("button", { name: "high contrast" }).click());
    act(() => screen.getByRole("button", { name: "reduce motion" }).click());

    expect(document.documentElement.dataset.contrast).toBe("high");
    expect(document.documentElement.dataset.motion).toBe("reduce");
    expect(readStoredPreferences()).toMatchObject({
      contrast: "high",
      motion: "reduce",
    });
  });

  it("clamps the text scale to the supported 90–125% range", () => {
    expect(clampTextScale(3)).toBe(1.25);
    expect(clampTextScale(0.1)).toBe(0.9);
    expect(clampTextScale(Number.NaN)).toBe(1);

    renderProvider();
    act(() => screen.getByRole("button", { name: "huge text" }).click());

    expect(
      document.documentElement.style.getPropertyValue("--text-scale"),
    ).toBe("1.25");
    expect(readStoredPreferences().textScale).toBe(1.25);
  });

  it("restores stored preferences during the first render", () => {
    window.localStorage.setItem(
      "mtaalab.ui-preferences",
      JSON.stringify({
        mode: "dark",
        contrast: "standard",
        textScale: 1.1,
        motion: "system",
      }),
    );

    renderProvider();

    expect(screen.getByTestId("summary")).toHaveTextContent(
      /^dark\|standard\|1\.1\|system\|dark\|mtoni$/,
    );
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("ignores corrupt stored preferences", () => {
    window.localStorage.setItem("mtaalab.ui-preferences", "{not json");

    expect(readStoredPreferences()).toMatchObject({
      mode: "system",
      contrast: "standard",
      textScale: 1,
      motion: "system",
    });
  });

  it("applies preferences outside React for the pre-paint script", () => {
    applyPreferences({
      mode: "dark",
      palette: "mtoni",
      contrast: "high",
      textScale: 0.95,
      motion: "reduce",
    });

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.palette).toBe("mtoni");
    expect(document.documentElement.dataset.contrast).toBe("high");
    expect(document.documentElement.dataset.motion).toBe("reduce");
    expect(
      document.documentElement.style.getPropertyValue("--text-scale"),
    ).toBe("0.95");
  });

  it("selects a brand palette independently of the light/dark mode", () => {
    renderProvider();

    act(() => screen.getByRole("button", { name: "ocean palette" }).click());

    expect(document.documentElement.dataset.palette).toBe("ocean");
    expect(document.documentElement.dataset.contrast).toBe("standard");
    expect(readStoredPreferences()).toMatchObject({
      palette: "ocean",
      mode: "system",
    });

    act(() => screen.getByRole("button", { name: "dark" }).click());

    expect(document.documentElement.dataset.palette).toBe("ocean");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("makes High Contrast a selectable palette and restores standard contrast on exit", () => {
    renderProvider();

    act(() => screen.getByRole("button", { name: "contrast palette" }).click());

    expect(document.documentElement.dataset.palette).toBe("contrast");
    expect(document.documentElement.dataset.contrast).toBe("high");
    expect(readStoredPreferences()).toMatchObject({
      palette: "contrast",
      contrast: "high",
    });

    act(() => screen.getByRole("button", { name: "ocean palette" }).click());

    expect(document.documentElement.dataset.contrast).toBe("standard");
    expect(readStoredPreferences().contrast).toBe("standard");
  });

  it("ignores an unknown stored palette", () => {
    window.localStorage.setItem(
      "mtaalab.ui-preferences",
      JSON.stringify({ palette: "chartreuse", mode: "light" }),
    );

    expect(readStoredPreferences().palette).toBe("mtoni");
  });
});
