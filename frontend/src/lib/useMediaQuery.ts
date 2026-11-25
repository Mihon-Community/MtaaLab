import { useCallback, useEffect, useState } from "react";

/**
 * Subscribe to a CSS media query. Returns `false` during SSR/first render so
 * layouts always fall back to the mobile-first behaviour.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mediaQuery = window.matchMedia(query);
    const handleChange = (event: MediaQueryListEvent) =>
      setMatches(event.matches);
    setMatches(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [query]);

  return matches;
}

/** Phones are below the `md` breakpoint (768px), matching the design guide. */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767px)");
}

/** Persist a boolean UI preference in a cookie (sidebar state survives reloads). */
export function useCookieState(
  key: string,
  defaultValue: boolean,
): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState<boolean>(() => {
    if (typeof document === "undefined") return defaultValue;
    const match = document.cookie.match(
      new RegExp(`(?:^|; )${key}=(open|closed|true|false)`),
    );
    if (!match) return defaultValue;
    return match[1] === "open" || match[1] === "true";
  });

  const update = useCallback(
    (next: boolean) => {
      setValue(next);
      if (typeof document === "undefined") return;
      document.cookie = `${key}=${next ? "open" : "closed"}; path=/; max-age=604800; SameSite=Lax`;
    },
    [key],
  );

  return [value, update];
}
