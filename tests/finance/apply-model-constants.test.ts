import { describe, it, expect } from "vitest";
import { applyModelConstantsToGlobals } from "../../server/finance/apply-model-constants";
import type { ModelConstantOverride } from "../../shared/schema/model-constants";
import type { ModelConstant } from "../../shared/schema/model-canonicals";
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

function canonical(partial: Partial<ModelConstant>): ModelConstant {
  return {
    id: 1,
    constantKey: "depreciationYears",
    country: "United States",
    countrySubdivision: null,
    value: 39,
    unit: "years",
    authoritySource: "IRS Pub 946",
    authorityRef: null,
    notes: null,
    updatedAt: new Date(),
    ...partial,
  } as ModelConstant;
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

  it("overlays country-locality depreciationYears onto global from the United States baseline", () => {
    // Per Task #379, depreciationYears is now overlaid onto the universal
    // global object using the United States jurisdiction baseline. A
    // per-property override still wins the engine cascade
    // (`property.X ?? global.X`).
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
    expect(out.depreciationYears).toBe(27.5);
  });

  it("does NOT overlay depreciationYears when only a seeded canonical row exists (historical-tenant preservation)", () => {
    // Behavior-preservation invariant for Task #379:
    // The seeded canonical row for the United States (39 years) is not
    // a sufficient signal to overwrite a tenant's pre-existing
    // `globalAssumptions.depreciationYears`. Tenants who historically
    // set a non-default value via the old editable control must keep
    // that value in the engine until an admin explicitly saves an
    // override in the Constants tab.
    const canonicals = [canonical({ value: 39 })];
    const out = applyModelConstantsToGlobals(
      { depreciationYears: 27.5 },
      [],
      canonicals,
    );
    expect(out.depreciationYears).toBe(27.5);
  });

  it("does NOT overlay depreciationYears from TS factory when no canonical row or override exists", () => {
    // Same preservation invariant: TS factory fallback must not silently
    // overwrite the global value either.
    const out = applyModelConstantsToGlobals(
      { depreciationYears: 27.5 },
      [],
    );
    expect(out.depreciationYears).toBe(27.5);
  });

  it("preserves historical tenant deviations in globalAssumptions.depreciationYears across the overlay (parity test)", () => {
    // A tenant who had set 30 years in the old editor must continue to
    // see 30 years in `global.depreciationYears` after this PR ships,
    // even with the canonical row seeded for the United States.
    const canonicals = [canonical({ value: 39 })];
    const overrides: ModelConstantOverride[] = [];
    const tenantHistoricalGlobal = { depreciationYears: 30 };
    const out = applyModelConstantsToGlobals(tenantHistoricalGlobal, overrides, canonicals);
    expect(out.depreciationYears).toBe(30);
  });

  it("does not overlay other country-locality constants (e.g. inflationRate) onto global", () => {
    // inflationRate is country-keyed but not yet in COUNTRY_KEYS_OVERLAID_ON_GLOBAL —
    // production deviation backfill is required first. Tracked as follow-up.
    const overrides = [
      override({
        constantKey: "inflationRate",
        country: "United States",
        countrySubdivision: null,
        value: 0.05,
        source: "manual",
      }),
    ];
    const out = applyModelConstantsToGlobals(
      { daysPerMonth: 30.5, inflationRate: 0.03 },
      overrides,
    );
    expect(out.inflationRate).toBe(0.03);
  });

  it("returns a new object — does not mutate input", () => {
    const input = { daysPerMonth: 28 };
    const out = applyModelConstantsToGlobals(input, [override({ value: 31 })]);
    expect(input.daysPerMonth).toBe(28);
    expect(out).not.toBe(input);
  });
});
