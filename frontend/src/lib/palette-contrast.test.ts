import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PALETTE_IDS, PALETTES } from "./palettes";

const css = readFileSync("src/styles/index.css", "utf8");

interface TokenBlock {
  selectors: string[];
  tokens: Record<string, string>;
}

const blocks: TokenBlock[] = [];
for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  // Declarations and Tailwind directives precede many selectors; the selector
  // is always the last non-empty line before the opening brace.
  const rawSelector = match[1].trim().split("\n").pop()?.trim() ?? "";
  const selector = rawSelector.replace(/\/\*.*?\*\//g, "").trim();
  if (selector.startsWith("@") || !selector) continue;
  const tokens: Record<string, string> = {};
  for (const declaration of match[2].split(";")) {
    const [rawName, ...parts] = declaration.split(":");
    if (!rawName || parts.length === 0) continue;
    const name = rawName.replace(/\/\*.*?\*\//g, "").trim();
    if (!name.startsWith("--")) continue;
    tokens[name.replace(/^--/, "")] = parts.join(":").trim();
  }
  blocks.push({
    selectors: selector.split(",").map((part) => part.trim()),
    tokens,
  });
}

function tokensFor(...selectors: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const block of blocks) {
    if (block.selectors.some((selector) => selectors.includes(selector))) {
      Object.assign(result, block.tokens);
    }
  }
  return result;
}

function luminance(hex: string): number {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((char) => char + char)
          .join("")
      : value;
  const channels = [0, 2, 4].map((index) => {
    const channel = Number.parseInt(full.slice(index, index + 2), 16) / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const TEXT_PAIRS: Array<[string, string]> = [
  ["foreground", "background"],
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["muted-foreground", "muted"],
  ["muted-foreground", "background"],
  ["primary-foreground", "primary"],
  ["secondary-foreground", "secondary"],
  ["accent-foreground", "accent"],
  ["destructive-foreground", "destructive"],
  ["sidebar-foreground", "sidebar"],
  ["sidebar-primary-foreground", "sidebar-primary"],
  ["sidebar-accent-foreground", "sidebar-accent"],
];

function paletteTokens(id: string, dark: boolean) {
  if (id === "mtoni") {
    return dark ? tokensFor(":root", ".dark") : tokensFor(":root");
  }
  if (id === "contrast") {
    return dark
      ? tokensFor(
          ":root",
          ".dark",
          '[data-contrast="high"]',
          '[data-contrast="high"].dark',
          '.dark[data-contrast="high"]',
        )
      : tokensFor(":root", '[data-contrast="high"]');
  }
  const brand = `[data-palette="${id}"]`;
  return dark
    ? tokensFor(":root", ".dark", brand, `${brand}.dark`)
    : tokensFor(":root", brand);
}

describe("theme palettes", () => {
  it("provides CSS blocks for all six selectable themes", () => {
    expect(PALETTE_IDS).toHaveLength(6);
    expect(PALETTES.map((option) => option.label)).toEqual([
      "Mtoni Green",
      "Ocean Blue",
      "Savanna Gold",
      "Terracotta",
      "Jacaranda",
      "High Contrast",
    ]);
    for (const id of PALETTE_IDS) {
      if (id === "mtoni" || id === "contrast") continue;
      expect(tokensFor(`[data-palette="${id}"]`).primary).toBeTruthy();
      expect(tokensFor(`.dark[data-palette="${id}"]`).primary).toBeTruthy();
    }
  });

  for (const id of PALETTE_IDS) {
    for (const dark of [false, true]) {
      it(`keeps ${id} ${dark ? "dark" : "light"} text at AA contrast`, () => {
        const tokens = paletteTokens(id, dark);
        for (const [foreground, background] of TEXT_PAIRS) {
          const fg = tokens[foreground];
          const bg = tokens[background];
          expect(fg, `${foreground} must be a hex token`).toMatch(
            /^#[0-9a-f]{6}$/i,
          );
          expect(bg, `${background} must be a hex token`).toMatch(
            /^#[0-9a-f]{6}$/i,
          );
          expect(
            contrast(fg, bg),
            `${id} ${dark ? "dark" : "light"}: ${foreground} on ${background}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
        expect(
          contrast(tokens.ring, tokens.background),
          `${id}: focus ring against the page`,
        ).toBeGreaterThanOrEqual(3);
      });
    }
  }
});
