import { describe, it, expect } from "vitest";
import { selectBestMatch } from "../../server/storage/reference-range";
import type { ReferenceRange } from "@shared/schema/reference-range";

// Minimal ReferenceRange factory — only the fields the resolver inspects.
function row(overrides: Partial<ReferenceRange> & { id: number }): ReferenceRange {
  return {
    id: overrides.id,
    domain: "kpi",
    metricKey: "adr",
    label: "ADR",
    country: "GLOBAL",
    subdivision: null,
    market: null,
    segment: null,
    propertyType: null,
    year: 2025,
    effectiveFrom: null,
    effectiveUntil: null,
    low: 100,
    mid: 150,
    high: 200,
    unit: "usd_per_room_night",
    sourceId: null,
    sourceName: null,
    sourceUrl: null,
    methodology: null,
    confidence: "medium",
    details: null,
    lastVerifiedAt: null,
    verifiedBy: null,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("selectBestMatch", () => {
  it("returns undefined when rows array is empty", () => {
    expect(selectBestMatch([], { domain: "kpi", metricKey: "adr" })).toBeUndefined();
  });

  it("returns the single row when it matches", () => {
    const r = row({ id: 1, country: "GLOBAL" });
    expect(selectBestMatch([r], { domain: "kpi", metricKey: "adr" })).toBe(r);
  });

  it("prefers country-specific row over GLOBAL", () => {
    const global = row({ id: 1, country: "GLOBAL" });
    const specific = row({ id: 2, country: "US" });
    const result = selectBestMatch([global, specific], {
      domain: "kpi", metricKey: "adr", country: "US",
    });
    expect(result?.id).toBe(2);
  });

  it("prefers market-specific row over country-only", () => {
    const countryRow = row({ id: 1, country: "US" });
    const marketRow = row({ id: 2, country: "US", market: "Nashville" });
    const result = selectBestMatch([countryRow, marketRow], {
      domain: "kpi", metricKey: "adr", country: "US", market: "Nashville",
    });
    expect(result?.id).toBe(2);
  });

  it("excludes rows that over-specify market when query has no market", () => {
    const global = row({ id: 1, country: "GLOBAL" });
    const nashville = row({ id: 2, country: "US", market: "Nashville" });
    const result = selectBestMatch([global, nashville], {
      domain: "kpi", metricKey: "adr", country: "US",
    });
    expect(result?.id).toBe(1);
  });

  it("excludes rows that over-specify segment when query has no segment", () => {
    const plain = row({ id: 1, country: "US" });
    const luxury = row({ id: 2, country: "US", segment: "luxury" });
    const result = selectBestMatch([plain, luxury], {
      domain: "kpi", metricKey: "adr", country: "US",
    });
    expect(result?.id).toBe(1);
  });

  it("prefers segment+market row over segment-only when both dimensions match", () => {
    const segOnly = row({ id: 1, country: "US", segment: "luxury" });
    const segAndMarket = row({ id: 2, country: "US", segment: "luxury", market: "Nashville" });
    const result = selectBestMatch([segOnly, segAndMarket], {
      domain: "kpi", metricKey: "adr", country: "US",
      market: "Nashville", segment: "luxury",
    });
    expect(result?.id).toBe(2);
  });

  it("prefers newest year ≤ requested year at equal specificity", () => {
    const old = row({ id: 1, country: "US", year: 2022 });
    const recent = row({ id: 2, country: "US", year: 2024 });
    const result = selectBestMatch([old, recent], {
      domain: "kpi", metricKey: "adr", country: "US", year: 2024,
    });
    expect(result?.id).toBe(2);
  });

  it("excludes rows with year > requested year", () => {
    const future = row({ id: 1, country: "US", year: 2026 });
    const past = row({ id: 2, country: "US", year: 2024 });
    const result = selectBestMatch([future, past], {
      domain: "kpi", metricKey: "adr", country: "US", year: 2025,
    });
    expect(result?.id).toBe(2);
  });

  it("evergreen row (year = 0) matches any requested year", () => {
    const evergreen = row({ id: 1, country: "US", year: 0 });
    const result = selectBestMatch([evergreen], {
      domain: "kpi", metricKey: "adr", country: "US", year: 2024,
    });
    expect(result?.id).toBe(1);
  });

  it("explicit year beats evergreen at equal specificity", () => {
    const evergreen = row({ id: 1, country: "US", year: 0 });
    const explicit = row({ id: 2, country: "US", year: 2024 });
    const result = selectBestMatch([evergreen, explicit], {
      domain: "kpi", metricKey: "adr", country: "US", year: 2025,
    });
    expect(result?.id).toBe(2);
  });

  it("full cascade: segment+market+country beats all less-specific rows", () => {
    const global = row({ id: 1, country: "GLOBAL" });
    const us = row({ id: 2, country: "US" });
    const usTn = row({ id: 3, country: "US", subdivision: "TN" });
    const usTnNash = row({ id: 4, country: "US", subdivision: "TN", market: "Nashville" });
    const usTnNashLux = row({ id: 5, country: "US", subdivision: "TN", market: "Nashville", segment: "luxury" });
    const result = selectBestMatch([global, us, usTn, usTnNash, usTnNashLux], {
      domain: "kpi", metricKey: "adr",
      country: "US", subdivision: "TN", market: "Nashville", segment: "luxury",
    });
    expect(result?.id).toBe(5);
  });
});
