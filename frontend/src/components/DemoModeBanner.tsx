import { isDemoMode } from "../services/demo";

/**
 * Makes the local demo transport visible so fictional demo values are never
 * mistaken for server-confirmed simulation state.
 */
export function DemoModeBanner() {
  if (!isDemoMode()) return null;
  return (
    <div className="demo-banner" role="status">
      <strong>Local demo.</strong> Fictional scenario values are generated in
      this browser and are not saved to a server. Set{" "}
      <code>VITE_USE_MOCKS=false</code> once Supabase and FastAPI are
      configured.
    </div>
  );
}
