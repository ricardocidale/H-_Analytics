import { useSyncExternalStore } from "react";
import type { AdminSection } from "@/components/admin/AdminSidebar";

let currentSection: AdminSection = "services-fees";
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getSnapshot() {
  return currentSection;
}

export function setAdminSection(section: AdminSection) {
  currentSection = section;
  listeners.forEach((fn) => fn());
}

export function useAdminSection(): [AdminSection, typeof setAdminSection] {
  const section = useSyncExternalStore(subscribe, getSnapshot);
  return [section, setAdminSection];
}
