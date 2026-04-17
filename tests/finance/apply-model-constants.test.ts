import { describe, it, expect } from "vitest";
import { applyModelConstantsToGlobals } from "../../server/finance/apply-model-constants";
import type { ModelConstantOverride } from "../../shared/schema/model-constants";
import { DAYS_PER_MONTH } from "../../shared/constants";

function override(partial: Partial<ModelConstantOverride>): ModelConstantOverride {
  return {
    id: 1,
    constantKey: "daysPerMonth",
    country: null,
    countrySubdivision: null,
    value: 30.5,
    source: "manual",
    authority: null,
    referenceUrl: null,
    overrideNote: null,
    setBy: null,
    setAt: new Date(),
    ...partial,
  } as ModelConstantOverride;
}

describe("applyModelConstantsToGlobals", () => {
  it("returns input unchanged when global is null/undefined", () => {
    expect(applyModelConstantsToGlobals(null, [])).toBeNull();
    expect(applyModelConstantsToGlobals(undefined, [])).toBeUndefined();
  });

  it("falls back to factory daysPerMonth when no override exists", () => {
    const out = applyModelConstantsToGlobals({ daysPerMonth: 28 }, []);
    expect(out.daysPerMonth).toBe(DAYS_PER_MONTH); // factory wins (30.5)
  });

  it("admin manual override wins over the value already on global", () => {
    const overrides = [override({ value: 31, source: "manual" })];
    const out = applyModelConstantsToGlobals({ daysPerMonth: 28 }, overrides);
    expect(out.daysPerMonth).toBe(31);
  });

  it("manual override beats analyst override at the same locality", () => {
    const overrides = [
      override({ id: 1, value: 30, source: "analyst" }),
      override({ id: 2, value: 31, source: "manual" }),
    ];
    const out = applyModelConstantsToGlobals({ daysPerMonth: 28 }, overrides);
    expect(out.daysPerMonth).toBe(31);
  });

  it("does not touch fields that are not registered Model Constants", () => {
    const overrides = [override({ value: 31 })];
    const out = applyModelConstantsToGlobals(
      { daysPerMonth: 28, inflationRate: 0.05, costOfEquity: 0.18 },
      overrides,
    );
    expect(out.inflationRate).toBe(0.05);
    expect(out.costOfEquity).toBe(0.18);
  });

  it("does not overlay country-locality constants (depreciationYears) onto global", () => {
    // depreciationYears is locality='country' — engine resolves per-property,
    // so it must not be silently overlaid on the universal global object.
    const overrides = [
      override({
        constantKey: "depreciationYears",
        country: "United States",
        countrySubdivision: null,
        value: 27.5,
        source: "manual",
      }),
    ];
    const out = applyModelConstantsToGlobals(
      { daysPerMonth: 30.5, depreciationYears: 39 },
      overrides,
    );
    expect(out.depreciationYears).toBe(39);
  });

  it("returns a new object — does not mutate input", () => {
    const input = { daysPerMonth: 28 };
    const out = applyModelConstantsToGlobals(input, [override({ value: 31 })]);
    expect(input.daysPerMonth).toBe(28);
    expect(out).not.toBe(input);
  });
});
