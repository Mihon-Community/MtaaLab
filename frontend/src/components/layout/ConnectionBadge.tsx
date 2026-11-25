import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";

/**
 * Connection state for the top bar. Offline is a status, never an error: the
 * last confirmed state stays visible and labelled as such.
 */
export function ConnectionBadge() {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (online) {
    return (
      <span className="hidden items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-muted-foreground sm:inline-flex">
        <Wifi aria-hidden="true" size={14} strokeWidth={2} />
        Online
      </span>
    );
  }

  return (
    <span
      role="status"
      className="inline-flex items-center gap-1.5 rounded-full border border-status-warning px-2.5 py-1 text-xs font-semibold text-foreground"
    >
      <WifiOff aria-hidden="true" size={14} strokeWidth={2} />
      Offline — showing last confirmed state
    </span>
  );
}
