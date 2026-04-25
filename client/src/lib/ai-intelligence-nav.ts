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

// Task #502 — one-shot deep-link tab hint. The sidebar's per-Specialist
// "Overrides" badge calls `setAiIntelligenceTabHint(specialistId, "llm-config")`
// before switching the section so the freshly-mounted SpecialistPage can
// open straight to the LLM Config tab without needing URL plumbing.
//
// "One-shot" semantics: SpecialistPage consumes the hint in a useEffect and
// calls `consumeAiIntelligenceTabHint(specialistId)` to clear it, so a stale
// hint can't survive a page-level back/forward and re-trigger later.
// Internal-only hint type. The set of admissible tabs is closed and
// callers always pass a string literal, so we don't need to expose the
// type to consumers (and exporting it triggers the unused-exports audit).
type AiIntelligenceTabHint = "llm-config";
type PendingHint = { specialistId: string; tab: AiIntelligenceTabHint; nonce: number };

let pendingTabHint: PendingHint | null = null;
let nextHintNonce = 1;
const tabHintListeners = new Set<() => void>();

export function setAiIntelligenceTabHint(
  specialistId: string,
  tab: AiIntelligenceTabHint,
) {
  // Bump the nonce on every set so two consecutive identical hints
  // (same specialistId + tab) still register as a distinct event.
  // Without this, React's useSyncExternalStore would short-circuit a
  // re-render and a same-specialist re-click of the Overrides badge
  // wouldn't re-trigger the tab switch.
  pendingTabHint = { specialistId, tab, nonce: nextHintNonce++ };
  tabHintListeners.forEach((fn) => fn());
}

export function consumeAiIntelligenceTabHint(
  specialistId: string,
): AiIntelligenceTabHint | null {
  if (!pendingTabHint || pendingTabHint.specialistId !== specialistId) {
    return null;
  }
  const tab = pendingTabHint.tab;
  pendingTabHint = null;
  tabHintListeners.forEach((fn) => fn());
  return tab;
}

function subscribeTabHint(listener: () => void) {
  tabHintListeners.add(listener);
  return () => { tabHintListeners.delete(listener); };
}

function getTabHintSnapshot() {
  return pendingTabHint;
}

/**
 * Reactive subscription for a pending tab hint. SpecialistPage uses
 * this so that clicking the "Overrides" badge for the *currently open*
 * Specialist still flips the page to its LLM Config tab — without it,
 * `consumeAiIntelligenceTabHint` would only fire on a `specialistId`
 * change, and a same-page badge click would silently do nothing.
 */
export function usePendingAiIntelligenceTabHint(): PendingHint | null {
  return useSyncExternalStore(subscribeTabHint, getTabHintSnapshot, getTabHintSnapshot);
}
