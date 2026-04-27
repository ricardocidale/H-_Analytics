import { useSyncExternalStore } from "react";
import { navigate } from "wouter/use-browser-location";
import {
  normalizeAdminSection,
  isResourcesLegacySection,
  type AdminSection,
} from "@/components/admin/AdminSidebar";
import { setAiIntelligenceSection } from "@/lib/ai-intelligence-nav";

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
    setAiIntelligenceSection(section);
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
