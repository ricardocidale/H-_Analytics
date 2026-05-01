import { useEffect, useRef, useSyncExternalStore } from "react";
import { useSearch } from "wouter";
import { navigate } from "wouter/use-browser-location";
import {
  normalizeAdminSection,
  isResourcesLegacySection,
  type AdminSection,
} from "@/components/admin/AdminSidebar";
import {
  setAiIntelligenceSection,
  setResourcesCatalogKindHint,
  type ResourcesCatalogKind,
} from "@/lib/ai-intelligence-nav";

// admin-cleanup #7 — map collapsed legacy resources keys to the matching
// internal Catalog tab kind so old deep links land on the right sub-tab.
const LEGACY_RESOURCES_TO_KIND: Record<string, ResourcesCatalogKind> = {
  "resources-apis":       "api",
  "resources-sources":    "source",
  "resources-benchmarks": "benchmark",
  "resources-models":     "model",
};

let currentSection: AdminSection = "defaults-management-company";
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getSnapshot() {
  return currentSection;
}

export function setAdminSection(section: AdminSection | string) {
  // Resources surface lives under /ai-intelligence now. Intercept the
  // legacy keys before they hit the admin section map and route the user
  // there with the right AI Intelligence section pre-selected.
  if (typeof section === "string" && isResourcesLegacySection(section)) {
    // The 4 catalog leaves (apis/sources/benchmarks/models) collapsed into
    // a single "resources" entry with internal tabs; "resources-tables"
    // (Market Data) stays a separate leaf. Map legacy keys forward.
    const target = section === "resources-tables" ? "resources-tables" : "resources";
    // Preserve sub-tab fidelity for legacy deep links: stash the matching
    // kind so ResourcesAdminPage opens on the right inner tab. One-shot;
    // consumed on mount.
    const kindHint = LEGACY_RESOURCES_TO_KIND[section];
    if (kindHint) setResourcesCatalogKindHint(kindHint);
    setAiIntelligenceSection(target);
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/ai-intelligence")) {
      navigate("/ai-intelligence");
    }
    return;
  }
  currentSection = normalizeAdminSection(section);
  listeners.forEach((fn) => fn());
  // If the caller is on a non-admin page (e.g. /company/assumptions or
  // /property/edit/:id), updating internal state alone has no visible
  // effect — the Admin layout isn't mounted there. Navigate to /admin so
  // the user actually lands on the section they asked for. Mirrors the
  // legacy-resources branch above which redirects to /ai-intelligence.
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/admin")) {
    navigate("/admin");
  }
}

export function useAdminSection(): [AdminSection, typeof setAdminSection] {
  const section = useSyncExternalStore(subscribe, getSnapshot);
  return [section, setAdminSection];
}

/**
 * Subscribe the admin section store to `window.location.hash`.
 *
 * Why this exists (task #773):
 *   The Analyst's "Open this field" mount-point resolver navigates to
 *   `/admin?focus=<fieldId>#<section>/<sub>` for `defaults/*` slugs (see
 *   `client/src/lib/analyst-mount-points.ts`). For SPA clicks the resolver
 *   imperatively calls `setAdminSection(<section>)` so the right tab is
 *   selected. But for fresh page loads (new tab, refresh, bookmark, browser
 *   back/forward) only the URL is available — `currentSection` defaults to
 *   `defaults-management-company` and the user lands on the wrong sub-section,
 *   leaving the URL-reactive focus hook to silently miss because the target
 *   form never mounts.
 *
 *   This hook closes that gap: on mount, on every wouter pushState (`useSearch`
 *   subscribes to wouter's URL events), and on browser-native `hashchange`
 *   events, parse the leading `#` segment and, if it satisfies `isKnown`,
 *   switch the admin section to it. Re-entrancy is bounded by the
 *   `firstSegment === activeSection` early-return — when state and URL already
 *   agree (the in-app SPA click path) it's a no-op.
 *
 *   `isKnown` is supplied by the caller (`Admin.tsx`) so this module doesn't
 *   need to import the section meta map; only sections that map renders in
 *   the Admin shell are honored, which keeps random anchor-style hashes from
 *   blowing the active section away to nonsense.
 */
export function useAdminSectionFromHash(
  isKnown: (section: string) => boolean,
): void {
  const search = useSearch();
  // Mirror `isKnown` into a ref so the effect can read the latest predicate
  // without re-attaching the `hashchange` listener on every render. Callers
  // typically pass a module-level function, but a ref keeps this safe even
  // if a caller hands in a freshly-bound closure.
  const isKnownRef = useRef(isKnown);
  isKnownRef.current = isKnown;
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => {
      const hash = window.location.hash.slice(1);
      if (!hash) return;
      const firstSegment = hash.split("/")[0];
      if (!firstSegment || !isKnownRef.current(firstSegment)) return;
      if (firstSegment === currentSection) return;
      setAdminSection(firstSegment);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [search]);
}

// Test-only escape hatch: in dev/test builds, expose `setAdminSection` on
// `window.__setAdminSection` so end-to-end Playwright plans can navigate to
// admin sections that have no sidebar entry. (Note: `analyst-tables` now
// has a real sidebar entry under the Steady State group as of Task #598;
// the hook stays as a fallback for any future admin-only section that
// hasn't been wired into the nav yet.) Gated by `import.meta.env.DEV` so
// it never ships in production bundles. Mirrors the existing
// `DEV_SKIP_AUTH` server-side flag — both are dev/test affordances that
// disappear in prod.
if (typeof window !== "undefined" && import.meta.env.DEV) {
  (window as unknown as { __setAdminSection?: typeof setAdminSection }).__setAdminSection = setAdminSection;
}
