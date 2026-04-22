import { useSyncExternalStore } from "react";
import type { AiIntelligenceSection } from "@/components/ai-intelligence/AiIntelligenceSidebar";

let currentSection: AiIntelligenceSection = "specialist-mgmt-co-funding";
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getSnapshot() {
  return currentSection;
}

export function setAiIntelligenceSection(section: AiIntelligenceSection) {
  currentSection = section;
  listeners.forEach((fn) => fn());
}

export function useAiIntelligenceSection(): [AiIntelligenceSection, typeof setAiIntelligenceSection] {
  const section = useSyncExternalStore(subscribe, getSnapshot);
  return [section, setAiIntelligenceSection];
}
