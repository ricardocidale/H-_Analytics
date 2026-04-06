import { describe, it, expect } from "vitest";

/**
 * Storage Layer Static Analysis Tests
 *
 * Verifies storage implementation correctness by reading source files
 * and checking for known data integrity patterns:
 * - Shared ownership (userId: null)
 * - ORDER BY DESC for singleton queries
 * - Transaction usage in loadScenario
 * - Proper cascade behavior
 */

import * as fs from "fs";
import * as path from "path";

const storageDir = path.resolve(__dirname, "../../server/storage");

function readStorageFile(name: string): string {
  return fs.readFileSync(path.join(storageDir, name), "utf-8");
}

describe("Storage Layer — PropertyStorage", () => {
  const src = readStorageFile("properties.ts");

  it("getAllProperties returns shared properties (userId IS NULL)", () => {
    expect(src).toContain("isNull(properties.userId)");
  });

  it("getAllProperties combines user-owned and shared properties with OR", () => {
    expect(src).toContain("or(eq(properties.userId, userId), isNull(properties.userId))");
  });

  it("createProperty accepts data without forcing userId", () => {
    // The storage layer should pass through whatever userId is in data
    // (the route sets userId: null for shared properties)
    expect(src).toContain("async createProperty(data: InsertProperty)");
    expect(src).toContain(".insert(properties)");
    expect(src).toContain(".returning()");
  });

  it("updateProperty sets updatedAt on every update", () => {
    expect(src).toContain("updatedAt: new Date()");
  });

  it("deleteProperty uses eq on id", () => {
    expect(src).toContain("db.delete(properties).where(eq(properties.id, id))");
  });
});

describe("Storage Layer — FinancialStorage (Global Assumptions)", () => {
  const src = readStorageFile("financial.ts");

  it("getGlobalAssumptions uses ORDER BY DESC for shared row", () => {
    expect(src).toContain("orderBy(desc(globalAssumptions.id))");
  });

  it("getGlobalAssumptions filters shared rows with isNull", () => {
    expect(src).toContain("isNull(globalAssumptions.userId)");
  });

  it("getGlobalAssumptions checks user-specific row first if userId provided", () => {
    // User row takes priority over shared row
    const userCheck = src.indexOf("eq(globalAssumptions.userId, userId)");
    const sharedCheck = src.indexOf("isNull(globalAssumptions.userId)");
    expect(userCheck).toBeGreaterThan(-1);
    expect(sharedCheck).toBeGreaterThan(-1);
    expect(userCheck).toBeLessThan(sharedCheck);
  });

  it("upsertGlobalAssumptions updates user-scoped row (not shared fallback)", () => {
    expect(src).toContain("eq(globalAssumptions.userId, userId)");
    expect(src).toContain(".update(globalAssumptions)");
    expect(src).toContain(".where(eq(globalAssumptions.id, ownRow.id))");
  });
});

describe("Storage Layer — FinancialStorage (Scenarios)", () => {
  const src = readStorageFile("financial.ts");

  it("getScenariosByUser filters by userId", () => {
    expect(src).toContain("eq(scenarios.userId, userId)");
  });

  it("createScenario returns the created record", () => {
    expect(src).toContain(".insert(scenarios)");
    expect(src).toContain(".returning()");
  });

  it("updateScenario sets updatedAt on every update", () => {
    const methodStart = src.indexOf("async updateScenario(");
    const methodEnd = src.indexOf("async updateScenarioComputedResults(");
    const methodBody = src.slice(methodStart, methodEnd);
    expect(methodBody).toContain("updatedAt: new Date()");
  });

  it("softDeleteScenario sets deletedAt and purgeAfter", () => {
    expect(src).toContain("async softDeleteScenario(");
    expect(src).toContain("deletedAt: now");
    expect(src).toContain("purgeAfter: purge");
  });

  it("hardDeleteScenario uses eq on id", () => {
    expect(src).toContain("db.delete(scenarios).where(eq(scenarios.id, id))");
  });
});

describe("Storage Layer — loadScenario integrity", () => {
  const src = readStorageFile("financial.ts");

  const loadStart = src.indexOf("async loadScenario(");
  const loadEnd = src.indexOf("/** Fetch all fee categories");
  const loadBody = src.slice(loadStart, loadEnd);

  const stableStart = src.indexOf("async function stableLoadProperties(");
  const destructiveStart = src.indexOf("async function destructiveLoadProperties(");
  const stableBody = src.slice(stableStart, destructiveStart);
  const classStart = src.indexOf("export class FinancialStorage");
  const destructiveBody = src.slice(destructiveStart, classStart);

  it("runs inside a transaction", () => {
    expect(loadBody).toContain("db.transaction(");
  });

  it("scopes global assumptions write to the caller's userId (tenant isolation)", () => {
    expect(loadBody).toContain("eq(globalAssumptions.userId, userId)");
    expect(loadBody).not.toContain("isNull(globalAssumptions.userId)");
  });

  it("branches on USE_STABLE_SCENARIO_LOAD feature flag", () => {
    expect(loadBody).toContain("USE_STABLE_SCENARIO_LOAD");
    expect(loadBody).toContain("stableLoadProperties");
    expect(loadBody).toContain("destructiveLoadProperties");
  });

  it("stable path matches by stableKey and updates in place", () => {
    expect(stableBody).toContain("liveByStableKey");
    expect(stableBody).toContain("tx.update(properties)");
    expect(stableBody).toContain("eq(properties.id, liveProp.id)");
  });

  it("stable path inserts new properties not matched by stableKey", () => {
    expect(stableBody).toContain("tx.insert(properties)");
  });

  it("stable path soft-archives orphaned properties (isActive=false, no delete)", () => {
    expect(stableBody).toContain("isActive: false");
    expect(stableBody).not.toContain("tx.delete(properties)");
  });

  it("destructive fallback deletes all user properties then inserts", () => {
    expect(destructiveBody).toContain("tx.delete(properties).where(eq(properties.userId, userId))");
    expect(destructiveBody).toContain("tx.insert(properties)");
  });

  it("delegates fee category sync to syncFeeCategories function", () => {
    expect(loadBody).toContain("syncFeeCategories(tx, resolvedProperties, savedFeeCategories)");
  });

  it("strips id/createdAt/updatedAt/userId from restored global assumptions", () => {
    expect(loadBody).toContain("id: _gaId");
    expect(loadBody).toContain("createdAt: _gaCreated");
    expect(loadBody).toContain("updatedAt: _gaUpdated");
    expect(loadBody).toContain("userId: _gaUser");
  });

  it("strips auto fields from restored properties via stripAutoFields", () => {
    expect(stableBody).toContain("stripAutoFields(prop)");
  });
});

describe("Storage Layer — UserStorage", () => {
  const src = readStorageFile("users.ts");

  it("exists and exports UserStorage class", () => {
    expect(src).toContain("export class UserStorage");
  });

  it("has getUserById method", () => {
    expect(src).toContain("async getUserById(");
  });

  it("has createUser method", () => {
    expect(src).toContain("async createUser(");
  });
});

describe("Storage Layer — PhotoStorage", () => {
  const src = readStorageFile("photos.ts");

  it("exports PhotoStorage class", () => {
    expect(src).toContain("export class PhotoStorage");
  });

  it("getPropertyPhotos orders by sortOrder ascending", () => {
    expect(src).toContain("orderBy(asc(propertyPhotos.sortOrder))");
  });

  it("getHeroPhoto filters by propertyId AND isHero", () => {
    expect(src).toContain("eq(propertyPhotos.propertyId, propertyId)");
    expect(src).toContain("eq(propertyPhotos.isHero, true)");
  });

  it("addPropertyPhoto auto-sets hero if first photo in album", () => {
    expect(src).toContain("const isFirst = existing.length === 0");
    expect(src).toContain("isHero: isFirst ? true");
  });

  it("addPropertyPhoto syncs hero URL to properties.imageUrl", () => {
    expect(src).toContain("imageUrl: resolvedImageUrl");
  });

  it("deletePropertyPhoto promotes next photo when hero is deleted", () => {
    expect(src).toContain("if (photo.isHero)");
    expect(src).toContain("set({ isHero: true })");
    expect(src).toContain("imageUrl: remaining[0].imageUrl");
  });

  it("setHeroPhoto clears all heroes before setting new one", () => {
    expect(src).toContain("set({ isHero: false })");
    const clearIdx = src.indexOf("set({ isHero: false })");
    const setIdx = src.indexOf("set({ isHero: true })", clearIdx + 1);
    expect(clearIdx).toBeGreaterThan(-1);
    expect(setIdx).toBeGreaterThan(clearIdx);
  });

  it("setHeroPhoto scopes to propertyId to prevent cross-property hero", () => {
    const setHeroStart = src.indexOf("async setHeroPhoto(");
    const setHeroEnd = src.indexOf("async reorderPhotos(");
    const body = src.slice(setHeroStart, setHeroEnd);
    // Both the clear and set operations filter by propertyId
    expect(body).toContain("eq(propertyPhotos.propertyId, propertyId)");
  });

  it("reorderPhotos sets sortOrder for all photos in single statement", () => {
    expect(src).toContain("async reorderPhotos(");
    expect(src).toContain("CASE id");
    expect(src).toContain("sort_order");
  });

  it("hero sync updates properties.imageUrl within transaction", () => {
    expect(src).toContain("db.transaction");
    expect(src).toContain("imageUrl");
    expect(src).toContain("eq(properties.id");
  });
});

describe("Storage Layer — loadScenario photo decoupling", () => {
  const src = readStorageFile("financial.ts");
  const loadStart = src.indexOf("async loadScenario(");
  const loadEnd = src.indexOf("/** Fetch all fee categories");
  const loadBody = src.slice(loadStart, loadEnd);

  it("loadScenario accepts savedPropertyPhotos parameter for backward compat", () => {
    expect(loadBody).toContain("_savedPropertyPhotos");
  });

  it("neither stable nor destructive path inserts or deletes photos", () => {
    expect(loadBody).not.toContain("tx.insert(propertyPhotos)");
    expect(loadBody).not.toContain("tx.delete(propertyPhotos)");
  });

  it("stable path uses stableKey-based property matching", () => {
    const stableStart = src.indexOf("async function stableLoadProperties(");
    const stableEnd = src.indexOf("async function destructiveLoadProperties(");
    const stableBody = src.slice(stableStart, stableEnd);
    expect(stableBody).toContain("liveByStableKey");
    expect(stableBody).toContain("snapshotStableKeys");
  });

  it("stable path soft-archives orphans instead of deleting (FK cascade safety)", () => {
    const stableStart = src.indexOf("async function stableLoadProperties(");
    const stableEnd = src.indexOf("async function destructiveLoadProperties(");
    const stableBody = src.slice(stableStart, stableEnd);
    expect(stableBody).toContain("isActive: false");
    expect(stableBody).not.toContain("tx.delete(properties)");
  });
});

describe("Storage Layer — Index delegates to sub-modules", () => {
  const src = readStorageFile("index.ts");

  it("imports all sub-module storage classes", () => {
    expect(src).toContain("UserStorage");
    expect(src).toContain("PropertyStorage");
    expect(src).toContain("FinancialStorage");
    expect(src).toContain("PhotoStorage");
  });

  it("exports IStorage interface", () => {
    expect(src).toContain("export interface IStorage");
  });

  it("exports DatabaseStorage class", () => {
    expect(src).toContain("export class DatabaseStorage");
  });

  it("binds scenario methods from financial sub-module", () => {
    expect(src).toContain("getScenariosByUser");
    expect(src).toContain("createScenario");
    expect(src).toContain("loadScenario");
  });
});
