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
}

export function useAdminSection(): [AdminSection, typeof setAdminSection] {
  const section = useSyncExternalStore(subscribe, getSnapshot);
  return [section, setAdminSection];
}
