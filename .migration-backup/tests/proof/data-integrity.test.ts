import { describe, it, expect, beforeAll } from "vitest";
import { db } from "../../server/db.js";
import { globalAssumptions, properties } from "../../shared/schema/index.js";
import { isNull, isNotNull, sql } from "drizzle-orm";

// Skip entire suite when DB has no seed data (e.g. CI with empty test DB).
// TODO: Add db:seed step to CI so these tests run everywhere.
let hasData = false;
beforeAll(async () => {
  try {
    const [row] = await db.select({ id: globalAssumptions.id }).from(globalAssumptions).limit(1);
    hasData = !!row;
  } catch {
    hasData = false;
  }
});

describe("Data Integrity — Shared Row Uniqueness", () => {
  describe("Global Assumptions", () => {
    it("has exactly one shared row (userId IS NULL)", async () => {
      if (!hasData) return; // skip in unseeded CI
      const rows = await db
        .select({ id: globalAssumptions.id })
        .from(globalAssumptions)
        .where(isNull(globalAssumptions.userId));
      expect(rows.length, "Must have exactly 1 shared global_assumptions row").toBe(1);
    });

    it("getGlobalAssumptions returns the newest shared row", async () => {
      if (!hasData) return;
      const rows = await db
        .select({ id: globalAssumptions.id })
        .from(globalAssumptions)
        .where(isNull(globalAssumptions.userId))
        .orderBy(sql`id DESC`)
        .limit(1);
      expect(rows.length).toBeGreaterThanOrEqual(1);

      const allShared = await db
        .select({ id: globalAssumptions.id })
        .from(globalAssumptions)
        .where(isNull(globalAssumptions.userId));
      const maxId = Math.max(...allShared.map(r => r.id));
      expect(rows[0].id, "Query must return the highest-id shared row").toBe(maxId);
    });

    // Phase B regression: getGlobalAssumptions was collapsed from 2 sequential
    // SELECTs to 1 SELECT ordered by a CASE expression encoding the 3-tier
    // precedence (own userId → NULL fallback → any other row, with desc(id)
    // tie-break on each tier). Verify the storage method honors that precedence.
    it("getGlobalAssumptions falls back to NULL-userId row when userId has no own row", async () => {
      if (!hasData) return;
      const { GlobalAssumptionsStorage } = await import("../../server/storage/financial/global-assumptions.js");
      const storage = new GlobalAssumptionsStorage();

      // Use a userId guaranteed not to have an own row (huge sentinel value).
      const NO_OWN_ROW_USER_ID = 2_147_483_640;
      const result = await storage.getGlobalAssumptions(NO_OWN_ROW_USER_ID);

      expect(result, "Must return some row even when userId has no own entry").toBeDefined();
      // When no own row exists, the NULL-userId shared row wins over any other.
      // (The "any other" tier is only reached if there is also no NULL row — not
      // the case in a seeded DB per the test above.)
      expect(result?.userId, "Fallback must be the NULL-userId shared row").toBeNull();
    });

    it("getGlobalAssumptions returns NULL-userId row when userId is omitted", async () => {
      if (!hasData) return;
      const { GlobalAssumptionsStorage } = await import("../../server/storage/financial/global-assumptions.js");
      const storage = new GlobalAssumptionsStorage();

      const result = await storage.getGlobalAssumptions();
      expect(result).toBeDefined();
      expect(result?.userId, "No-userId call must return the NULL-userId shared row").toBeNull();
    });
  });

  describe("Properties — Shared Ownership", () => {
    it("all portfolio properties have userId = NULL (shared)", async () => {
      if (!hasData) return;
      const owned = await db
        .select({ id: properties.id, name: properties.name, userId: properties.userId })
        .from(properties)
        .where(isNotNull(properties.userId));
      expect(
        owned,
        `Found ${owned.length} properties with non-null userId: ${owned.map(p => `${p.name} (id=${p.id}, userId=${p.userId})`).join(", ")}`
      ).toHaveLength(0);
    });

    it("all properties are visible to every authenticated user", async () => {
      if (!hasData) return;
      const allProps = await db.select({ id: properties.id }).from(properties);
      const sharedProps = await db
        .select({ id: properties.id })
        .from(properties)
        .where(isNull(properties.userId));
      expect(
        sharedProps.length,
        "Shared properties count must equal total properties count"
      ).toBe(allProps.length);
    });
  });

  describe("No Orphaned Duplicates", () => {
    it("no duplicate property names exist", async () => {
      if (!hasData) return;
      const dupes = await db.execute(sql`
        SELECT name, COUNT(*) as cnt
        FROM properties
        GROUP BY name
        HAVING COUNT(*) > 1
      `);
      expect(
        dupes.rows,
        `Duplicate property names: ${dupes.rows.map((r: any) => r.name).join(", ")}`
      ).toHaveLength(0);
    });

    it("no duplicate shared global_assumptions rows", async () => {
      if (!hasData) return;
      const rows = await db
        .select({ id: globalAssumptions.id })
        .from(globalAssumptions)
        .where(isNull(globalAssumptions.userId));
      expect(rows.length, "Only 1 shared global_assumptions row allowed").toBeLessThanOrEqual(1);
    });
  });
});
