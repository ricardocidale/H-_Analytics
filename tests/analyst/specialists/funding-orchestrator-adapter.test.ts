/**
 * Tests for the Funding orchestrator adapter contracts (S2 of G1).
 *
 * Small surface — exercises the canned dataset + the
 * comparable→Evidence converter. The concrete `FundingOrchestratorAdapter`
 * implementation that wraps `server/ai/research-orchestrator.ts` is wired by
 * Replit's route-handler slice; G1 ships only the pure types + the canned
 * dataset + the converter.
 */
import { describe, expect, it } from "vitest";
import {
  CONVERGENCE_THRESHOLD,
  comparableToEvidence,
  getCannedLpComparables,
  type ComparableRow,
} from "../../../server/ai/specialists/mgmt-co-funding-orchestrator-adapter";

describe("getCannedLpComparables", () => {
  it("returns at least 3 rows (Intelligence Bar #4 minimum)", () => {
    expect(getCannedLpComparables().length).toBeGreaterThanOrEqual(3);
  });

  it("every row has all required fields populated", () => {
    for (const row of getCannedLpComparables()) {
      expect(row.operator.length).toBeGreaterThan(0);
      expect(row.vintage).toBeGreaterThan(2000);
      expect(row.vertical.length).toBeGreaterThan(0);
      expect(row.propertyCount).toBeGreaterThan(0);
      expect(row.raiseUsd).toBeGreaterThan(0);
      expect(row.runwayBufferMonths).toBeGreaterThan(0);
      expect(row.sizingOvershootPct).toBeGreaterThanOrEqual(0);
      expect(row.source.length).toBeGreaterThan(0);
      expect(row.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("returns the same dataset on repeated calls (immutable)", () => {
    const a = getCannedLpComparables();
    const b = getCannedLpComparables();
    expect(a).toEqual(b);
  });
});

describe("comparableToEvidence", () => {
  it("converts a ComparableRow to an Evidence row with tier db_table", () => {
    const row = getCannedLpComparables()[0];
    const ev = comparableToEvidence(row);
    expect(ev.tier).toBe("db_table");
    expect(ev.asOf).toBe(row.asOf);
    expect(ev.personaFit).toBeGreaterThan(0);
    expect(ev.personaFit).toBeLessThanOrEqual(1);
  });

  it("source label includes operator + vintage + vertical + propertyCount + USD-millions", () => {
    const row: ComparableRow = {
      operator: "Acme Hospitality Co",
      vintage: 2024,
      vertical: "boutique-luxury",
      propertyCount: 7,
      raiseUsd: 45_000_000,
      runwayBufferMonths: 18,
      sizingOvershootPct: 0.2,
      trancheGapMonths: 9,
      source: "Public disclosure",
      asOf: "2024-06-01",
    };
    const ev = comparableToEvidence(row);
    expect(ev.source).toContain("Acme Hospitality Co");
    expect(ev.source).toContain("2024");
    expect(ev.source).toContain("boutique-luxury");
    expect(ev.source).toContain("7 properties");
    expect(ev.source).toContain("$45M");
  });
});

describe("CONVERGENCE_THRESHOLD", () => {
  it("is set conservatively in (0, 1)", () => {
    expect(CONVERGENCE_THRESHOLD).toBeGreaterThan(0);
    expect(CONVERGENCE_THRESHOLD).toBeLessThan(1);
  });
});
