import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ThemeProvider } from "@/lib/theme";
import { DisplaySettings } from "./DisplaySettings";

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.className = "";
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-palette");
  document.documentElement.removeAttribute("data-contrast");
});

function renderSettings() {
  return render(
    <ThemeProvider>
      <DisplaySettings />
    </ThemeProvider>,
  );
}

describe("display settings", () => {
  it("offers all six themes and applies the selected palette", async () => {
    renderSettings();

    const trigger = screen.getByRole("button", { name: "Display settings" });
    fireEvent.keyDown(trigger, { key: "Enter" });

    const options = await screen.findAllByRole("menuitemradio");
    expect(options.map((option) => option.textContent)).toEqual(
      expect.arrayContaining([
        "Mtoni Green",
        "Ocean Blue",
        "Savanna Gold",
        "Terracotta",
        "Jacaranda",
        "High Contrast",
      ]),
    );

    fireEvent.click(screen.getByRole("menuitemradio", { name: "Ocean Blue" }));

    expect(document.documentElement.dataset.palette).toBe("ocean");
    expect(
      JSON.parse(window.localStorage.getItem("mtaalab.ui-preferences") ?? "{}"),
    ).toMatchObject({ palette: "ocean" });
  });

  it("marks the active theme with aria-checked", async () => {
    renderSettings();

    const trigger = screen.getByRole("button", { name: "Display settings" });
    fireEvent.keyDown(trigger, { key: "Enter" });

    const jacaranda = await screen.findByRole("menuitemradio", {
      name: "Jacaranda",
    });
    expect(jacaranda).toHaveAttribute("aria-checked", "false");
    fireEvent.click(jacaranda);

    expect(document.documentElement.dataset.palette).toBe("jacaranda");
    expect(
      JSON.parse(window.localStorage.getItem("mtaalab.ui-preferences") ?? "{}"),
    ).toMatchObject({ palette: "jacaranda" });
  });
});
