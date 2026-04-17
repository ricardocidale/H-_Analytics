import { describe, it, expect } from "vitest";
import {
  computeAssumptionsConfirmation,
  COMPANY_ASSUMPTIONS_TAB_KEYS,
} from "../../client/src/hooks/useCompanyAssumptionsConfirmation";
import { pickDefaultActionIndex } from "../../client/src/components/intelligence/AnalystCheckDialog";
import type { WatchdogAction } from "../../engine/watchdog/capitalRaiseEvaluator";

describe("computeAssumptionsConfirmation (gate hook)", () => {
  it("treats missing/invalid savedTabs as fully unconfirmed", () => {
    expect(computeAssumptionsConfirmation(undefined).confirmed).toBe(false);
    expect(computeAssumptionsConfirmation(null).confirmed).toBe(false);
    expect(computeAssumptionsConfirmation("not an array").confirmed).toBe(false);
    expect(computeAssumptionsConfirmation(undefined).missingTabs).toEqual(
      [...COMPANY_ASSUMPTIONS_TAB_KEYS],
    );
  });

  it("ignores unknown keys and reports correct missing list", () => {
    const r = computeAssumptionsConfirmation(["company", "junk", "funding"]);
    expect(r.confirmed).toBe(false);
    expect(r.savedTabs).toEqual(["company", "funding"]);
    expect(r.missingTabs).toEqual([
      "revenue", "compensation", "overhead", "property-defaults",
    ]);
  });

  it("returns confirmed=true once every tab key is present", () => {
    const r = computeAssumptionsConfirmation([...COMPANY_ASSUMPTIONS_TAB_KEYS]);
    expect(r.confirmed).toBe(true);
    expect(r.missingTabs).toEqual([]);
    expect(r.savedTabs).toEqual([...COMPANY_ASSUMPTIONS_TAB_KEYS]);
  });

  it("supports the first-run flow: gate progressively unlocks as each tab is saved", () => {
    // Simulates the user clicking Save once on each tab in order from a
    // pristine state. After all 6 saves, gating should clear.
    let saved: string[] = [];
    const order: string[] = [
      "company", "funding", "revenue", "compensation", "overhead", "property-defaults",
    ];
    for (const tab of order) {
      // Pre-save: gate is closed and this tab is in missing list.
      const before = computeAssumptionsConfirmation(saved);
      expect(before.confirmed).toBe(false);
      expect(before.missingTabs).toContain(tab);
      saved = [...saved, tab];
    }
    const after = computeAssumptionsConfirmation(saved);
    expect(after.confirmed).toBe(true);
    expect(after.missingTabs).toEqual([]);
  });

  it("dedupes and is order-insensitive", () => {
    const r = computeAssumptionsConfirmation([
      "funding", "company", "company", "revenue",
      "compensation", "overhead", "property-defaults",
    ]);
    expect(r.confirmed).toBe(true);
  });
});

describe("AssumptionsGateGuard semantics (loading invariants)", () => {
  /**
   * Guard contract (mirrored in `AssumptionsGateGuard`):
   *   - while loading → render neither the gated children nor the gate panel
   *   - !confirmed   → render gate panel
   *   - confirmed    → render children
   *
   * The pure decision is reproduced here so we test the invariant without
   * spinning up jsdom + React Query.
   */
  type Decision = "loader" | "gate" | "children";
  function decide({ isLoading, confirmed }: { isLoading: boolean; confirmed: boolean }): Decision {
    if (isLoading) return "loader";
    if (!confirmed) return "gate";
    return "children";
  }

  it("never renders gated children while the assumptions query is loading", () => {
    expect(decide({ isLoading: true, confirmed: false })).toBe("loader");
    expect(decide({ isLoading: true, confirmed: true })).toBe("loader");
  });

  it("shows the gate panel once the query resolves and confirmation is false", () => {
    expect(decide({ isLoading: false, confirmed: false })).toBe("gate");
  });

  it("renders children only after the query resolves and confirmation is true", () => {
    expect(decide({ isLoading: false, confirmed: true })).toBe("children");
  });
});

describe("AnalystCheckDialog · pickDefaultActionIndex", () => {
  it("prefers Adjust when present", () => {
    const actions: WatchdogAction[] = [
      { kind: "adjust", label: "Adjust" },
      { kind: "ack", label: "Got it" },
      { kind: "save_anyway", label: "Save Anyway" },
    ];
    expect(pickDefaultActionIndex(actions)).toBe(0);
  });

  it("falls back to Got it when no Adjust action exists", () => {
    const actions: WatchdogAction[] = [
      { kind: "ack", label: "Got it" },
      { kind: "save_anyway", label: "Save Anyway" },
    ];
    expect(pickDefaultActionIndex(actions)).toBe(0);
  });

  it("never picks Save Anyway as the default", () => {
    const actions: WatchdogAction[] = [
      { kind: "save_anyway", label: "Save Anyway" },
    ];
    expect(pickDefaultActionIndex(actions)).toBe(-1);
  });

  it("returns -1 for an empty action list", () => {
    expect(pickDefaultActionIndex([])).toBe(-1);
  });
});
