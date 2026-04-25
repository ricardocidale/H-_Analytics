/**
 * describe-factory-source.test.ts — Task #604.
 *
 * Locks in the cascade order of `describeFactorySource` so the badges shown
 * on Property Edit, the Yearly Income Statement, and the PP&E Cost-Basis
 * Schedule keep agreeing with the value the engine actually computes:
 *
 *   property override → US state overlay → country default → United States baseline
 *
 * If a future refactor accidentally drops the state overlay or labels a
 * Costa Rica property as "United States baseline", these tests will fail.
 */
import { describe, it, expect } from "vitest";
import {
  describeFactorySource,
  getFactoryNumber,
} from "../../shared/model-constants-registry";

describe("describeFactorySource — costRateTaxes cascade", () => {
  it("uses the property override when one is provided", () => {
    const src = describeFactorySource(
      "costRateTaxes",
      "United States",
      "Texas",
      0.015,
    );
    expect(src.kind).toBe("propertyOverride");
    expect(src.value).toBe(0.015);
    expect(src.label).toBe("1.5% — property override");
  });

  it("applies the US state overlay when no override is set", () => {
    const src = describeFactorySource(
      "costRateTaxes",
      "United States",
      "Texas",
    );
    expect(src.kind).toBe("stateOverlay");
    expect(src.label).toBe("1.8% — Texas overlay");
    expect(src.country).toBe("United States");
    expect(src.subdivision).toBe("Texas");
    // Must agree with the runtime resolver.
    expect(src.value).toBe(getFactoryNumber("costRateTaxes", "United States", "Texas"));
  });

  it("uses the country default for non-US countries with their own row", () => {
    const src = describeFactorySource("costRateTaxes", "Costa Rica");
    expect(src.kind).toBe("countryDefault");
    expect(src.label).toMatch(/^0\.25% — Costa Rica country default$/);
    expect(src.value).toBe(getFactoryNumber("costRateTaxes", "Costa Rica"));
  });

  it("falls back to the United States baseline for US without a state", () => {
    const src = describeFactorySource("costRateTaxes", "United States");
    expect(src.kind).toBe("baseline");
    expect(src.label).toBe("1.2% — United States baseline");
    expect(src.value).toBe(getFactoryNumber("costRateTaxes", "United States"));
  });

  it("falls back to the United States baseline when country is missing", () => {
    const src = describeFactorySource("costRateTaxes");
    expect(src.kind).toBe("baseline");
    expect(src.label).toBe("1.2% — United States baseline");
  });

  it("falls back to the United States baseline for an unknown country", () => {
    const src = describeFactorySource("costRateTaxes", "Atlantis");
    expect(src.kind).toBe("baseline");
    expect(src.label).toBe("1.2% — United States baseline");
  });

  it("ignores the state overlay for non-US countries", () => {
    // Spec: state overlays are US-only. A "Texas"-labeled state under a
    // different country should not pull from US_STATE_DEFAULTS.
    const src = describeFactorySource("costRateTaxes", "Costa Rica", "Texas");
    expect(src.kind).toBe("countryDefault");
    expect(src.country).toBe("Costa Rica");
  });

  it("treats null/undefined override as no override", () => {
    const a = describeFactorySource("costRateTaxes", "United States", "Texas", null);
    const b = describeFactorySource(
      "costRateTaxes",
      "United States",
      "Texas",
      undefined,
    );
    expect(a.kind).toBe("stateOverlay");
    expect(b.kind).toBe("stateOverlay");
  });
});

describe("describeFactorySource — other locality kinds", () => {
  it("describes country-only keys (no state overlay path)", () => {
    const src = describeFactorySource("inflationRate", "Argentina");
    // Argentina is in COUNTRY_DEFAULTS so it should be a country default,
    // not the US baseline.
    expect(src.kind).toBe("countryDefault");
    expect(src.country).toBe("Argentina");
    expect(src.label).toContain("Argentina country default");
  });

  it("describes universal keys with the global baseline label", () => {
    const src = describeFactorySource("daysPerMonth");
    expect(src.kind).toBe("baseline");
    expect(src.label).toContain("global baseline");
  });

  it("formats sub-1% rates without trailing zeros", () => {
    // Costa Rica 0.25% — the formatter must keep the meaningful decimal.
    const src = describeFactorySource("costRateTaxes", "Costa Rica");
    expect(src.label.startsWith("0.25%")).toBe(true);
  });
});
