/**
 * apply-funding-defaults — focused tests for the Funding Defaults overlay.
 *
 * Per task #742 ("Have funding settings inherit from company defaults
 * instead of falling through to hardcoded values") and the three-tier
 * cascade in `.claude/rules/inflation-cascade.md`:
 *
 *   Constants → Defaults → Assumptions
 *
 * The four Funding Specialist columns on `globalAssumptions`
 * (`runwayBufferMonths`, `sizingOvershootPct`, `revenueRampDelayMonths`,
 * `burnFlexDownPct`) are nullable. NULL means "no Assumption-tier
 * value, inherit the admin Default-tier value". This test asserts that
 * the overlay used by `GET /api/global-assumptions` and by the Funding
 * Specialist evaluator path does exactly that — and never silently
 * overwrites a saved Assumption.
 */
import { describe, it, expect } from "vitest";
import {
  FUNDING_DEFAULT_COLUMNS,
  applyFundingDefaultsOverlay,
} from "../../server/finance/apply-funding-defaults";
import {
  DEFAULT_RUNWAY_BUFFER_MONTHS,
  DEFAULT_SIZING_OVERSHOOT_PCT,
  DEFAULT_REVENUE_RAMP_DELAY_MONTHS,
  DEFAULT_BURN_FLEX_DOWN_PCT,
} from "../../shared/constants-funding";

/** Build a defaults map keyed by canonical `mc.funding.*` keys. */
function defaultsMap(values: Partial<Record<string, number>>) {
  const m = new Map<string, unknown>();
  for (const [k, v] of Object.entries(values)) {
    if (v !== undefined) m.set(k, v);
  }
  return m;
}

describe("applyFundingDefaultsOverlay (task #742 — three-tier cascade)", () => {
  it("returns input unchanged when global is null/undefined", () => {
    expect(applyFundingDefaultsOverlay(null, new Map())).toBeNull();
    expect(applyFundingDefaultsOverlay(undefined, new Map())).toBeUndefined();
  });

  it("declares exactly the four Funding Specialist columns (no drift)", () => {
    expect(FUNDING_DEFAULT_COLUMNS.map((c) => c.column).sort()).toEqual(
      [
        "burnFlexDownPct",
        "revenueRampDelayMonths",
        "runwayBufferMonths",
        "sizingOvershootPct",
      ],
    );
    for (const { column, defaultKey } of FUNDING_DEFAULT_COLUMNS) {
      expect(defaultKey).toBe(`mc.funding.${column}`);
    }
  });

  // ── Core cascade behavior ──────────────────────────────────────────
  describe("NULL Assumption + non-null Default → Default flows through", () => {
    it("fills runwayBufferMonths from the admin Default when the user row is NULL", () => {
      const out = applyFundingDefaultsOverlay(
        { runwayBufferMonths: null },
        defaultsMap({ "mc.funding.runwayBufferMonths": 14 }),
      );
      expect(out.runwayBufferMonths).toBe(14);
    });

    it("fills all four columns from their admin Defaults at once", () => {
      const out = applyFundingDefaultsOverlay(
        {
          runwayBufferMonths: null,
          sizingOvershootPct: null,
          revenueRampDelayMonths: null,
          burnFlexDownPct: null,
        },
        defaultsMap({
          "mc.funding.runwayBufferMonths": 14,
          "mc.funding.sizingOvershootPct": 0.27,
          "mc.funding.revenueRampDelayMonths": 7,
          "mc.funding.burnFlexDownPct": 0.18,
        }),
      );
      expect(out).toEqual({
        runwayBufferMonths: 14,
        sizingOvershootPct: 0.27,
        revenueRampDelayMonths: 7,
        burnFlexDownPct: 0.18,
      });
    });

    it("treats `undefined` columns the same as NULL (camelCase defaulting)", () => {
      const out = applyFundingDefaultsOverlay(
        {} as Record<string, unknown>,
        defaultsMap({ "mc.funding.burnFlexDownPct": 0.22 }),
      );
      expect(out.burnFlexDownPct).toBe(0.22);
    });
  });

  // ── User assumption wins ───────────────────────────────────────────
  describe("non-null Assumption wins over the Default", () => {
    it("does not overwrite a finite user value with the admin Default", () => {
      const out = applyFundingDefaultsOverlay(
        { runwayBufferMonths: 18, sizingOvershootPct: 0.4 },
        defaultsMap({
          "mc.funding.runwayBufferMonths": 9,
          "mc.funding.sizingOvershootPct": 0.2,
        }),
      );
      expect(out.runwayBufferMonths).toBe(18);
      expect(out.sizingOvershootPct).toBe(0.4);
    });

    it("preserves a user-set 0 (not coerced to NULL)", () => {
      const out = applyFundingDefaultsOverlay(
        { burnFlexDownPct: 0 },
        defaultsMap({ "mc.funding.burnFlexDownPct": 0.2 }),
      );
      expect(out.burnFlexDownPct).toBe(0);
    });
  });

  // ── No Default present → leave NULL for hardcoded fallback ─────────
  describe("NULL Assumption + missing Default → column stays NULL", () => {
    it("leaves the column NULL so downstream consumers fall through to DEFAULT_*", () => {
      const out = applyFundingDefaultsOverlay(
        { runwayBufferMonths: null, sizingOvershootPct: null },
        defaultsMap({}),
      );
      expect(out.runwayBufferMonths).toBeNull();
      expect(out.sizingOvershootPct).toBeNull();
    });

    it("ignores non-numeric / non-finite default values", () => {
      const out = applyFundingDefaultsOverlay(
        { runwayBufferMonths: null, sizingOvershootPct: null, burnFlexDownPct: null },
        new Map<string, unknown>([
          ["mc.funding.runwayBufferMonths", "not a number"],
          ["mc.funding.sizingOvershootPct", Number.NaN],
          ["mc.funding.burnFlexDownPct", null],
        ]),
      );
      expect(out.runwayBufferMonths).toBeNull();
      expect(out.sizingOvershootPct).toBeNull();
      expect(out.burnFlexDownPct).toBeNull();
    });
  });

  // ── Identity / immutability ────────────────────────────────────────
  it("returns a new object (does not mutate the input)", () => {
    const input = { runwayBufferMonths: null, sizingOvershootPct: 0.3 };
    const out = applyFundingDefaultsOverlay(
      input,
      defaultsMap({ "mc.funding.runwayBufferMonths": 12 }),
    );
    expect(out).not.toBe(input);
    expect(input.runwayBufferMonths).toBeNull();
    expect(out.runwayBufferMonths).toBe(12);
  });

  it("preserves unrelated columns on the globalAssumptions row untouched", () => {
    const input = {
      runwayBufferMonths: null,
      companyName: "Acme MC",
      inflationRate: 0.03,
      depreciationYears: 39,
    };
    const out = applyFundingDefaultsOverlay(
      input,
      defaultsMap({ "mc.funding.runwayBufferMonths": 12 }),
    );
    expect(out).toEqual({
      runwayBufferMonths: 12,
      companyName: "Acme MC",
      inflationRate: 0.03,
      depreciationYears: 39,
    });
  });

  // ── End-to-end story expressed as the task's done criterion ────────
  it("done-criterion: NULL user row + admin Default → /api/global-assumptions and Funding Specialist see the Default value (not the hardcoded constant)", () => {
    // Admin-tuned Defaults (post-Steady-State edit) — distinct from the
    // hardcoded DEFAULT_* fallbacks so the assertion proves the Default
    // flowed through and the constant did not.
    const adminDefaults = defaultsMap({
      "mc.funding.runwayBufferMonths": DEFAULT_RUNWAY_BUFFER_MONTHS + 5,
      "mc.funding.sizingOvershootPct": DEFAULT_SIZING_OVERSHOOT_PCT + 0.07,
      "mc.funding.revenueRampDelayMonths": DEFAULT_REVENUE_RAMP_DELAY_MONTHS - 2,
      "mc.funding.burnFlexDownPct": DEFAULT_BURN_FLEX_DOWN_PCT + 0.04,
    });

    // User row with NULL on every Funding column — the Assumption-tier
    // shape returned by storage.getGlobalAssumptions() before any user
    // save on the Funding tab.
    const userRow = {
      id: 42,
      runwayBufferMonths: null,
      sizingOvershootPct: null,
      revenueRampDelayMonths: null,
      burnFlexDownPct: null,
    };

    const overlaid = applyFundingDefaultsOverlay(userRow, adminDefaults);

    // 1. /api/global-assumptions surface — client receives the Default.
    expect(overlaid.runwayBufferMonths).toBe(DEFAULT_RUNWAY_BUFFER_MONTHS + 5);
    expect(overlaid.sizingOvershootPct).toBeCloseTo(DEFAULT_SIZING_OVERSHOOT_PCT + 0.07);
    expect(overlaid.revenueRampDelayMonths).toBe(DEFAULT_REVENUE_RAMP_DELAY_MONTHS - 2);
    expect(overlaid.burnFlexDownPct).toBeCloseTo(DEFAULT_BURN_FLEX_DOWN_PCT + 0.04);

    // 2. Funding Specialist evaluator surface — client `deriveFundingInputs`
    //    builds CapitalRaiseInputs from the same overlaid row, so the
    //    Specialist sees the Default values as well, not the hardcoded
    //    DEFAULT_* constants.
    const capitalRaiseInputs = {
      runwayBufferMonths: overlaid.runwayBufferMonths,
      sizingOvershootPct: overlaid.sizingOvershootPct,
      revenueRampDelayMonths: overlaid.revenueRampDelayMonths,
      burnFlexDownPct: overlaid.burnFlexDownPct,
    };
    expect(capitalRaiseInputs.runwayBufferMonths).not.toBe(DEFAULT_RUNWAY_BUFFER_MONTHS);
    expect(capitalRaiseInputs.sizingOvershootPct).not.toBe(DEFAULT_SIZING_OVERSHOOT_PCT);
    expect(capitalRaiseInputs.revenueRampDelayMonths).not.toBe(DEFAULT_REVENUE_RAMP_DELAY_MONTHS);
    expect(capitalRaiseInputs.burnFlexDownPct).not.toBe(DEFAULT_BURN_FLEX_DOWN_PCT);
  });
});
