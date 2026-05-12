import { useSyncExternalStore } from "react";
import { navigate } from "wouter/use-browser-location";
import type { IntelligenceSection } from "@/components/intelligence/IntelligenceSidebar";

export const DEFAULT_INTELLIGENCE_SECTION: IntelligenceSection = "specialist-mgmt-co-funding";
let currentSection: IntelligenceSection = DEFAULT_INTELLIGENCE_SECTION;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getSnapshot() {
  return currentSection;
}

// ─── Leave guard ──────────────────────────────────────────────────────────
//
// Task #1466 — components inside an Intelligence section can register a
// guard that blocks a section change when they have unsaved work. The
// guard is a synchronous predicate: returning `true` blocks the change,
// stages the requested target on `pendingLeaveTarget`, and notifies
// pending-listeners so the owning component can render its own confirm
// dialog. Returning `false` lets the change apply normally.
//
// One-shot bypass: when the user confirms "Discard", the guard owner
// calls `applyPendingIntelligenceLeave()` which sets `bypassGuardOnce`
// and re-invokes the original setter so the change applies past the
// guard. Cleared after a single use to avoid leaking past unrelated
// future navigations.
type LeaveGuard = (target: IntelligenceSection) => boolean;
let leaveGuard: LeaveGuard | null = null;
let bypassGuardOnce = false;
let pendingLeaveTarget: IntelligenceSection | null = null;
const pendingLeaveListeners = new Set<() => void>();

export function registerIntelligenceLeaveGuard(guard: LeaveGuard): () => void {
  leaveGuard = guard;
  return () => {
    if (leaveGuard === guard) leaveGuard = null;
    // Clearing the guard also clears any pending target it staged — the
    // owning component is unmounting and can no longer resolve it.
    if (pendingLeaveTarget !== null) {
      pendingLeaveTarget = null;
      pendingLeaveListeners.forEach((fn) => fn());
    }
  };
}

function setPendingLeaveTarget(target: IntelligenceSection | null) {
  if (pendingLeaveTarget === target) return;
  pendingLeaveTarget = target;
  pendingLeaveListeners.forEach((fn) => fn());
}

export function clearPendingIntelligenceLeave() {
  setPendingLeaveTarget(null);
}

export function applyPendingIntelligenceLeave() {
  const target = pendingLeaveTarget;
  if (!target) return;
  setPendingLeaveTarget(null);
  bypassGuardOnce = true;
  setIntelligenceSection(target);
}

export function usePendingIntelligenceLeaveTarget(): IntelligenceSection | null {
  return useSyncExternalStore(
    (l) => {
      pendingLeaveListeners.add(l);
      return () => { pendingLeaveListeners.delete(l); };
    },
    () => pendingLeaveTarget,
    () => pendingLeaveTarget,
  );
}

function consumeGuard(target: IntelligenceSection): boolean {
  if (bypassGuardOnce) {
    bypassGuardOnce = false;
    return false;
  }
  if (!leaveGuard) return false;
  return leaveGuard(target);
}

// Internal-only setter used by the URL-driven deep-link effect in
// Intelligence.tsx. It updates the in-memory store without pushing a new
// `?section=…` history entry, so wouter's useSearch reacting to a
// back/forward popstate doesn't trigger a redundant pushState that would
// poison the browser history.
//
// When a leave guard blocks the change, we revert the URL back to the
// still-active section so the address bar matches what the user sees.
export function applyIntelligenceSectionFromUrl(section: IntelligenceSection) {
  if (currentSection === section) return;
  if (consumeGuard(section)) {
    setPendingLeaveTarget(section);
    if (
      typeof window !== "undefined" &&
      window.location.pathname.startsWith("/intelligence")
    ) {
      const params = new URLSearchParams(window.location.search);
      params.set("section", currentSection);
      navigate(
        `${window.location.pathname}?${params.toString()}`,
        { replace: true },
      );
    }
    return;
  }
  currentSection = section;
  listeners.forEach((fn) => fn());
}

// Public setter used by every in-app navigation source (sidebar clicks,
// quick-search, admin-nav cross-jumps, Specialist deep links from Resources
// dialogs, etc.). Updates in-memory state AND syncs `?section=<value>` into
// the URL so the active LLMs sub-section (and every other Intelligence
// section) is shareable, bookmarkable, and survives a refresh / back-forward.
export function setIntelligenceSection(section: IntelligenceSection) {
  if (currentSection !== section && consumeGuard(section)) {
    setPendingLeaveTarget(section);
    return;
  }
  const changed = currentSection !== section;
  currentSection = section;
  if (changed) listeners.forEach((fn) => fn());

  if (typeof window === "undefined") return;
  // Only mutate the URL when we're actually on /intelligence. Cross-page
  // callers (admin-nav.ts, ResourcesTab) navigate to /intelligence
  // themselves; pushing `?section=` here on /admin or /property/edit/:id
  // would clobber unrelated query state on those routes.
  if (!window.location.pathname.startsWith("/intelligence")) return;
  const params = new URLSearchParams(window.location.search);
  if (params.get("section") === section) return;
  params.set("section", section);
  const nextSearch = params.toString();
  navigate(`${window.location.pathname}?${nextSearch}`, { replace: false });
}

export function useIntelligenceSection(): [IntelligenceSection, typeof setIntelligenceSection] {
  const section = useSyncExternalStore(subscribe, getSnapshot);
  return [section, setIntelligenceSection];
}

// Task #502 — one-shot deep-link tab hint. The sidebar's per-Specialist
// "Overrides" badge calls `setIntelligenceTabHint(specialistId, "llm-config")`
// before switching the section so the freshly-mounted SpecialistPage can
// open straight to the LLM Config tab without needing URL plumbing.
//
// "One-shot" semantics: SpecialistPage consumes the hint in a useEffect and
// calls `consumeIntelligenceTabHint(specialistId)` to clear it, so a stale
// hint can't survive a page-level back/forward and re-trigger later.
// Internal-only hint type. The set of admissible tabs is closed and
// callers always pass a string literal, so we don't need to expose the
// type to consumers (and exporting it triggers the unused-exports audit).
// "required-fields" added per Task #614 so the cross-Specialist
// perennial-offenders panel on the Required Fields roll-up can deep-link
// straight to the owning Specialist's Recommendations card (which lives
// inside the RequiredFieldsTab) instead of dropping the admin on the
// default Overview tab.
type IntelligenceTabHint = "llm-config" | "required-fields";
type PendingHint = { specialistId: string; tab: IntelligenceTabHint; nonce: number };

let pendingTabHint: PendingHint | null = null;
let nextHintNonce = 1;
const tabHintListeners = new Set<() => void>();

export function setIntelligenceTabHint(
  specialistId: string,
  tab: IntelligenceTabHint,
) {
  // Bump the nonce on every set so two consecutive identical hints
  // (same specialistId + tab) still register as a distinct event.
  // Without this, React's useSyncExternalStore would short-circuit a
  // re-render and a same-specialist re-click of the Overrides badge
  // wouldn't re-trigger the tab switch.
  pendingTabHint = { specialistId, tab, nonce: nextHintNonce++ };
  tabHintListeners.forEach((fn) => fn());
}

export function consumeIntelligenceTabHint(
  specialistId: string,
): IntelligenceTabHint | null {
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
 * `consumeIntelligenceTabHint` would only fire on a `specialistId`
 * change, and a same-page badge click would silently do nothing.
 */
export function usePendingIntelligenceTabHint(): PendingHint | null {
  return useSyncExternalStore(subscribeTabHint, getTabHintSnapshot, getTabHintSnapshot);
}

// admin-cleanup #7 — Resources catalog kind hint. Legacy admin deep links
// `resources-apis|sources|benchmarks|models` collapsed into a single
// `resources` Intelligence section with internal tabs. To preserve sub-tab
// fidelity for those legacy links, `setAdminSection` (admin-nav.ts) sets the
// matching kind here before navigating; `ResourcesAdminPage` consumes
// it on mount as the initial selected tab. One-shot to avoid stale
// hints surviving a back/forward.
export type ResourcesCatalogKind = "api" | "source" | "benchmark" | "model";
let pendingResourcesKindHint: ResourcesCatalogKind | null = null;

export function setResourcesCatalogKindHint(kind: ResourcesCatalogKind): void {
  pendingResourcesKindHint = kind;
}

export function consumeResourcesCatalogKindHint(): ResourcesCatalogKind | null {
  const k = pendingResourcesKindHint;
  pendingResourcesKindHint = null;
  return k;
}
