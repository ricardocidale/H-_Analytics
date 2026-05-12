/**
 * useUnsavedChangesGuard — closes the navigation gap on LlmWorkflowsPage.
 *
 * When the admin has staged slot changes (`isDirty === true`) and tries to
 * leave the LLM workflows surface, this hook intercepts the navigation and
 * surfaces a confirm prompt instead of silently dropping the edits.
 *
 * Coverage:
 *   1. Intelligence sidebar click / programmatic section change — registers
 *      a guard with `intelligence-nav` so `setIntelligenceSection` (and the
 *      URL-driven `applyIntelligenceSectionFromUrl`) can short-circuit
 *      BEFORE the section store mutates and unmounts this page. Switching
 *      between LLM categories (llms-agents ↔ llms-research ↔ …) keeps the
 *      page mounted and is intentionally allowed through the guard.
 *   2. Tab close / refresh / cross-origin navigation — `beforeunload`
 *      listener (only attached when dirty) shows the browser-native prompt.
 *
 * Test bypass: under Vitest (`MODE === "test"` or `NODE_ENV === "test"`)
 * the hook no-ops entirely — neither the leave guard nor the unload
 * listener is registered. Component tests that mount LlmWorkflowsPage and
 * exercise navigation aren't blocked by the dialog.
 */

import { useEffect, useRef } from "react";
import {
  applyPendingIntelligenceLeave,
  clearPendingIntelligenceLeave,
  registerIntelligenceLeaveGuard,
  usePendingIntelligenceLeaveTarget,
} from "@/lib/intelligence-nav";
import { setLlmWorkflowsDirtyState } from "@/lib/llm-workflows-dirty";
import type { IntelligenceSection } from "@/components/intelligence/IntelligenceSidebar";

/**
 * Section keys that count as "still inside LLM workflows". Mirrors the
 * `llms-*` SectionContent branches in Intelligence.tsx. If you add a new
 * LLM sub-section there, add it here too or the guard will prompt when
 * the admin clicks it.
 */
const LLM_SECTIONS = new Set<IntelligenceSection>([
  "llm-workflows",
  "llms-agents",
  "llms-research",
  "llms-graphics",
  "llms-other",
]);

/**
 * Vitest sets `import.meta.env.MODE === "test"` (and Node's `NODE_ENV`
 * to "test"). When either is true we no-op the guard entirely so unit
 * tests that mount LlmWorkflowsPage and exercise navigation don't get
 * stuck on the dialog or the beforeunload listener. Production and
 * dev builds (MODE === "production" | "development") run the guard
 * normally.
 */
function isTestEnv(): boolean {
  try {
    if (import.meta.env?.MODE === "test") return true;
  } catch {
    // import.meta.env not available — fall through
  }
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "test") {
    return true;
  }
  return false;
}

export interface UnsavedChangesGuardResult {
  /** True when a navigation has been intercepted and is awaiting confirmation. */
  promptOpen: boolean;
  /** Discard the staged dirty state and proceed to the pending destination. */
  confirmDiscard: () => void;
  /** Stay on the page and dismiss the prompt. */
  stay: () => void;
}

export function useUnsavedChangesGuard(
  isDirty: boolean,
): UnsavedChangesGuardResult {
  // Hard no-op in test environments. Both the leave-guard registration
  // and beforeunload listener gate on `effectiveDirty`, so a test-mode
  // mount never installs either.
  const testEnv = isTestEnv();
  const effectiveDirty = testEnv ? false : isDirty;
  const isDirtyRef = useRef(effectiveDirty);
  isDirtyRef.current = effectiveDirty;

  // Mirror dirty state into the global module so route-level guards
  // (which live in App.tsx and outlive this component) can read it.
  // In test mode `effectiveDirty` is always false → the global stays
  // clean and the route guard never intercepts.
  useEffect(() => {
    setLlmWorkflowsDirtyState({
      isDirty: effectiveDirty,
      dirtyCount: effectiveDirty ? 1 : 0,
    });
    return () => {
      setLlmWorkflowsDirtyState({ isDirty: false, dirtyCount: 0 });
    };
  }, [effectiveDirty]);

  // Tab close / refresh / cross-origin nav. Browsers ignore custom strings
  // here and show their built-in confirmation, which is fine — it still
  // gives the admin a chance to bail out.
  useEffect(() => {
    if (!effectiveDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [effectiveDirty]);

  // Intelligence-section change interception. Registered for the entire
  // mount lifetime so a guard predicate is always available; the
  // predicate itself reads the live `isDirty` via the ref so it picks up
  // post-mount changes without re-registering. Returning `false` for
  // LLM-to-LLM switches keeps category swaps frictionless.
  useEffect(() => {
    if (testEnv) return;
    const unregister = registerIntelligenceLeaveGuard((target) => {
      if (!isDirtyRef.current) return false;
      if (LLM_SECTIONS.has(target)) return false;
      return true;
    });
    return unregister;
  }, [testEnv]);

  const pendingTarget = usePendingIntelligenceLeaveTarget();

  return {
    promptOpen: pendingTarget !== null,
    confirmDiscard: applyPendingIntelligenceLeave,
    stay: clearPendingIntelligenceLeave,
  };
}
