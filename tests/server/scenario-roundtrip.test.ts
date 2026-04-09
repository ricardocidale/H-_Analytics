import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { computePortfolioProjection } from "../../server/finance/service";
import { computeSnapshotHash } from "../../server/scenarios/diff-engine";
import type { ComputedResultsSnapshot } from "../../shared/schema/scenarios";

const TEST_PROPERTY = {
  id: 1,
  name: "Test Hotel",
  operationsStartDate: "2025-01-01",
  roomCount: 100,
  startAdr: 150,
  adrGrowthRate: 0.03,
  startOccupancy: 0.6,
  maxOccupancy: 0.85,
  occupancyRampMonths: 12,
  occupancyGrowthStep: 0.02,
  purchasePrice: 10_000_000,
  type: "hotel",
  costRateRooms: 0.25,
  costRateFB: 0.35,
  costRateAdmin: 0.08,
  costRateMarketing: 0.05,
  costRatePropertyOps: 0.04,
  costRateUtilities: 0.04,
  costRateTaxes: 0.03,
  costRateIT: 0.02,
  costRateFFE: 0.03,
  costRateOther: 0.01,
  costRateInsurance: 0.02,
  revShareEvents: 0.05,
  revShareFB: 0.10,
  revShareOther: 0.05,
};

const TEST_GLOBAL = {
  modelStartDate: "2025-01-01",
  inflationRate: 0.03,
  marketingRate: 0.05,
  debtAssumptions: {
    interestRate: 0.065,
    amortizationYears: 25,
  },
};

describe("Scenario Computed Results Roundtrip", () => {
  it("produces identical results for the same inputs", () => {
    const result1 = computePortfolioProjection({
      properties: [TEST_PROPERTY],
      globalAssumptions: TEST_GLOBAL,
      projectionYears: 3,
    });

    const result2 = computePortfolioProjection({
      properties: [TEST_PROPERTY],
      globalAssumptions: TEST_GLOBAL,
      projectionYears: 3,
    });

    expect(result1.outputHash).toBe(result2.outputHash);
    expect(result1.consolidatedYearly.length).toBe(result2.consolidatedYearly.length);
    expect(result1.validationSummary.opinion).toBe(result2.validationSummary.opinion);
  });

  it("snapshot structure matches ComputedResultsSnapshot interface", () => {
    const result = computePortfolioProjection({
      properties: [TEST_PROPERTY],
      globalAssumptions: TEST_GLOBAL,
      projectionYears: 3,
    });

    const snapshot: ComputedResultsSnapshot = {
      engineVersion: result.engineVersion,
      computedAt: result.computedAt,
      outputHash: result.outputHash,
      projectionYears: result.projectionYears,
      propertyCount: result.propertyCount,
      auditOpinion: result.validationSummary.opinion,
      consolidatedYearly: result.consolidatedYearly,
    };

    expect(snapshot.engineVersion).toBe("1.0.0");
    expect(snapshot.projectionYears).toBe(3);
    expect(snapshot.propertyCount).toBe(1);
    expect(["UNQUALIFIED", "QUALIFIED", "ADVERSE"]).toContain(snapshot.auditOpinion);
    expect(snapshot.consolidatedYearly).toHaveLength(3);
    expect(snapshot.outputHash).toBeTruthy();
    expect(snapshot.computedAt).toBeTruthy();
  });

  it("snapshot survives JSON serialization roundtrip (simulating DB store/load)", () => {
    const result = computePortfolioProjection({
      properties: [TEST_PROPERTY],
      globalAssumptions: TEST_GLOBAL,
      projectionYears: 3,
    });

    const snapshot: ComputedResultsSnapshot = {
      engineVersion: result.engineVersion,
      computedAt: result.computedAt,
      outputHash: result.outputHash,
      projectionYears: result.projectionYears,
      propertyCount: result.propertyCount,
      auditOpinion: result.validationSummary.opinion,
      consolidatedYearly: result.consolidatedYearly,
    };

    const serialized = JSON.stringify(snapshot);
    const deserialized = JSON.parse(serialized) as ComputedResultsSnapshot;

    expect(deserialized.engineVersion).toBe(snapshot.engineVersion);
    expect(deserialized.outputHash).toBe(snapshot.outputHash);
    expect(deserialized.projectionYears).toBe(snapshot.projectionYears);
    expect(deserialized.propertyCount).toBe(snapshot.propertyCount);
    expect(deserialized.auditOpinion).toBe(snapshot.auditOpinion);
    expect(deserialized.consolidatedYearly).toHaveLength(snapshot.consolidatedYearly.length);
  });

  it("snapshot hash matches snapshot hash of same inputs", () => {
    const assumptions = { inflationRate: 0.03, projectionYears: 5 };
    const properties = [{ name: "Hotel A", startAdr: 200 }];

    const hash1 = computeSnapshotHash(assumptions, properties);
    const hash2 = computeSnapshotHash({ ...assumptions }, [...properties.map(p => ({ ...p }))]);

    expect(hash1).toBe(hash2);
  });

  it("different inputs produce different output hashes", () => {
    const result1 = computePortfolioProjection({
      properties: [TEST_PROPERTY],
      globalAssumptions: TEST_GLOBAL,
      projectionYears: 3,
    });

    const modifiedProperty = { ...TEST_PROPERTY, startAdr: 300 };
    const result2 = computePortfolioProjection({
      properties: [modifiedProperty],
      globalAssumptions: TEST_GLOBAL,
      projectionYears: 3,
    });

    expect(result1.outputHash).not.toBe(result2.outputHash);
  });

  it("consolidatedYearly contains expected financial fields", () => {
    const result = computePortfolioProjection({
      properties: [TEST_PROPERTY],
      globalAssumptions: TEST_GLOBAL,
      projectionYears: 3,
    });

    const year1 = result.consolidatedYearly[0];
    expect(year1).toBeDefined();
    expect(typeof year1.noi).toBe("number");
    expect(typeof year1.netIncome).toBe("number");
    expect(typeof year1.revenueTotal).toBe("number");
    expect(typeof year1.operatingCashFlow).toBe("number");
  });

  it("save→store→load→recompute roundtrip preserves financial integrity", () => {
    const result = computePortfolioProjection({
      properties: [TEST_PROPERTY],
      globalAssumptions: TEST_GLOBAL,
      projectionYears: 5,
    });

    const snapshot: ComputedResultsSnapshot = {
      engineVersion: result.engineVersion,
      computedAt: result.computedAt,
      outputHash: result.outputHash,
      projectionYears: result.projectionYears,
      propertyCount: result.propertyCount,
      auditOpinion: result.validationSummary.opinion,
      consolidatedYearly: result.consolidatedYearly,
    };

    const dbStored = JSON.stringify(snapshot);
    const dbLoaded = JSON.parse(dbStored) as ComputedResultsSnapshot;

    const recomputeResult = computePortfolioProjection({
      properties: [TEST_PROPERTY],
      globalAssumptions: TEST_GLOBAL,
      projectionYears: 5,
    });

    expect(recomputeResult.outputHash).toBe(dbLoaded.outputHash);
    expect(recomputeResult.engineVersion).toBe(dbLoaded.engineVersion);
    expect(recomputeResult.validationSummary.opinion).toBe(dbLoaded.auditOpinion);
    expect(recomputeResult.propertyCount).toBe(dbLoaded.propertyCount);
    expect(recomputeResult.consolidatedYearly).toHaveLength(dbLoaded.consolidatedYearly.length);

    for (let i = 0; i < dbLoaded.consolidatedYearly.length; i++) {
      const stored = dbLoaded.consolidatedYearly[i];
      const fresh = recomputeResult.consolidatedYearly[i];
      expect(fresh.revenueTotal).toBe(stored.revenueTotal);
      expect(fresh.noi).toBe(stored.noi);
      expect(fresh.netIncome).toBe(stored.netIncome);
      expect(fresh.operatingCashFlow).toBe(stored.operatingCashFlow);
    }
  });

  it("stored snapshot detects stale results when inputs change", () => {
    const originalResult = computePortfolioProjection({
      properties: [TEST_PROPERTY],
      globalAssumptions: TEST_GLOBAL,
      projectionYears: 3,
    });

    const storedSnapshot: ComputedResultsSnapshot = {
      engineVersion: originalResult.engineVersion,
      computedAt: originalResult.computedAt,
      outputHash: originalResult.outputHash,
      projectionYears: originalResult.projectionYears,
      propertyCount: originalResult.propertyCount,
      auditOpinion: originalResult.validationSummary.opinion,
      consolidatedYearly: originalResult.consolidatedYearly,
    };

    const dbRoundtripped = JSON.parse(JSON.stringify(storedSnapshot)) as ComputedResultsSnapshot;

    const modifiedProperty = { ...TEST_PROPERTY, startAdr: 250, roomCount: 150 };
    const changedResult = computePortfolioProjection({
      properties: [modifiedProperty],
      globalAssumptions: TEST_GLOBAL,
      projectionYears: 3,
    });

    expect(changedResult.outputHash).not.toBe(dbRoundtripped.outputHash);

    const hashMatch = changedResult.outputHash === dbRoundtripped.outputHash;
    expect(hashMatch).toBe(false);
  });
});

describe("Scenario Save/Load Code Path Verification", () => {
  const routesSrc = fs.readFileSync(
    path.resolve(__dirname, "../../server/routes/scenarios.ts"),
    "utf-8"
  ) + fs.readFileSync(
    path.resolve(__dirname, "../../server/routes/scenario-helpers.ts"),
    "utf-8"
  );
  const financialSrc = fs.readFileSync(
    path.resolve(__dirname, "../../server/storage/financial.ts"),
    "utf-8"
  ) + fs.readFileSync(
    path.resolve(__dirname, "../../server/storage/financial-sharing.ts"),
    "utf-8"
  ) + fs.readFileSync(
    path.resolve(__dirname, "../../server/storage/financial-fees.ts"),
    "utf-8"
  );
  const schemaSrc = fs.readFileSync(
    path.resolve(__dirname, "../../shared/schema/scenarios.ts"),
    "utf-8"
  );

  it("scenario creation route stores computedResults and computeHash", () => {
    expect(routesSrc).toContain("computePortfolioProjection");
    expect(routesSrc).toContain("computedResults:");
    expect(routesSrc).toContain("computeHash:");
  });

  it("scenario load route validates property access for non-owner users", () => {
    expect(routesSrc).toMatch(/getAllProperties\(user\.id\)|getAllProperties\(userId\)/);
    expect(routesSrc).toContain("requesterPropertyIds");
    expect(routesSrc).toContain("unauthorizedIds");
    expect(routesSrc).toContain('"Scenario contains properties you do not have access to"');
  });

  it("scenario load route validates empty properties and invalid names", () => {
    expect(routesSrc).toContain('"Scenario snapshot contains no properties"');
    expect(routesSrc).toContain("without a valid name");
  });

  it("scenario load route detects orphaned fee categories and photos", () => {
    expect(routesSrc).toContain("orphanedFeeCategories");
    expect(routesSrc).toContain("orphanedPhotos");
    expect(routesSrc).toContain("warnings");
  });

  it("compareScenarios returns financialComparison with hash match", () => {
    expect(financialSrc).toContain("financialComparison");
    expect(financialSrc).toContain("hashMatch");
    expect(financialSrc).toContain("outputHash");
    expect(financialSrc).toContain("auditOpinion");
  });

  it("schema defines computedResults and computeHash columns", () => {
    expect(schemaSrc).toContain("computedResults");
    expect(schemaSrc).toContain("computeHash");
    expect(schemaSrc).toContain("ComputedResultsSnapshot");
  });

  it("updateScenarioComputedResults method exists in storage", () => {
    expect(financialSrc).toContain("updateScenarioComputedResults");
    expect(financialSrc).toContain("computedResults");
    expect(financialSrc).toContain("computeHash");
  });

  it("getAllScenarios includes computedResults and computeHash in query", () => {
    expect(financialSrc).toContain("computedResults: scenarios.computedResults");
    expect(financialSrc).toContain("computeHash: scenarios.computeHash");
  });

  it("migration file exists for computed_results columns", () => {
    const migrationPath = path.resolve(__dirname, "../../migrations/0008_scenario_computed_results.sql");
    const migrationSql = fs.readFileSync(migrationPath, "utf-8");
    expect(migrationSql).toContain("computed_results");
    expect(migrationSql).toContain("compute_hash");
    expect(migrationSql).toContain("ADD COLUMN IF NOT EXISTS");
  });
});
