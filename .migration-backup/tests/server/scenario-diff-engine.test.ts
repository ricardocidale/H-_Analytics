import { describe, it, expect } from "vitest";
import {
  computePropertyDiff,
  applyPropertyDiff,
  computeAssumptionDiff,
  computeFullDiff,
  computeSnapshotHash,
  reconstructScenarioProperties,
  DELETED_SENTINEL,
} from "../../server/scenarios/diff-engine";

describe("Scenario Diff Engine", () => {
  describe("computePropertyDiff", () => {
    it("returns empty diff for identical properties", () => {
      const prop = { name: "Hotel A", startAdr: 200, maxOccupancy: 0.85 };
      const diff = computePropertyDiff(prop, { ...prop });
      expect(Object.keys(diff)).toHaveLength(0);
    });

    it("detects changed fields", () => {
      const base = { name: "Hotel A", startAdr: 200, maxOccupancy: 0.85 };
      const modified = { name: "Hotel A", startAdr: 250, maxOccupancy: 0.90 };
      const diff = computePropertyDiff(base, modified);
      expect(diff).toEqual({ startAdr: 250, maxOccupancy: 0.90 });
    });

    it("detects added fields", () => {
      const base = { name: "Hotel A", startAdr: 200 };
      const modified = { name: "Hotel A", startAdr: 200, description: "New desc" };
      const diff = computePropertyDiff(base, modified);
      expect(diff).toEqual({ description: "New desc" });
    });

    it("detects removed fields with DELETED sentinel", () => {
      const base = { name: "Hotel A", startAdr: 200, description: "Old desc" };
      const modified = { name: "Hotel A", startAdr: 200 };
      const diff = computePropertyDiff(base, modified);
      expect(diff).toEqual({ description: DELETED_SENTINEL });
    });

    it("DELETED sentinel survives JSON roundtrip", () => {
      const base = { name: "Hotel A", startAdr: 200, description: "Old desc" };
      const modified = { name: "Hotel A", startAdr: 200 };
      const diff = computePropertyDiff(base, modified);
      const roundTripped = JSON.parse(JSON.stringify(diff));
      expect(roundTripped).toEqual({ description: DELETED_SENTINEL });
    });

    it("skips id/createdAt/updatedAt/userId fields", () => {
      const base = { id: 1, userId: 10, createdAt: "2024-01-01", updatedAt: "2024-01-01", name: "Hotel A", startAdr: 200 };
      const modified = { id: 2, userId: 20, createdAt: "2025-01-01", updatedAt: "2025-01-01", name: "Hotel A", startAdr: 250 };
      const diff = computePropertyDiff(base, modified);
      expect(diff).toEqual({ startAdr: 250 });
      expect(diff).not.toHaveProperty("id");
      expect(diff).not.toHaveProperty("userId");
    });

    it("detects nested object changes via JSON comparison", () => {
      const base = { name: "Hotel A", researchValues: { adr: { value: 200 } } };
      const modified = { name: "Hotel A", researchValues: { adr: { value: 250 } } };
      const diff = computePropertyDiff(base, modified);
      expect(diff).toEqual({ researchValues: { adr: { value: 250 } } });
    });
  });

  describe("applyPropertyDiff", () => {
    it("merges overrides onto base property", () => {
      const base = { name: "Hotel A", startAdr: 200, maxOccupancy: 0.85 };
      const overrides = { startAdr: 250 };
      const result = applyPropertyDiff(base, overrides);
      expect(result).toEqual({ name: "Hotel A", startAdr: 250, maxOccupancy: 0.85 });
    });

    it("adds new fields from overrides", () => {
      const base = { name: "Hotel A", startAdr: 200 };
      const overrides = { description: "New desc" };
      const result = applyPropertyDiff(base, overrides);
      expect(result).toEqual({ name: "Hotel A", startAdr: 200, description: "New desc" });
    });

    it("removes fields marked with DELETED sentinel", () => {
      const base = { name: "Hotel A", startAdr: 200, description: "Old desc" };
      const overrides = { description: DELETED_SENTINEL };
      const result = applyPropertyDiff(base, overrides);
      expect(result).toEqual({ name: "Hotel A", startAdr: 200 });
      expect(result).not.toHaveProperty("description");
    });
  });

  describe("computeAssumptionDiff", () => {
    it("returns empty diff for identical assumptions", () => {
      const ga = { inflationRate: 0.03, projectionYears: 10 };
      const diff = computeAssumptionDiff(ga, { ...ga });
      expect(Object.keys(diff)).toHaveLength(0);
    });

    it("detects changed assumption fields", () => {
      const base = { inflationRate: 0.03, projectionYears: 10 };
      const modified = { inflationRate: 0.04, projectionYears: 10 };
      const diff = computeAssumptionDiff(base, modified);
      expect(diff).toEqual({ inflationRate: 0.04 });
    });
  });

  describe("computeSnapshotHash", () => {
    it("produces consistent hash for same input", () => {
      const assumptions = { inflationRate: 0.03 };
      const properties = [{ name: "Hotel A", startAdr: 200 }];
      const hash1 = computeSnapshotHash(assumptions, properties);
      const hash2 = computeSnapshotHash(assumptions, properties);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it("produces different hash for different input", () => {
      const hash1 = computeSnapshotHash({ inflationRate: 0.03 }, [{ name: "A" }]);
      const hash2 = computeSnapshotHash({ inflationRate: 0.04 }, [{ name: "A" }]);
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("computeFullDiff", () => {
    it("detects no changes when scenarios match", () => {
      const ga = { inflationRate: 0.03 };
      const props = [{ id: 1, name: "Hotel A", startAdr: 200 }];
      const result = computeFullDiff(ga, props, ga, props);
      expect(Object.keys(result.assumptionOverrides)).toHaveLength(0);
      expect(result.propertyDiffs).toHaveLength(0);
      expect(result.snapshotHash).toHaveLength(64);
    });

    it("detects added property with propertyId", () => {
      const ga = { inflationRate: 0.03 };
      const baseProps = [{ id: 1, name: "Hotel A", startAdr: 200 }];
      const scenarioProps = [
        { id: 1, name: "Hotel A", startAdr: 200 },
        { id: 2, name: "Hotel B", startAdr: 300 },
      ];
      const result = computeFullDiff(ga, baseProps, ga, scenarioProps);
      expect(result.propertyDiffs).toHaveLength(1);
      expect(result.propertyDiffs[0].changeType).toBe("added");
      expect(result.propertyDiffs[0].propertyName).toBe("Hotel B");
      expect(result.propertyDiffs[0].propertyId).toBe(2);
    });

    it("detects removed property with propertyId", () => {
      const ga = { inflationRate: 0.03 };
      const baseProps = [
        { id: 1, name: "Hotel A", startAdr: 200 },
        { id: 2, name: "Hotel B", startAdr: 300 },
      ];
      const scenarioProps = [{ id: 1, name: "Hotel A", startAdr: 200 }];
      const result = computeFullDiff(ga, baseProps, ga, scenarioProps);
      expect(result.propertyDiffs).toHaveLength(1);
      expect(result.propertyDiffs[0].changeType).toBe("removed");
      expect(result.propertyDiffs[0].propertyName).toBe("Hotel B");
      expect(result.propertyDiffs[0].propertyId).toBe(2);
    });

    it("detects modified property fields with propertyId", () => {
      const ga = { inflationRate: 0.03 };
      const baseProps = [{ id: 1, name: "Hotel A", startAdr: 200, maxOccupancy: 0.85 }];
      const scenarioProps = [{ id: 1, name: "Hotel A", startAdr: 250, maxOccupancy: 0.85 }];
      const result = computeFullDiff(ga, baseProps, ga, scenarioProps);
      expect(result.propertyDiffs).toHaveLength(1);
      expect(result.propertyDiffs[0].changeType).toBe("modified");
      expect(result.propertyDiffs[0].overrides).toEqual({ startAdr: 250 });
      expect(result.propertyDiffs[0].propertyId).toBe(1);
    });

    it("detects assumption changes alongside property changes", () => {
      const baseGA = { inflationRate: 0.03 };
      const scenarioGA = { inflationRate: 0.04 };
      const baseProps = [{ id: 1, name: "Hotel A", startAdr: 200 }];
      const scenarioProps = [{ id: 1, name: "Hotel A", startAdr: 250 }];
      const result = computeFullDiff(baseGA, baseProps, scenarioGA, scenarioProps);
      expect(result.assumptionOverrides).toEqual({ inflationRate: 0.04 });
      expect(result.propertyDiffs).toHaveLength(1);
    });

    it("handles properties without id (null propertyId)", () => {
      const ga = { inflationRate: 0.03 };
      const baseProps = [{ name: "Hotel A", startAdr: 200 }];
      const scenarioProps = [{ name: "Hotel A", startAdr: 250 }];
      const result = computeFullDiff(ga, baseProps, ga, scenarioProps);
      expect(result.propertyDiffs[0].propertyId).toBeNull();
    });
  });

  describe("reconstructScenarioProperties", () => {
    it("returns base properties when no diffs", () => {
      const base = [{ name: "Hotel A", startAdr: 200 }];
      const result = reconstructScenarioProperties(base, []);
      expect(result).toEqual(base);
    });

    it("applies modified overrides", () => {
      const base = [{ name: "Hotel A", startAdr: 200, maxOccupancy: 0.85 }];
      const diffs = [{
        propertyId: 1,
        propertyName: "Hotel A",
        changeType: "modified" as const,
        overrides: { startAdr: 250 },
        baseSnapshot: base[0],
      }];
      const result = reconstructScenarioProperties(base, diffs);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ name: "Hotel A", startAdr: 250, maxOccupancy: 0.85 });
    });

    it("removes properties with removed changeType", () => {
      const base = [
        { name: "Hotel A", startAdr: 200 },
        { name: "Hotel B", startAdr: 300 },
      ];
      const diffs = [{
        propertyId: 2,
        propertyName: "Hotel B",
        changeType: "removed" as const,
        overrides: {},
        baseSnapshot: base[1],
      }];
      const result = reconstructScenarioProperties(base, diffs);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Hotel A");
    });

    it("adds new properties with added changeType", () => {
      const base = [{ name: "Hotel A", startAdr: 200 }];
      const diffs = [{
        propertyId: null,
        propertyName: "Hotel C",
        changeType: "added" as const,
        overrides: { name: "Hotel C", startAdr: 400 },
        baseSnapshot: null,
      }];
      const result = reconstructScenarioProperties(base, diffs);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Hotel A");
      expect(result[1].name).toBe("Hotel C");
    });

    it("handles complex mixed scenario", () => {
      const base = [
        { name: "Hotel A", startAdr: 200 },
        { name: "Hotel B", startAdr: 300 },
        { name: "Hotel C", startAdr: 400 },
      ];
      const diffs = [
        { propertyId: 1, propertyName: "Hotel A", changeType: "modified" as const, overrides: { startAdr: 250 }, baseSnapshot: base[0] },
        { propertyId: 2, propertyName: "Hotel B", changeType: "removed" as const, overrides: {}, baseSnapshot: base[1] },
        { propertyId: null, propertyName: "Hotel D", changeType: "added" as const, overrides: { name: "Hotel D", startAdr: 500 }, baseSnapshot: null },
      ];
      const result = reconstructScenarioProperties(base, diffs);
      expect(result).toHaveLength(3);
      expect(result.map(r => r.name)).toEqual(["Hotel A", "Hotel C", "Hotel D"]);
      expect(result[0].startAdr).toBe(250);
      expect(result[1].startAdr).toBe(400);
      expect(result[2].startAdr).toBe(500);
    });

    it("applies DELETED sentinel to remove fields during reconstruction", () => {
      const base = [{ name: "Hotel A", startAdr: 200, description: "Old desc" }];
      const diffs = [{
        propertyId: 1,
        propertyName: "Hotel A",
        changeType: "modified" as const,
        overrides: { description: DELETED_SENTINEL },
        baseSnapshot: base[0],
      }];
      const result = reconstructScenarioProperties(base, diffs);
      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty("description");
      expect(result[0].startAdr).toBe(200);
    });
  });
});
