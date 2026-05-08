import { useEffect, useState } from "react";

/** CSS media query string for reduced-motion user preference. */
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)" as const;

/**
 * Returns true when the user has opted into reduced motion via OS/browser
 * accessibility settings. All animated components should render a static
 * fallback when this hook returns true.
 *
 * Reactive — re-renders automatically if the user changes the preference
 * while the app is open.
 */
export function useReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(REDUCED_MOTION_QUERY).matches;
  });

  useEffect(() => {
    const mql = window.matchMedia(REDUCED_MOTION_QUERY);
    const handler = (e: MediaQueryListEvent) => setPrefersReduced(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return prefersReduced;
}
