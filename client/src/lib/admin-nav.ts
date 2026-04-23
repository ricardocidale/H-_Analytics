import { useSyncExternalStore } from "react";
import { normalizeAdminSection, type AdminSection } from "@/components/admin/AdminSidebar";

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
  currentSection = normalizeAdminSection(section);
  listeners.forEach((fn) => fn());
}

export function useAdminSection(): [AdminSection, typeof setAdminSection] {
  const section = useSyncExternalStore(subscribe, getSnapshot);
  return [section, setAdminSection];
}
