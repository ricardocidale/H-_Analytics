import { stableHash, stableEquals } from "./stable-json";

const SKIP_FIELDS = new Set([
  "id", "createdAt", "updatedAt", "userId",
]);

export const DELETED_SENTINEL = "__DELETED__";

export interface PropertyDiff {
  propertyId: number | null;
  propertyName: string;
  changeType: "added" | "removed" | "modified" | "unchanged";
  overrides: Record<string, unknown>;
  baseSnapshot: Record<string, unknown> | null;
}

export interface ScenarioDiffResult {
  assumptionOverrides: Record<string, unknown>;
  propertyDiffs: PropertyDiff[];
  snapshotHash: string;
}

export function computeSnapshotHash(
  assumptions: Record<string, unknown>,
  properties: Array<Record<string, unknown>>
): string {
  return stableHash({ assumptions, properties });
}

export function computePropertyDiff(
  baseProperty: Record<string, unknown>,
  scenarioProperty: Record<string, unknown>
): Record<string, unknown> {
  const diff: Record<string, unknown> = {};

  const allKeys = Array.from(new Set([...Object.keys(baseProperty), ...Object.keys(scenarioProperty)]));
  for (const key of allKeys) {
    if (SKIP_FIELDS.has(key)) continue;
    const baseVal = baseProperty[key];
    const scenarioVal = scenarioProperty[key];
    if (!stableEquals(baseVal, scenarioVal)) {
      diff[key] = scenarioVal === undefined ? DELETED_SENTINEL : scenarioVal;
    }
  }

  return diff;
}

export function applyPropertyDiff(
  baseProperty: Record<string, unknown>,
  overrides: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...baseProperty };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === DELETED_SENTINEL) {
      delete result[key];
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function computeAssumptionDiff(
  baseAssumptions: Record<string, unknown>,
  scenarioAssumptions: Record<string, unknown>
): Record<string, unknown> {
  const diff: Record<string, unknown> = {};

  const allKeys = Array.from(new Set([...Object.keys(baseAssumptions), ...Object.keys(scenarioAssumptions)]));
  for (const key of allKeys) {
    if (SKIP_FIELDS.has(key)) continue;
    const baseVal = baseAssumptions[key];
    const scenarioVal = scenarioAssumptions[key];
    if (!stableEquals(baseVal, scenarioVal)) {
      diff[key] = scenarioVal;
    }
  }

  return diff;
}

export function computeFullDiff(
  baseAssumptions: Record<string, unknown>,
  baseProperties: Array<Record<string, unknown>>,
  scenarioAssumptions: Record<string, unknown>,
  scenarioProperties: Array<Record<string, unknown>>
): ScenarioDiffResult {
  const snapshotHash = computeSnapshotHash(baseAssumptions, baseProperties);
  const assumptionOverrides = computeAssumptionDiff(baseAssumptions, scenarioAssumptions);

  const baseMap = new Map(baseProperties.map(p => [p.name as string, p]));
  const scenarioMap = new Map(scenarioProperties.map(p => [p.name as string, p]));
  const allNames = Array.from(new Set([...Array.from(baseMap.keys()), ...Array.from(scenarioMap.keys())]));

  const propertyDiffs: PropertyDiff[] = [];

  for (const name of allNames) {
    const baseProp = baseMap.get(name);
    const scenarioProp = scenarioMap.get(name);

    if (!baseProp && scenarioProp) {
      propertyDiffs.push({
        propertyId: (scenarioProp.id as number) ?? null,
        propertyName: name,
        changeType: "added",
        overrides: scenarioProp,
        baseSnapshot: null,
      });
    } else if (baseProp && !scenarioProp) {
      propertyDiffs.push({
        propertyId: (baseProp.id as number) ?? null,
        propertyName: name,
        changeType: "removed",
        overrides: {},
        baseSnapshot: baseProp,
      });
    } else if (baseProp && scenarioProp) {
      const overrides = computePropertyDiff(baseProp, scenarioProp);
      if (Object.keys(overrides).length > 0) {
        propertyDiffs.push({
          propertyId: (baseProp.id as number) ?? null,
          propertyName: name,
          changeType: "modified",
          overrides,
          baseSnapshot: baseProp,
        });
      }
    }
  }

  return { assumptionOverrides, propertyDiffs, snapshotHash };
}

export function reconstructScenarioProperties(
  baseProperties: Array<Record<string, unknown>>,
  propertyDiffs: PropertyDiff[]
): Array<Record<string, unknown>> {
  const baseMap = new Map(baseProperties.map(p => [p.name as string, { ...p }]));
  const diffMap = new Map(propertyDiffs.map(d => [d.propertyName, d]));

  const result: Array<Record<string, unknown>> = [];

  const baseEntries = Array.from(baseMap.entries());
  for (const [name, baseProp] of baseEntries) {
    const diff = diffMap.get(name);
    if (!diff) {
      result.push(baseProp);
    } else if (diff.changeType === "removed") {
      continue;
    } else if (diff.changeType === "modified") {
      result.push(applyPropertyDiff(baseProp, diff.overrides));
    }
  }

  for (const diff of propertyDiffs) {
    if (diff.changeType === "added") {
      result.push(diff.overrides);
    }
  }

  return result;
}
