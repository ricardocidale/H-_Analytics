import { describe, it, expect } from "vitest";
import {
  computeAssumptionsConfirmation,
  COMPANY_ASSUMPTIONS_TAB_KEYS,
} from "../../client/src/hooks/useCompanyAssumptionsConfirmation";
import { pickDefaultActionIndex } from "../../client/src/components/intelligence/AnalystCheckDialog";
import type { VerdictAction } from "../../engine/analyst/contracts/verdict";

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
    // "company" is no longer a valid tab key (legacy Company tab was
    // removed); it should be filtered out the same as any other unknown
    // string. "junk" is plain garbage. Only "funding" survives.
    const r = computeAssumptionsConfirmation(["company", "junk", "funding"]);
    expect(r.confirmed).toBe(false);
    expect(r.savedTabs).toEqual(["funding"]);
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
    // pristine state. After all 5 saves, gating should clear.
    let saved: string[] = [];
    const order: string[] = [
      "funding", "revenue", "compensation", "overhead", "property-defaults",
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
    // Includes a duplicate "funding" plus a stale "company" key from the
    // pre-removal era; the latter must be filtered out by the unknown-key
    // path while the rest still confirm the gate.
    const r = computeAssumptionsConfirmation([
      "funding", "funding", "company", "revenue",
      "compensation", "overhead", "property-defaults",
    ]);
    expect(r.confirmed).toBe(true);
  });
});

describe("getInitialTab — legacy ?tab= URL remap", () => {
  // Inline mirror of `getInitialTab` from CompanyAssumptions.tsx so we
  // can exercise the redirect contract without spinning up the page.
  // If you change one, change the other.
  const TAB_KEYS = [
    "funding", "revenue", "compensation", "overhead", "property-defaults",
  ] as const;
  type TabKey = (typeof TAB_KEYS)[number];

  function getInitialTab(search: string): TabKey {
    const t = new URLSearchParams(search).get("tab");
    const legacyRemap: Record<string, TabKey> = {
      company: "funding",
      setup: "funding",
      "tax-exit": "funding",
    };
    if (t && t in legacyRemap) return legacyRemap[t];
    return (TAB_KEYS as readonly string[]).includes(t ?? "") ? (t as TabKey) : "funding";
  }

  it("remaps legacy ?tab=company to funding", () => {
    expect(getInitialTab("?tab=company")).toBe("funding");
  });
  it("remaps legacy ?tab=setup to funding", () => {
    expect(getInitialTab("?tab=setup")).toBe("funding");
  });
  it("remaps legacy ?tab=tax-exit to funding", () => {
    expect(getInitialTab("?tab=tax-exit")).toBe("funding");
  });
  it("preserves a valid tab key", () => {
    expect(getInitialTab("?tab=overhead")).toBe("overhead");
    expect(getInitialTab("?tab=property-defaults")).toBe("property-defaults");
  });
  it("falls back to funding when no tab param is set", () => {
    expect(getInitialTab("")).toBe("funding");
  });
  it("falls back to funding for any unknown tab", () => {
    expect(getInitialTab("?tab=garbage")).toBe("funding");
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
  // Phase 3b: actions are now AnalystVerdict VerdictAction values.
  // adjust→consult-cognitive, ack→dismiss; "save_anyway" lives outside
  // the actions[] array (UI-only ghost button, never the default focus).
  it("prefers consult-cognitive (Adjust) when present", () => {
    const actions: VerdictAction[] = [
      { kind: "consult-cognitive", label: "Adjust", payload: { field: "runwayBufferMonths" } },
      { kind: "dismiss", label: "Got it" },
    ];
    expect(pickDefaultActionIndex(actions)).toBe(0);
  });

  it("falls back to dismiss (Got it) when no consult-cognitive action exists", () => {
    const actions: VerdictAction[] = [
      { kind: "dismiss", label: "Got it" },
    ];
    expect(pickDefaultActionIndex(actions)).toBe(0);
  });

  it("returns -1 for an empty action list", () => {
    expect(pickDefaultActionIndex([])).toBe(-1);
  });
});
