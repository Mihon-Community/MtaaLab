import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library only auto-cleans when Vitest runs with globals enabled; this
// suite imports APIs explicitly, so unmount between tests here.
afterEach(() => {
  cleanup();
});

// Recharts' ResponsiveContainer measures its box with ResizeObserver, which
// jsdom does not implement. Charts still render with zero width in tests; the
// assertions target the accessible table and captions, not pixel sizes.
if (typeof window !== "undefined" && !window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
