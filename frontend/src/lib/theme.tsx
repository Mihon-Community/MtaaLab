import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { isPaletteId, type PaletteId } from "./palettes";

export type ThemeMode = "light" | "dark" | "system";
export type ContrastMode = "standard" | "high";
export type MotionMode = "system" | "reduce";

export interface UiPreferences {
  /** Appearance mode, independent of the brand palette. */
  mode: ThemeMode;
  /** Brand palette; "contrast" is the sixth, accessibility-first theme. */
  palette: PaletteId;
  contrast: ContrastMode;
  textScale: number;
  motion: MotionMode;
}

interface ThemeContextValue extends UiPreferences {
  resolvedTheme: "light" | "dark";
  reducedMotion: boolean;
  setMode: (mode: ThemeMode) => void;
  setPalette: (palette: PaletteId) => void;
  setContrast: (contrast: ContrastMode) => void;
  setTextScale: (scale: number) => void;
  setMotion: (motion: MotionMode) => void;
}

const STORAGE_KEY = "mtaalab.ui-preferences";
const MIN_TEXT_SCALE = 0.9;
const MAX_TEXT_SCALE = 1.25;

const DEFAULT_PREFERENCES: UiPreferences = {
  mode: "system",
  palette: "mtoni",
  contrast: "standard",
  textScale: 1,
  motion: "system",
};

/** Clamp the text scale to the supported range so layout stays predictable. */
export function clampTextScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(MAX_TEXT_SCALE, Math.max(MIN_TEXT_SCALE, scale));
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

function isContrastMode(value: unknown): value is ContrastMode {
  return value === "standard" || value === "high";
}

function isMotionMode(value: unknown): value is MotionMode {
  return value === "system" || value === "reduce";
}

/** Read stored preferences; never throws, so the inline boot script can use it too. */
export function readStoredPreferences(): UiPreferences {
  if (typeof window === "undefined") return { ...DEFAULT_PREFERENCES };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<UiPreferences>;
    return {
      mode: isThemeMode(parsed.mode) ? parsed.mode : DEFAULT_PREFERENCES.mode,
      palette: isPaletteId(parsed.palette)
        ? parsed.palette
        : DEFAULT_PREFERENCES.palette,
      contrast:
        parsed.palette === "contrast" ||
        (isContrastMode(parsed.contrast) && parsed.contrast === "high") ||
        (!parsed.contrast && prefersMoreContrast())
          ? "high"
          : "standard",
      textScale:
        typeof parsed.textScale === "number"
          ? clampTextScale(parsed.textScale)
          : DEFAULT_PREFERENCES.textScale,
      motion: isMotionMode(parsed.motion)
        ? parsed.motion
        : DEFAULT_PREFERENCES.motion,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

function prefersMoreContrast(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-contrast: more)").matches;
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Apply preferences to <html> without React. Used by the inline script in index.html
 * and by the provider effect, so the first paint already has the right theme.
 */
export function applyPreferences(preferences: UiPreferences): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const resolved =
    preferences.mode === "system"
      ? systemPrefersDark()
        ? "dark"
        : "light"
      : preferences.mode;
  root.dataset.theme = resolved;
  root.dataset.palette = preferences.palette;
  if (resolved === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  root.dataset.contrast =
    preferences.palette === "contrast" ? "high" : preferences.contrast;
  root.style.setProperty(
    "--text-scale",
    String(clampTextScale(preferences.textScale)),
  );
  root.dataset.motion = preferences.motion;
  root.style.colorScheme = resolved;
}

export function storePreferences(preferences: UiPreferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Storage can be unavailable (private mode); preferences simply stay in memory.
  }
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<UiPreferences>(() =>
    readStoredPreferences(),
  );
  const [systemDark, setSystemDark] = useState(() => systemPrefersDark());
  const [systemReduceMotion, setSystemReduceMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      !!window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    if (!window.matchMedia) return;
    const colourQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleColour = (event: MediaQueryListEvent) =>
      setSystemDark(event.matches);
    const handleMotion = (event: MediaQueryListEvent) =>
      setSystemReduceMotion(event.matches);
    colourQuery.addEventListener("change", handleColour);
    motionQuery.addEventListener("change", handleMotion);
    return () => {
      colourQuery.removeEventListener("change", handleColour);
      motionQuery.removeEventListener("change", handleMotion);
    };
  }, []);

  useEffect(() => {
    applyPreferences(preferences);
    storePreferences(preferences);
  }, [preferences]);

  const update = useCallback((patch: Partial<UiPreferences>) => {
    setPreferences((current) => ({ ...current, ...patch }));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      ...preferences,
      resolvedTheme:
        preferences.mode === "system"
          ? systemDark
            ? "dark"
            : "light"
          : preferences.mode,
      reducedMotion:
        preferences.motion === "reduce" ||
        (preferences.motion === "system" && systemReduceMotion),
      setMode: (mode) => update({ mode }),
      setPalette: (palette) =>
        update({
          palette,
          contrast: palette === "contrast" ? "high" : "standard",
        }),
      // The legacy high-contrast toggle maps onto the sixth palette so there
      // is only one source of truth for the visual treatment.
      setContrast: (contrast) =>
        setPreferences((current) => ({
          ...current,
          contrast,
          palette:
            contrast === "high"
              ? "contrast"
              : current.palette === "contrast"
                ? "mtoni"
                : current.palette,
        })),
      setTextScale: (textScale) =>
        update({ textScale: clampTextScale(textScale) }),
      setMotion: (motion) => update({ motion }),
    }),
    [preferences, systemDark, systemReduceMotion, update],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside <ThemeProvider>");
  return context;
}

/**
 * Like `useTheme`, but safe outside the provider (isolated page tests render
 * components on their own). Falls back to the OS reduced-motion setting.
 */
function useThemeOrNull(): ThemeContextValue | null {
  return useContext(ThemeContext);
}

/**
 * Merge the OS reduced-motion setting with the in-app override for components that
 * need a boolean (charts, count-ups, confetti-free transitions).
 */
export function useReducedMotionPreference(): boolean {
  const context = useThemeOrNull();
  const [systemReduce, setSystemReduce] = useState(
    () =>
      typeof window !== "undefined" &&
      !!window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    if (context || typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = (event: MediaQueryListEvent) =>
      setSystemReduce(event.matches);
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, [context]);

  if (context) return context.reducedMotion;
  return systemReduce;
}

/**
 * High-contrast flag for charts and map markers, which need a non-colour cue
 * (dash patterns, textures) in that theme. Safe outside the provider.
 */
export function useHighContrastPreference(): boolean {
  const context = useThemeOrNull();
  const [documentContrast, setDocumentContrast] = useState(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.dataset.contrast === "high",
  );

  useEffect(() => {
    if (context || typeof document === "undefined") return;
    const observer = new MutationObserver(() => {
      setDocumentContrast(document.documentElement.dataset.contrast === "high");
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-contrast", "data-palette"],
    });
    return () => observer.disconnect();
  }, [context]);

  if (context)
    return context.contrast === "high" || context.palette === "contrast";
  return (
    documentContrast || document.documentElement.dataset.palette === "contrast"
  );
}
