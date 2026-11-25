import { MotionConfig } from "motion/react";
import { AppShell } from "@/components/layout/AppShell";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider, useReducedMotionPreference } from "@/lib/theme";

/**
 * Root composition: display preferences, motion policy, application chrome and
 * the toast region used for server-confirmed events only.
 */
export default function App() {
  return (
    <ThemeProvider>
      <AppMotionPolicy />
    </ThemeProvider>
  );
}

function AppMotionPolicy() {
  const reducedMotion = useReducedMotionPreference();
  return (
    <MotionConfig reducedMotion={reducedMotion ? "always" : "user"}>
      <AppShell />
      <Toaster />
    </MotionConfig>
  );
}
