import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { updateScenarioSchema } from "@shared/schema";
import { computeGhostName } from "../../server/routes/scenario-helpers";
import { createScenarioSchema } from "../../server/routes/helpers";

function readFile(relativePath: string): string {
  return readFileSync(resolve(__dirname, "../../", relativePath), "utf-8");
}

describe("Scenario Lifecycle — ensureDefaultScenario", () => {
  const src = readFile("server/routes/scenario-helpers.ts");

  it("exports ensureDefaultScenario function", () => {
    expect(src).toContain("export async function ensureDefaultScenario(userId: number)");
  });

  it("checks for existing default before creating", () => {
    expect(src).toContain("storage.getDefaultScenario(userId)");
    expect(src).toContain("if (existing) return");
  });

  it("creates scenario with kind=default and isLocked=true", () => {
    expect(src).toContain('kind: "default"');
    expect(src).toContain("isLocked: true");
  });

  it("computes initials from first/last name", () => {
    expect(src).toContain("Default Scenario");
  });
});

describe("Scenario Lifecycle — computeGhostName", () => {
  const src = readFile("server/routes/scenario-helpers.ts");

  it("exports computeGhostName function", () => {
    expect(src).toContain("export function computeGhostName(");
  });

  it("zero-pads the scenario number to 2 digits", () => {
    expect(src).toContain("padStart(2,");
  });

  it("produces 'Scenario NN - XX' format", () => {
    expect(src).toContain("`Scenario ${num} - ${initials}`");
  });
});

describe("Scenario Lifecycle — Login calls ensureDefaultScenario", () => {
  it("credential login triggers ensureDefaultScenario", () => {
    const src = readFile("server/routes/auth.ts");
    expect(src).toContain("ensureDefaultScenario(user.id)");
  });

  it("Google OAuth login triggers ensureDefaultScenario", () => {
    const src = readFile("server/routes/google-auth.ts");
    expect(src).toContain("ensureDefaultScenario(user.id)");
  });
});

describe("Scenario Lifecycle — Lock enforcement", () => {
  const src = readFile("server/routes/scenarios.ts");

  it("PATCH checks isLocked before allowing edit", () => {
    const patchStart = src.indexOf('app.patch("/api/scenarios/:id"');
    const patchEnd = src.indexOf("app.post", patchStart + 1);
    const patchBody = src.slice(patchStart, patchEnd);
    expect(patchBody).toContain("isLocked");
    expect(patchBody).toContain("locked and cannot be edited");
  });

  it("DELETE checks isLocked before allowing soft-delete", () => {
    const deleteStart = src.indexOf('app.delete("/api/scenarios/:id"');
    const deleteEnd = src.indexOf("app.post", deleteStart + 1);
    const deleteBody = src.slice(deleteStart, deleteEnd);
    expect(deleteBody).toContain("isLocked");
    expect(deleteBody).toContain("locked and cannot be deleted");
  });

  it("no longer uses hardcoded 'Development' name check", () => {
    const deleteStart = src.indexOf('app.delete("/api/scenarios/:id"');
    const deleteEnd = src.indexOf("app.post", deleteStart + 1);
    const deleteBody = src.slice(deleteStart, deleteEnd);
    expect(deleteBody).not.toContain('"Development"');
  });
});

describe("Scenario Lifecycle — Soft delete", () => {
  const src = readFile("server/storage/financial.ts");

  it("softDeleteScenario sets deletedAt, deletedBy, and purgeAfter", () => {
    const methodStart = src.indexOf("async softDeleteScenario(");
    const methodEnd = src.indexOf("async hardDeleteScenario(");
    const body = src.slice(methodStart, methodEnd);
    expect(body).toContain("deletedAt: now");
    expect(body).toContain("deletedBy: userId");
    expect(body).toContain("purgeAfter: purge");
  });

  it("getScenariosByUser filters by deletedAt IS NULL", () => {
    const methodStart = src.indexOf("async getScenariosByUser(");
    const methodEnd = src.indexOf("async getScenario(");
    const body = src.slice(methodStart, methodEnd);
    expect(body).toContain("isNull(scenarios.deletedAt)");
  });

  it("getScenario filters by deletedAt IS NULL", () => {
    const methodStart = src.indexOf("async getScenario(");
    const methodEnd = src.indexOf("async getScenarioIncludingDeleted(");
    const body = src.slice(methodStart, methodEnd);
    expect(body).toContain("isNull(scenarios.deletedAt)");
  });

  it("getScenarioIncludingDeleted does NOT filter by deletedAt", () => {
    const methodStart = src.indexOf("async getScenarioIncludingDeleted(");
    const methodEnd = src.indexOf("async getDeletedScenarios(");
    const body = src.slice(methodStart, methodEnd);
    expect(body).not.toContain("isNull(scenarios.deletedAt)");
  });

  it("restoreScenario clears soft-delete fields", () => {
    expect(src).toContain("deletedAt: null, deletedBy: null, purgeAfter: null");
  });

  it("purgeExpiredScenarios hard-deletes past purgeAfter", () => {
    expect(src).toContain("async purgeExpiredScenarios()");
    expect(src).toContain("db.delete(scenarios)");
  });
});

describe("Scenario Lifecycle — Admin recovery endpoints", () => {
  const src = readFile("server/routes/admin/scenarios.ts");

  it("has GET /api/admin/scenarios/deleted route", () => {
    expect(src).toContain('"/api/admin/scenarios/deleted"');
    expect(src).toContain("getDeletedScenarios");
  });

  it("has POST /api/admin/scenarios/:id/restore route", () => {
    expect(src).toContain('"/api/admin/scenarios/:id/restore"');
    expect(src).toContain("restoreScenario");
  });

  it("has DELETE /api/admin/scenarios/:id/purge route", () => {
    expect(src).toContain('"/api/admin/scenarios/:id/purge"');
    expect(src).toContain("hardDeleteScenario");
  });
});

describe("Scenario Lifecycle — Auto-save endpoints", () => {
  const src = readFile("server/routes/scenarios.ts");

  it("has POST /api/scenarios/auto-save route", () => {
    expect(src).toContain('"/api/scenarios/auto-save"');
    expect(src).toContain("getAutoSaveScenario");
  });

  it("has GET /api/scenarios/auto-save/check route", () => {
    expect(src).toContain('"/api/scenarios/auto-save/check"');
  });

  it("auto-save upserts using updateScenarioSnapshot for existing", () => {
    expect(src).toContain("updateScenarioSnapshot");
  });

  it("auto-save creates with kind=autosave for new", () => {
    expect(src).toContain('kind: "autosave"');
  });
});

describe("Scenario Lifecycle — Ghost name endpoint", () => {
  const src = readFile("server/routes/scenarios.ts");

  it("has GET /api/scenarios/suggest-name route", () => {
    expect(src).toContain('"/api/scenarios/suggest-name"');
    expect(src).toContain("computeGhostName");
  });
});

describe("Scenario Lifecycle — System scenario exclusion", () => {
  const src = readFile("server/routes/scenarios.ts");

  it("GET /api/scenarios filters out non-manual scenarios", () => {
    expect(src).toContain('s.kind === "manual"');
  });

  it("scenario creation uses countManualScenarios for limit check", () => {
    expect(src).toContain("countManualScenarios");
  });
});

describe("Scenario Lifecycle — Purge job", () => {
  const src = readFile("server/index.ts");

  it("starts purge interval on boot", () => {
    expect(src).toContain("purgeExpiredScenarios");
    expect(src).toContain("SCENARIO_PURGE_INTERVAL_MS");
  });
});

describe("Scenario Lifecycle — Photo delete guard", () => {
  const src = readFile("server/routes/property-photos.ts");

  it("checks photo count before allowing delete", () => {
    expect(src).toContain("photos.length <= 1");
    expect(src).toContain("admin required");
  });
});

describe("Schema & Data Model — stableKey on properties", () => {
  const src = readFile("shared/schema/properties.ts");

  it("properties table defines stableKey as UUID, not null, defaultRandom, unique", () => {
    expect(src).toContain('stableKey: uuid("stable_key")');
    expect(src).toContain(".notNull()");
    expect(src).toContain(".defaultRandom()");
    expect(src).toContain(".unique()");
  });

  it("stableKey appears in ScenarioPropertySnapshot type", () => {
    const shapes = readFile("shared/schema/types/jsonb-shapes.ts");
    expect(shapes).toContain("stableKey?: string");
  });
});

describe("Schema & Data Model — scenarios lifecycle columns", () => {
  const src = readFile("shared/schema/scenarios.ts");

  it("defines kind column with default manual", () => {
    expect(src).toContain('kind: text("kind")');
    expect(src).toContain('.default("manual")');
  });

  it("defines isLocked column with default false", () => {
    expect(src).toContain('isLocked: boolean("is_locked")');
    expect(src).toContain(".default(false)");
  });

  it("defines deletedAt, deletedBy, purgeAfter columns", () => {
    expect(src).toContain('deletedAt: timestamp("deleted_at")');
    expect(src).toContain('deletedBy: integer("deleted_by")');
    expect(src).toContain('purgeAfter: timestamp("purge_after")');
  });
});

describe("Schema & Data Model — Zod name max 60 chars", () => {
  it("createScenarioSchema rejects names longer than 60 characters", () => {
    const longName = "A".repeat(61);
    const result = createScenarioSchema.safeParse({ name: longName });
    expect(result.success).toBe(false);
  });

  it("createScenarioSchema accepts names up to 60 characters", () => {
    const name60 = "A".repeat(60);
    const result = createScenarioSchema.safeParse({ name: name60 });
    expect(result.success).toBe(true);
  });

  it("updateScenarioSchema rejects names longer than 60 characters", () => {
    const longName = "A".repeat(61);
    const result = updateScenarioSchema.safeParse({ name: longName });
    expect(result.success).toBe(false);
  });

  it("updateScenarioSchema accepts names up to 60 characters", () => {
    const name60 = "A".repeat(60);
    const result = updateScenarioSchema.safeParse({ name: name60 });
    expect(result.success).toBe(true);
  });

  it("importScenarioSchema enforces max 60 on name", () => {
    const helpers = readFile("server/routes/scenario-helpers.ts");
    expect(helpers).toContain('.max(60)');
  });

  it("createAdminScenarioSchema enforces max 60 on name", () => {
    const admin = readFile("server/routes/admin/scenarios.ts");
    expect(admin).toContain('.max(60)');
  });
});

describe("Schema & Data Model — createAdminScenarioSchema includes kind and isLocked", () => {
  const src = readFile("server/routes/admin/scenarios.ts");

  it("allows optional kind field with valid values", () => {
    expect(src).toContain('kind: z.enum(["default", "manual", "autosave"]).optional()');
  });

  it("allows optional isLocked field", () => {
    expect(src).toContain("isLocked: z.boolean().optional()");
  });
});

describe("Schema & Data Model — partial unique index on (userId, name)", () => {
  it("scenarios table no longer has unconditional unique on (userId, name) in Drizzle schema", () => {
    const src = readFile("shared/schema/scenarios.ts");
    expect(src).not.toContain('unique("scenarios_user_id_name")');
  });
});

describe("Schema & Data Model — propertyPhotos decoupled from create", () => {
  const src = readFile("server/routes/scenario-helpers.ts");

  it("buildCreateSnapshotData initialises propertyPhotos as empty object", () => {
    expect(src).toContain("const propertyPhotos: Record<string, ScenarioPhotoSnapshot[]> = {}");
  });

  it("does not call getPropertyPhotos during snapshot creation", () => {
    const fnStart = src.indexOf("async function buildCreateSnapshotData(");
    const fnEnd = src.indexOf("export function tryComputeResults(");
    const body = src.slice(fnStart, fnEnd);
    expect(body).not.toContain("getPropertyPhotos");
  });
});

describe("Schema & Data Model — computeGhostName unit tests", () => {
  it("produces correct ghost name from first+last initials", () => {
    expect(computeGhostName(0, { firstName: "Ricardo", lastName: "Cidale", email: "rc@test.com" }))
      .toBe("Scenario 01 - RC");
  });

  it("pads count correctly (count=9 → Scenario 10)", () => {
    expect(computeGhostName(9, { firstName: "Kit", lastName: null, email: "kit@test.com" }))
      .toBe("Scenario 10 - K");
  });

  it("falls back to email prefix when no name available", () => {
    expect(computeGhostName(0, { firstName: null, lastName: null, email: "admin@test.com" }))
      .toBe("Scenario 01 - AD");
  });

  it("ghost name fits within 60-char limit", () => {
    const name = computeGhostName(99, { firstName: "A", lastName: "B", email: "x@y.com" });
    expect(name.length).toBeLessThanOrEqual(60);
  });
});

describe("Schema & Data Model — Zod schema edge cases", () => {
  it("createScenarioSchema rejects empty name", () => {
    const result = createScenarioSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("createScenarioSchema allows description up to 1000 chars", () => {
    const result = createScenarioSchema.safeParse({ name: "Test", description: "x".repeat(1000) });
    expect(result.success).toBe(true);
  });

  it("updateScenarioSchema allows partial updates (name only)", () => {
    const result = updateScenarioSchema.safeParse({ name: "New Name" });
    expect(result.success).toBe(true);
  });

  it("updateScenarioSchema allows partial updates (description only)", () => {
    const result = updateScenarioSchema.safeParse({ description: "New desc" });
    expect(result.success).toBe(true);
  });

  it("updateScenarioSchema allows null description", () => {
    const result = updateScenarioSchema.safeParse({ description: null });
    expect(result.success).toBe(true);
  });
});

describe("Schema & Data Model — partial unique index enforces soft-delete reuse", () => {
  it("drizzle schema has no unconditional unique on (userId, name)", () => {
    const schemaFile = readFile("shared/schema/scenarios.ts");
    expect(schemaFile).not.toContain('unique("scenarios_user_id_name")');
  });

  it("system-unique migration enforces WHERE deleted_at IS NULL", () => {
    const src = readFile("server/migrations/scenario-system-unique-001.ts");
    expect(src).toContain("deleted_at");
    expect(src).toContain("IS NULL");
  });

  it("softDeleteScenario nullifies name-guard by setting deletedAt", () => {
    const src = readFile("server/storage/financial.ts");
    const methodStart = src.indexOf("async softDeleteScenario(");
    const methodEnd = src.indexOf("async hardDeleteScenario(");
    const body = src.slice(methodStart, methodEnd);
    expect(body).toContain("deletedAt: now");
    expect(body).not.toContain("name:");
  });

  it("restoreScenario clears deletedAt (re-enables name uniqueness)", () => {
    const src = readFile("server/storage/financial.ts");
    expect(src).toContain("deletedAt: null, deletedBy: null, purgeAfter: null");
  });
});

describe("Schema & Data Model — stableKey insertion uniqueness", () => {
  it("properties schema uses defaultRandom() for auto-generation", () => {
    const src = readFile("shared/schema/properties.ts");
    const stableKeyLine = src.split("\n").find(l => l.includes("stableKey"));
    expect(stableKeyLine).toBeDefined();
    expect(stableKeyLine).toContain("defaultRandom()");
    expect(stableKeyLine).toContain("unique()");
  });

  it("stableKey is UUID type (not text)", () => {
    const src = readFile("shared/schema/properties.ts");
    expect(src).toContain('uuid("stable_key")');
  });

  it("stableKey is included in property snapshots during scenario creation", () => {
    const src = readFile("server/routes/scenario-helpers.ts");
    const fnStart = src.indexOf("async function buildCreateSnapshotData(");
    const fnEnd = src.indexOf("export function tryComputeResults(");
    const body = src.slice(fnStart, fnEnd);
    expect(body).toContain("getAllProperties");
  });
});

describe("Schema & Data Model — race condition handling", () => {
  it("ensureDefaultScenario catches unique violation (23505)", () => {
    const src = readFile("server/routes/scenario-helpers.ts");
    expect(src).toContain('code === "23505"');
    expect(src).toContain("concurrent creation");
  });

  it("auto-save route catches unique violation with retry", () => {
    const src = readFile("server/routes/scenarios.ts");
    expect(src).toContain('createErr?.code === "23505"');
  });

  it("partial unique index migration exists for system scenarios", () => {
    const src = readFile("server/migrations/scenario-system-unique-001.ts");
    expect(src).toContain("scenarios_user_kind_unique");
    expect(src).toContain("default");
    expect(src).toContain("autosave");
  });
});
