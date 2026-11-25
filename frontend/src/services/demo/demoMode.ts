/**
 * Explicit local-demo switch.
 *
 * The demo transport must never run implicitly in a production build or in the
 * automated test suite, so it is opt-in through VITE_USE_MOCKS and is always
 * disabled while Vitest is running.
 */
export function isDemoMode(): boolean {
  if (import.meta.env.MODE === "test") return false;
  const flag = import.meta.env.VITE_USE_MOCKS;
  return flag === "true" || flag === "1";
}
