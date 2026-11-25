import { useEffect, useState } from "react";

const OVERLAY_EVENT = "mtaalab:overlay";

/** Let layout chrome react to a full-screen overlay (decision drawer, sheet). */
export function announceOverlay(open: boolean): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<boolean>(OVERLAY_EVENT, { detail: open }),
  );
}

/** True while a modal surface such as the decision drawer is open. */
export function useOverlayOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handle = (event: Event) => {
      setOpen(Boolean((event as CustomEvent<boolean>).detail));
    };
    window.addEventListener(OVERLAY_EVENT, handle);
    return () => window.removeEventListener(OVERLAY_EVENT, handle);
  }, []);

  return open;
}
