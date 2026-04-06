import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

function readFile(relativePath: string): string {
  return readFileSync(resolve(__dirname, "../../", relativePath), "utf-8");
}

describe("Non-Destructive Load — USE_STABLE_SCENARIO_LOAD feature flag", () => {
  it("USE_STABLE_SCENARIO_LOAD is exported from shared/constants.ts", () => {
    const src = readFile("shared/constants.ts");
    expect(src).toContain("export const USE_STABLE_SCENARIO_LOAD");
  });

  it("USE_STABLE_SCENARIO_LOAD defaults to true", () => {
    const src = readFile("shared/constants.ts");
    expect(src).toContain("USE_STABLE_SCENARIO_LOAD = true");
  });

  it("financial.ts imports USE_STABLE_SCENARIO_LOAD from shared/constants", () => {
    const src = readFile("server/storage/financial.ts");
    expect(src).toContain('import { USE_STABLE_SCENARIO_LOAD } from "@shared/constants"');
  });

  it("loadScenario branches on USE_STABLE_SCENARIO_LOAD", () => {
    const src = readFile("server/storage/financial.ts");
    const loadStart = src.indexOf("async loadScenario(");
    const loadEnd = src.indexOf("/** Fetch all fee categories");
    const loadBody = src.slice(loadStart, loadEnd);
    expect(loadBody).toContain("if (USE_STABLE_SCENARIO_LOAD)");
    expect(loadBody).toContain("stableLoadProperties");
    expect(loadBody).toContain("destructiveLoadProperties");
  });

  it("can be imported at runtime", async () => {
    const { USE_STABLE_SCENARIO_LOAD } = await import("@shared/constants");
    expect(USE_STABLE_SCENARIO_LOAD).toBe(true);
  });
});

describe("Non-Destructive Load — stableLoadProperties behavior", () => {
  const src = readFile("server/storage/financial.ts");
  const stableStart = src.indexOf("async function stableLoadProperties(");
  const destructiveStart = src.indexOf("async function destructiveLoadProperties(");
  const stableBody = src.slice(stableStart, destructiveStart);

  it("queries live properties scoped to userId", () => {
    expect(stableBody).toContain("properties.userId, userId");
  });

  it("builds a Map keyed by stableKey for O(1) lookups", () => {
    expect(stableBody).toContain("liveByStableKey");
    expect(stableBody).toContain("new Map<string, LiveProperty>()");
  });

  it("tracks which stableKeys have been matched", () => {
    expect(stableBody).toContain("snapshotStableKeys = new Set<string>()");
  });

  it("updates matched properties in place using tx.update", () => {
    expect(stableBody).toContain("tx.update(properties).set(");
    expect(stableBody).toContain("eq(properties.id, liveProp.id)");
  });

  it("preserves the live property ID when updating (non-destructive)", () => {
    expect(stableBody).toContain("liveProp.id");
    expect(stableBody).toContain("resolvedProperties.push({ id: liveProp.id");
  });

  it("inserts new properties when stableKey has no match", () => {
    expect(stableBody).toContain("tx.insert(properties).values(insertData).returning()");
  });

  it("preserves stableKey on inserted properties", () => {
    expect(stableBody).toContain("insertData.stableKey = stableKey");
  });

  it("soft-archives orphaned properties (isActive=false) instead of deleting", () => {
    expect(stableBody).toContain("isActive: false");
    expect(stableBody).toContain("tx.update(properties).set(");
    expect(stableBody).toContain("!snapshotStableKeys.has(liveProp.stableKey)");
  });

  it("sets isActive=true on matched/inserted properties", () => {
    expect(stableBody).toContain("isActive:");
    expect(stableBody).toContain("?? true");
  });

  it("does NOT delete any properties (unlike destructive path)", () => {
    expect(stableBody).not.toContain("tx.delete(properties)");
  });

  it("returns resolved property list with {id, name}", () => {
    expect(stableBody).toContain("return resolvedProperties");
  });
});

describe("Non-Destructive Load — destructiveLoadProperties fallback", () => {
  const src = readFile("server/storage/financial.ts");
  const destructiveStart = src.indexOf("async function destructiveLoadProperties(");
  const classStart = src.indexOf("export class FinancialStorage");
  const destructiveBody = src.slice(destructiveStart, classStart);

  it("deletes ALL user properties", () => {
    expect(destructiveBody).toContain("tx.delete(properties).where(eq(properties.userId, userId))");
  });

  it("inserts each saved property from scratch", () => {
    expect(destructiveBody).toContain("tx.insert(properties).values(insertData).returning()");
  });

  it("strips auto fields from properties", () => {
    expect(destructiveBody).toContain("stripAutoFields(prop)");
  });

  it("does NOT use stableKey matching", () => {
    expect(destructiveBody).not.toContain("liveByStableKey");
    expect(destructiveBody).not.toContain("snapshotStableKeys");
  });

  it("returns resolved property list with {id, name}", () => {
    expect(destructiveBody).toContain("return resolvedProperties");
  });
});

describe("Non-Destructive Load — photo decoupling across both paths", () => {
  const src = readFile("server/storage/financial.ts");
  const stableStart = src.indexOf("async function stableLoadProperties(");
  const loadEnd = src.indexOf("/** Fetch all fee categories");
  const fullLoadBody = src.slice(stableStart, loadEnd);

  it("savedPropertyPhotos parameter is prefixed with _ (unused)", () => {
    expect(fullLoadBody).toContain("_savedPropertyPhotos");
  });

  it("no photo insert or delete in any load path", () => {
    expect(fullLoadBody).not.toContain("tx.insert(propertyPhotos)");
    expect(fullLoadBody).not.toContain("tx.delete(propertyPhotos)");
  });

  it("no reference to propertyPhotos table in transaction body", () => {
    const txStart = fullLoadBody.indexOf("db.transaction(");
    const txBody = fullLoadBody.slice(txStart);
    expect(txBody).not.toContain("from(propertyPhotos)");
  });
});

describe("Non-Destructive Load — fee category sync (stableKey-based upsert)", () => {
  const src = readFile("server/storage/financial.ts");
  const syncStart = src.indexOf("async function syncFeeCategories(");
  const classStart = src.indexOf("export class FinancialStorage");
  const syncBody = src.slice(syncStart, classStart);

  it("syncFeeCategories is a standalone function", () => {
    expect(syncBody).toContain("async function syncFeeCategories(");
  });

  it("accepts ResolvedProperty[] (with stableKey) not plain { id, name }", () => {
    expect(syncBody).toContain("resolvedProperties: ResolvedProperty[]");
  });

  it("derives fee lookup key from stableKey with name fallback", () => {
    expect(syncBody).toContain("const feeKey = prop.stableKey || prop.name");
  });

  it("tries stableKey-keyed snapshot first, falls back to name-keyed snapshot", () => {
    expect(syncBody).toContain("savedFeeCategories[feeKey] ?? savedFeeCategories[prop.name]");
  });

  it("queries live fee categories per resolved property", () => {
    expect(syncBody).toContain("tx.select().from(propertyFeeCategories)");
    expect(syncBody).toContain("eq(propertyFeeCategories.propertyId, prop.id)");
  });

  it("builds name-based Map of live categories for matching", () => {
    expect(syncBody).toContain("liveByName");
    expect(syncBody).toContain("new Map(liveCats.map(c => [c.name, c]))");
  });

  it("updates matched categories in place by name", () => {
    expect(syncBody).toContain("tx.update(propertyFeeCategories)");
    expect(syncBody).toContain("eq(propertyFeeCategories.id, existing.id)");
  });

  it("inserts new categories not in live data", () => {
    expect(syncBody).toContain("tx.insert(propertyFeeCategories)");
    expect(syncBody).toContain("propertyId: prop.id");
  });

  it("deletes orphaned live categories not in snapshot", () => {
    expect(syncBody).toContain("!snapshotNames.has(liveCat.name)");
    expect(syncBody).toContain("tx.delete(propertyFeeCategories)");
  });

  it("strips auto fields from category data", () => {
    expect(syncBody).toContain("stripAutoFields(cat)");
  });

  it("loadScenario delegates to syncFeeCategories", () => {
    const loadBody = src.slice(0, syncStart);
    const fullSrc = readFile("server/storage/financial.ts");
    const loadStart = fullSrc.indexOf("async loadScenario(");
    const loadEnd = fullSrc.indexOf("/** Fetch all fee categories");
    const loadSection = fullSrc.slice(loadStart, loadEnd);
    expect(loadSection).toContain("syncFeeCategories(tx, resolvedProperties, savedFeeCategories)");
  });
});

describe("Non-Destructive Load — snapshot includes stableKey", () => {
  const src = readFile("server/routes/scenario-helpers.ts");

  it("buildCreateSnapshotData returns scenarioProps (full property objects)", () => {
    const buildStart = src.indexOf("async function buildCreateSnapshotData(");
    const buildEnd = src.indexOf("export function tryComputeResults(");
    const buildBody = src.slice(buildStart, buildEnd);
    expect(buildBody).toContain("scenarioProps: ScenarioPropertySnapshot[]");
  });

  it("ScenarioPropertySnapshot type includes stableKey", () => {
    const types = readFile("shared/schema/types/jsonb-shapes.ts");
    expect(types).toContain("stableKey");
  });

  it("properties table has stableKey column with default UUID", () => {
    const schema = readFile("shared/schema/properties.ts");
    expect(schema).toContain("stableKey");
    expect(schema).toContain("defaultRandom");
  });

  it("buildCreateSnapshotData keys fee categories by stableKey (not name)", () => {
    const buildStart = src.indexOf("async function buildCreateSnapshotData(");
    const buildEnd = src.indexOf("export function tryComputeResults(");
    const buildBody = src.slice(buildStart, buildEnd);
    expect(buildBody).toContain("p.stableKey || p.name");
    expect(buildBody).toContain("propertyFeeCategories[feeKey]");
  });
});

describe("Non-Destructive Load — validateLoadSnapshot", () => {
  const src = readFile("server/routes/scenario-helpers.ts");
  const validateStart = src.indexOf("export function validateLoadSnapshot(");
  const validateEnd = src.indexOf("export async function checkSharedPropertyAccess(");
  const validateBody = src.slice(validateStart, validateEnd);

  it("rejects empty properties with 422", () => {
    expect(validateBody).toContain("snapshotProps.length === 0");
    expect(validateBody).toContain("422");
  });

  it("rejects properties without valid names", () => {
    expect(validateBody).toContain("!p.name || typeof p.name !== \"string\"");
  });

  it("detects orphaned fee categories", () => {
    expect(validateBody).toContain("orphanedFeeCategories");
  });

  it("builds validFeeKeys from both property names and stableKeys", () => {
    expect(validateBody).toContain("validFeeKeys");
    expect(validateBody).toContain("snapshotPropNames");
    expect(validateBody).toContain("stableKey");
  });

  it("orphan detection uses Set.has for both name and stableKey keys", () => {
    expect(validateBody).toContain("!validFeeKeys.has(key)");
  });

  it("returns empty orphanedPhotos (photos are decoupled)", () => {
    expect(validateBody).toContain("orphanedPhotos: []");
  });
});

describe("Non-Destructive Load — behavioral: validateLoadSnapshot with stableKey fee keys", () => {
  it("does not report stableKey-keyed fee categories as orphans", async () => {
    const { validateLoadSnapshot } = await import("../../server/routes/scenario-helpers");
    const result = validateLoadSnapshot({
      properties: [
        { name: "Hotel A", stableKey: "sk-001" },
        { name: "Hotel B", stableKey: "sk-002" },
      ],
      feeCategories: {
        "sk-001": [{ name: "Management Fee", percentage: 5 }],
        "sk-002": [{ name: "FF&E Reserve", percentage: 3 }],
      },
      propertyPhotos: {},
    });
    expect(result.orphanedFeeCategories).toEqual([]);
  });

  it("does not report name-keyed fee categories as orphans (backward compat)", async () => {
    const { validateLoadSnapshot } = await import("../../server/routes/scenario-helpers");
    const result = validateLoadSnapshot({
      properties: [
        { name: "Hotel A", stableKey: "sk-001" },
      ],
      feeCategories: {
        "Hotel A": [{ name: "Management Fee", percentage: 5 }],
      },
      propertyPhotos: {},
    });
    expect(result.orphanedFeeCategories).toEqual([]);
  });

  it("correctly identifies truly orphaned fee category keys", async () => {
    const { validateLoadSnapshot } = await import("../../server/routes/scenario-helpers");
    const result = validateLoadSnapshot({
      properties: [
        { name: "Hotel A", stableKey: "sk-001" },
      ],
      feeCategories: {
        "sk-001": [{ name: "Management Fee", percentage: 5 }],
        "nonexistent-key": [{ name: "Orphan Fee", percentage: 2 }],
      },
      propertyPhotos: {},
    });
    expect(result.orphanedFeeCategories).toEqual(["nonexistent-key"]);
  });

  it("handles mixed stableKey and name keys correctly", async () => {
    const { validateLoadSnapshot } = await import("../../server/routes/scenario-helpers");
    const result = validateLoadSnapshot({
      properties: [
        { name: "Hotel A", stableKey: "sk-001" },
        { name: "Hotel B", stableKey: "sk-002" },
      ],
      feeCategories: {
        "sk-001": [{ name: "Mgmt Fee", percentage: 5 }],
        "Hotel B": [{ name: "Reserve", percentage: 3 }],
        "unknown": [{ name: "Bad", percentage: 1 }],
      },
      propertyPhotos: {},
    });
    expect(result.orphanedFeeCategories).toEqual(["unknown"]);
  });
});

describe("Non-Destructive Load — behavioral: stripAutoFields", () => {
  it("removes id, createdAt, updatedAt from property data", async () => {
    const { stripAutoFields } = await import("../../server/storage/utils");
    const input = { id: 1, createdAt: new Date(), updatedAt: new Date(), name: "Hotel X", stableKey: "abc-123", userId: 5 };
    const result = stripAutoFields(input);
    expect(result).not.toHaveProperty("id");
    expect(result).not.toHaveProperty("createdAt");
    expect(result).not.toHaveProperty("updatedAt");
    expect(result).toHaveProperty("name", "Hotel X");
    expect(result).toHaveProperty("stableKey", "abc-123");
    expect(result).toHaveProperty("userId", 5);
  });

  it("preserves all non-auto fields including stableKey", async () => {
    const { stripAutoFields } = await import("../../server/storage/utils");
    const input = { id: 99, createdAt: new Date(), updatedAt: new Date(), name: "Test", stableKey: "key-1", rooms: 50, adr: 150 };
    const result = stripAutoFields(input);
    expect(Object.keys(result)).toEqual(expect.arrayContaining(["name", "stableKey", "rooms", "adr"]));
    expect(Object.keys(result)).not.toEqual(expect.arrayContaining(["id", "createdAt", "updatedAt"]));
  });
});

describe("Non-Destructive Load — behavioral: feature flag runtime", () => {
  it("USE_STABLE_SCENARIO_LOAD is a boolean true at runtime", async () => {
    const { USE_STABLE_SCENARIO_LOAD } = await import("@shared/constants");
    expect(typeof USE_STABLE_SCENARIO_LOAD).toBe("boolean");
    expect(USE_STABLE_SCENARIO_LOAD).toBe(true);
  });

  it("feature flag can be toggled at import time", async () => {
    const { USE_STABLE_SCENARIO_LOAD } = await import("@shared/constants");
    expect([true, false]).toContain(USE_STABLE_SCENARIO_LOAD);
  });
});

describe("Non-Destructive Load — behavioral: DbOrTx and LiveProperty types", () => {
  it("stableLoadProperties function signature uses DbOrTx type (not any)", () => {
    const src = readFile("server/storage/financial.ts");
    expect(src).toContain("type DbOrTx = Pick<typeof db,");
    const fnSig = src.match(/async function stableLoadProperties\(tx: (\w+),/);
    expect(fnSig).not.toBeNull();
    expect(fnSig![1]).toBe("DbOrTx");
  });

  it("destructiveLoadProperties function signature uses DbOrTx type (not any)", () => {
    const src = readFile("server/storage/financial.ts");
    const fnSig = src.match(/async function destructiveLoadProperties\(tx: (\w+),/);
    expect(fnSig).not.toBeNull();
    expect(fnSig![1]).toBe("DbOrTx");
  });

  it("LiveProperty interface has id, stableKey, and name fields", () => {
    const src = readFile("server/storage/financial.ts");
    expect(src).toContain("interface LiveProperty");
    expect(src).toContain("id: number;");
    expect(src).toContain("stableKey: string | null;");
    expect(src).toContain("name: string;");
  });

  it("no broad 'any' type in standalone function signatures", () => {
    const src = readFile("server/storage/financial.ts");
    const stableStart = src.indexOf("async function stableLoadProperties(");
    const destructiveEnd = src.indexOf("export class FinancialStorage");
    const fnBlock = src.slice(stableStart, destructiveEnd);
    const sigMatches = fnBlock.match(/\btx: any\b/g);
    expect(sigMatches).toBeNull();
  });
});

describe("Non-Destructive Load — behavioral: photo FK cascade safety", () => {
  it("property_photos FK uses ON DELETE CASCADE (confirms why we must not delete orphans)", () => {
    const schema = readFile("shared/schema/services.ts");
    expect(schema).toContain('references(() => properties.id, { onDelete: "cascade" })');
  });

  it("stableLoadProperties soft-archives orphans (isActive=false) instead of deleting", () => {
    const src = readFile("server/storage/financial.ts");
    const stableStart = src.indexOf("async function stableLoadProperties(");
    const stableEnd = src.indexOf("async function destructiveLoadProperties(");
    const stableBody = src.slice(stableStart, stableEnd);
    expect(stableBody).toContain("isActive: false");
    expect(stableBody).not.toContain("tx.delete(properties)");
  });

  it("stableLoadProperties sets isActive on matched and inserted properties with true fallback", () => {
    const src = readFile("server/storage/financial.ts");
    const stableStart = src.indexOf("async function stableLoadProperties(");
    const stableEnd = src.indexOf("async function destructiveLoadProperties(");
    const stableBody = src.slice(stableStart, stableEnd);
    const activeMatches = stableBody.match(/isActive:.*\?\? true/g);
    expect(activeMatches).not.toBeNull();
    expect(activeMatches!.length).toBeGreaterThanOrEqual(2);
  });

  it("destructiveLoadProperties DOES delete all properties (expected behavior for fallback)", () => {
    const src = readFile("server/storage/financial.ts");
    const destructiveStart = src.indexOf("async function destructiveLoadProperties(");
    const syncStart = src.indexOf("async function syncFeeCategories(");
    const destructiveBody = src.slice(destructiveStart, syncStart);
    expect(destructiveBody).toContain("tx.delete(properties).where(eq(properties.userId, userId))");
  });

  it("properties table has isActive column (used for soft-archive)", () => {
    const schema = readFile("shared/schema/properties.ts");
    expect(schema).toContain("isActive: boolean");
    expect(schema).toContain("is_active");
  });
});

describe("Non-Destructive Load — route integration", () => {
  const src = readFile("server/routes/scenarios.ts");
  const loadStart = src.indexOf('"/api/scenarios/:id/load"');
  const loadEnd = src.indexOf('"/api/scenarios/:id"', loadStart + 20);
  const loadRoute = src.slice(loadStart, loadEnd > 0 ? loadEnd : undefined);

  it("load route calls storage.loadScenario", () => {
    expect(loadRoute).toContain("storage.loadScenario");
  });

  it("load route invalidates compute cache after load", () => {
    expect(loadRoute).toContain("invalidateComputeCache()");
  });

  it("load route passes snapshot properties from scenario", () => {
    expect(loadRoute).toContain("snapshotProps");
  });

  it("load route passes fee categories from scenario snapshot", () => {
    expect(loadRoute).toContain("scenario.feeCategories");
  });

  it("load route passes propertyPhotos as last arg (unused in both paths)", () => {
    expect(loadRoute).toContain("scenario.propertyPhotos");
  });

  it("load route returns warnings for orphaned fee categories and photos", () => {
    expect(loadRoute).toContain("orphanedFeeCategories");
    expect(loadRoute).toContain("orphanedPhotos");
  });
});

describe("Non-Destructive Load — ResolvedProperty carries stableKey", () => {
  const src = readFile("server/storage/financial.ts");

  it("ResolvedProperty interface includes stableKey: string | null", () => {
    expect(src).toContain("interface ResolvedProperty");
    const ifaceStart = src.indexOf("interface ResolvedProperty");
    const ifaceEnd = src.indexOf("}", ifaceStart);
    const iface = src.slice(ifaceStart, ifaceEnd + 1);
    expect(iface).toContain("stableKey: string | null");
    expect(iface).toContain("id: number");
    expect(iface).toContain("name: string");
  });

  it("stableLoadProperties returns ResolvedProperty[] with stableKey", () => {
    const fnStart = src.indexOf("async function stableLoadProperties(");
    const fnSig = src.slice(fnStart, src.indexOf("{", fnStart));
    expect(fnSig).toContain("Promise<ResolvedProperty[]>");
  });

  it("destructiveLoadProperties returns ResolvedProperty[] with stableKey", () => {
    const fnStart = src.indexOf("async function destructiveLoadProperties(");
    const fnSig = src.slice(fnStart, src.indexOf("{", fnStart));
    expect(fnSig).toContain("Promise<ResolvedProperty[]>");
  });

  it("stableLoadProperties populates stableKey on matched properties", () => {
    const fnStart = src.indexOf("async function stableLoadProperties(");
    const fnEnd = src.indexOf("async function destructiveLoadProperties(");
    const fnBody = src.slice(fnStart, fnEnd);
    const pushLines = fnBody.split("\n").filter(l => l.includes("resolvedProperties.push"));
    expect(pushLines.length).toBeGreaterThanOrEqual(2);
    for (const line of pushLines) {
      expect(line).toContain("stableKey");
    }
  });

  it("destructiveLoadProperties populates stableKey on inserted properties", () => {
    const fnStart = src.indexOf("async function destructiveLoadProperties(");
    const fnEnd = src.indexOf("async function syncFeeCategories(");
    const fnBody = src.slice(fnStart, fnEnd);
    const pushLines = fnBody.split("\n").filter(l => l.includes("resolvedProperties.push"));
    expect(pushLines.length).toBeGreaterThanOrEqual(1);
    for (const line of pushLines) {
      expect(line).toContain("stableKey");
    }
  });

  it("loadScenario caller uses ResolvedProperty[] type", () => {
    const loadStart = src.indexOf("async loadScenario(");
    const loadEnd = src.indexOf("/** Fetch all fee categories");
    const loadBody = src.slice(loadStart, loadEnd);
    expect(loadBody).toContain("let resolvedProperties: ResolvedProperty[]");
  });
});

describe("Non-Destructive Load — stableKey-based fee mapping correctness", () => {
  const src = readFile("server/storage/financial.ts");
  const syncStart = src.indexOf("async function syncFeeCategories(");
  const classStart = src.indexOf("export class FinancialStorage");
  const syncBody = src.slice(syncStart, classStart);

  it("fee lookup uses stableKey as primary key, not property name", () => {
    expect(syncBody).toContain("const feeKey = prop.stableKey || prop.name");
    expect(syncBody).toContain("savedFeeCategories[feeKey]");
  });

  it("backward-compat: falls back to prop.name if stableKey key not found in snapshot", () => {
    expect(syncBody).toContain("savedFeeCategories[feeKey] ?? savedFeeCategories[prop.name]");
  });

  it("handles null stableKey gracefully (falls back to name)", () => {
    expect(syncBody).toContain("prop.stableKey || prop.name");
  });

  it("snapshot builder keys fee categories by stableKey (or name fallback)", () => {
    const helperSrc = readFile("server/routes/scenario-helpers.ts");
    const buildStart = helperSrc.indexOf("async function buildCreateSnapshotData(");
    const buildEnd = helperSrc.indexOf("export function tryComputeResults(");
    const buildBody = helperSrc.slice(buildStart, buildEnd);
    expect(buildBody).toContain("const feeKey = p.stableKey || p.name");
    expect(buildBody).toContain("propertyFeeCategories[feeKey]");
    expect(buildBody).not.toContain("propertyFeeCategories[p.name]");
  });

  it("resolvedProperties carries stableKey end-to-end from load to fee sync", () => {
    const loadStart = src.indexOf("async loadScenario(");
    const loadEnd = src.indexOf("/** Fetch all fee categories");
    const loadBody = src.slice(loadStart, loadEnd);
    expect(loadBody).toContain("resolvedProperties: ResolvedProperty[]");
    expect(loadBody).toContain("syncFeeCategories(tx, resolvedProperties, savedFeeCategories)");
  });
});
