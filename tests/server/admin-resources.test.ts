/**
 * P2 contract tests for the Resources control plane.
 *
 * Covers four concerns:
 *   1. Storage layer (real DB): CRUD + version history + rollback +
 *      idempotent catalog sync + impact list resolution.
 *   2. Public-view shape: secret_ref never appears in any serialized form.
 *   3. Route layer (mocked storage): create/update/rollback responses,
 *      impact list returned alongside updates, version-history secret
 *      redaction, super-admin gating on break-glass routes.
 *   4. Catalog flattening: pure function used by the sync job.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import type { Express, Request, Response, NextFunction, RequestHandler } from "express";

// ── Shared schema imports (no mocking — real types, real Zod) ───────────────
import {
  toResourcePublicView,
  insertAdminResourceSchema,
  insertBreakGlassOverrideSchema,
  type AdminResourceRow,
  type ResourcePublicView,
} from "@shared/schema";
import { flattenCatalogDeclarations } from "../../server/jobs/catalog-sync";
import { SPECIALIST_CATALOG } from "../../engine/analyst/registry/specialist-catalog";

// ════════════════════════════════════════════════════════════════════════════
// Group 1 — Storage layer against the real DB
// ════════════════════════════════════════════════════════════════════════════

describe("AdminResourceStorage (real DB)", () => {
  // Test isolation: every test creates resources with a unique slug suffix and
  // cleans them up after. Specialist_assignments + break_glass overrides are
  // wiped at the start of each test for full determinism.
  let storageMod: typeof import("../../server/storage/admin-resource");
  let store: InstanceType<typeof storageMod.AdminResourceStorage>;
  let db: typeof import("../../server/db").db;
  let actorUserId: number;

  beforeAll(async () => {
    storageMod = await import("../../server/storage/admin-resource");
    store = new storageMod.AdminResourceStorage();
    const dbMod = await import("../../server/db");
    db = dbMod.db;

    // Borrow any existing user id (test seed should always have at least the
    // admin user). Falls back to inserting a throwaway user if none exists.
    const { users } = await import("@shared/schema");
    const rows = await db.select().from(users).limit(1);
    if (rows.length > 0) {
      actorUserId = rows[0].id;
    } else {
      const [u] = await db
        .insert(users)
        .values({
          email: `p2-test-${Date.now()}@example.test`,
          passwordHash: null,
          role: "admin",
          firstName: "P2",
          lastName: "Test",
        })
        .returning();
      actorUserId = u.id;
    }
  });

  beforeEach(async () => {
    const { adminResources, adminResourceVersions, specialistAssignments, auditBreakGlassOverrides } =
      await import("@shared/schema");
    // Cascade order: child rows first.
    await db.delete(specialistAssignments);
    await db.delete(auditBreakGlassOverrides);
    await db.delete(adminResourceVersions);
    await db.delete(adminResources);
  });

  afterAll(async () => {
    const { adminResources, adminResourceVersions, specialistAssignments, auditBreakGlassOverrides } =
      await import("@shared/schema");
    await db.delete(specialistAssignments);
    await db.delete(auditBreakGlassOverrides);
    await db.delete(adminResourceVersions);
    await db.delete(adminResources);
  });

  it("create writes a v1 row and a v1 version snapshot", async () => {
    const row = await store.createAdminResource(
      {
        kind: "api",
        slug: "p2-test-create",
        displayName: "P2 Test API",
        description: "init",
        config: { baseUrl: "https://example.test" },
        secretRef: "P2_TEST_SECRET",
      },
      actorUserId,
    );
    expect(row.version).toBe(1);
    expect(row.lastHealthStatus).toBe("gray");
    const versions = await store.listAdminResourceVersions(row.id);
    expect(versions).toHaveLength(1);
    expect(versions[0].version).toBe(1);
    expect(versions[0].changeSummary).toBe("created");
  });

  it("update bumps version, appends a snapshot, and preserves prior config", async () => {
    const row = await store.createAdminResource(
      {
        kind: "model",
        slug: "p2-test-update",
        displayName: "Initial",
        config: { temperature: 0.2 },
      },
      actorUserId,
    );
    const updated = await store.updateAdminResource(
      row.id,
      { displayName: "Renamed", config: { temperature: 0.7 }, changeSummary: "tweak temp" },
      actorUserId,
    );
    expect(updated?.version).toBe(2);
    expect(updated?.displayName).toBe("Renamed");
    const versions = await store.listAdminResourceVersions(row.id);
    expect(versions).toHaveLength(2);
    // Versions are returned newest-first.
    expect(versions[0].version).toBe(2);
    expect(versions[1].version).toBe(1);
    expect(versions[1].config).toEqual({ temperature: 0.2 });
  });

  it("rollback re-applies a past version as a new version (history append-only)", async () => {
    const row = await store.createAdminResource(
      { kind: "api", slug: "p2-test-rollback", displayName: "v1", config: { x: 1 } },
      actorUserId,
    );
    await store.updateAdminResource(row.id, { displayName: "v2", config: { x: 2 } }, actorUserId);
    await store.updateAdminResource(row.id, { displayName: "v3", config: { x: 3 } }, actorUserId);

    const rolled = await store.rollbackAdminResource(row.id, 1, actorUserId);
    expect(rolled?.version).toBe(4);
    expect(rolled?.displayName).toBe("v1");
    expect(rolled?.config).toEqual({ x: 1 });

    const versions = await store.listAdminResourceVersions(row.id);
    expect(versions.map((v) => v.version)).toEqual([4, 3, 2, 1]);
    expect(versions[0].changeSummary).toBe("rollback to v1");
  });

  it("rollback returns undefined when target version does not exist", async () => {
    const row = await store.createAdminResource(
      { kind: "table", slug: "p2-test-bad-rollback", displayName: "x", config: {} },
      actorUserId,
    );
    const result = await store.rollbackAdminResource(row.id, 99, actorUserId);
    expect(result).toBeUndefined();
  });

  it("delete cascades version snapshots", async () => {
    const row = await store.createAdminResource(
      { kind: "benchmark", slug: "p2-test-delete", displayName: "x", config: {} },
      actorUserId,
    );
    await store.updateAdminResource(row.id, { displayName: "y" }, actorUserId);
    expect(await store.deleteAdminResource(row.id)).toBe(true);
    expect(await store.listAdminResourceVersions(row.id)).toEqual([]);
  });

  it("syncSpecialistCatalog is idempotent (second run reports zero work)", async () => {
    const decls = [
      { specialistId: "test.alpha", assignmentKind: "model" as const, assignmentSlug: "primary-llm", assignmentRole: "tier-1", required: true },
      { specialistId: "test.alpha", assignmentKind: "benchmark" as const, assignmentSlug: "x-bench", assignmentRole: null, required: false },
    ];
    const first = await store.syncSpecialistCatalog(decls);
    expect(first.inserted).toBe(2);
    expect(first.removed).toBe(0);
    expect(first.unresolvedSlugs).toBe(2); // No matching admin_resources rows yet.

    const second = await store.syncSpecialistCatalog(decls);
    expect(second.inserted).toBe(0);
    expect(second.updated).toBe(0);
    expect(second.removed).toBe(0);
  });

  it("syncSpecialistCatalog resolves slugs to resource ids and removes stale rows", async () => {
    const resource = await store.createAdminResource(
      { kind: "api", slug: "web-search", displayName: "Web Search", config: {} },
      actorUserId,
    );
    const initial = [
      { specialistId: "test.gamma", assignmentKind: "api" as const, assignmentSlug: "web-search", assignmentRole: null, required: true },
      { specialistId: "test.gamma", assignmentKind: "model" as const, assignmentSlug: "obsolete-model", assignmentRole: null, required: true },
    ];
    await store.syncSpecialistCatalog(initial);

    // Drop one declaration, keep the other → should remove the dropped one.
    const trimmed = [initial[0]];
    const result = await store.syncSpecialistCatalog(trimmed);
    expect(result.removed).toBe(1);
    const remaining = await store.listSpecialistAssignments("test.gamma");
    expect(remaining).toHaveLength(1);
    expect(remaining[0].resourceId).toBe(resource.id);

    // Impact list should show this Specialist on the resource.
    const impact = await store.listResourceImpact(resource.id);
    expect(impact).toEqual([
      expect.objectContaining({ specialistId: "test.gamma", assignmentKind: "api", assignmentSlug: "web-search", required: true }),
    ]);
  });

  it("createBreakGlassOverride and revoke round-trip", async () => {
    const created = await store.createBreakGlassOverride({
      specialistId: "test.delta",
      assignmentKind: "model",
      assignmentSlug: "primary-llm",
      assignmentRole: null,
      overrideResourceId: null,
      reason: "incident-routing-test",
      expiresAt: new Date(Date.now() + 60_000),
      createdByUserId: actorUserId,
    });
    expect(created.revokedAt).toBeNull();
    const revoked = await store.revokeBreakGlassOverride(created.id, actorUserId);
    expect(revoked?.revokedAt).toBeInstanceOf(Date);
    expect(revoked?.revokedByUserId).toBe(actorUserId);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Group 2 — Public-view secret-redaction guarantees (no DB needed)
// ════════════════════════════════════════════════════════════════════════════

describe("toResourcePublicView — secret redaction", () => {
  function makeRow(overrides: Partial<AdminResourceRow> = {}): AdminResourceRow {
    const now = new Date();
    return {
      id: 1,
      kind: "api",
      slug: "x",
      displayName: "X",
      description: null,
      config: {},
      secretRef: "SECRET_KEY_NAME",
      version: 1,
      lastHealthStatus: "gray",
      lastCheckedAt: null,
      createdByUserId: null,
      updatedByUserId: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    } as AdminResourceRow;
  }

  it("never exposes secretRef as a property", () => {
    const view = toResourcePublicView(makeRow());
    expect(view).not.toHaveProperty("secretRef");
    expect(view.hasSecret).toBe(true);
  });

  it("hasSecret is false when secretRef is null", () => {
    const view = toResourcePublicView(makeRow({ secretRef: null }));
    expect(view.hasSecret).toBe(false);
  });

  it("never echoes the secret-ref value in any serialized representation", () => {
    const view: ResourcePublicView = toResourcePublicView(makeRow({ secretRef: "VERY_SECRET_FRED" }));
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain("VERY_SECRET_FRED");
    expect(serialized).not.toContain("secretRef");
  });

  it("downgrades stale parent.lastHealthStatus='green' to 'amber' on read", () => {
    // api TTL is 60s — a 10-minute-old green must become amber on the wire.
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    const now = new Date();
    const view = toResourcePublicView(
      makeRow({ kind: "api", lastHealthStatus: "green", lastCheckedAt: tenMinAgo }),
      now,
    );
    expect(view.lastHealthStatus).toBe("amber");
  });

  it("preserves fresh green and never upgrades red/amber/gray on read", () => {
    const now = new Date();
    const justNow = new Date(now.getTime() - 1_000);
    const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000);
    expect(toResourcePublicView(makeRow({ kind: "api", lastHealthStatus: "green", lastCheckedAt: justNow }), now).lastHealthStatus).toBe("green");
    expect(toResourcePublicView(makeRow({ kind: "api", lastHealthStatus: "red", lastCheckedAt: tenMinAgo }), now).lastHealthStatus).toBe("red");
    expect(toResourcePublicView(makeRow({ kind: "api", lastHealthStatus: "amber", lastCheckedAt: tenMinAgo }), now).lastHealthStatus).toBe("amber");
    expect(toResourcePublicView(makeRow({ kind: "api", lastHealthStatus: "gray", lastCheckedAt: null }), now).lastHealthStatus).toBe("gray");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Group 2b — secretRef-name redaction in probe outcomes
// ════════════════════════════════════════════════════════════════════════════

describe("runProbe — secretRef name never leaks in errorMessage", () => {
  it("api probe with missing secret does not name the secret key", async () => {
    const { runProbe } = await import("../../server/jobs/probes");
    const result = await runProbe({
      id: 1, kind: "api", slug: "x", displayName: "X", description: null,
      config: { baseUrl: "https://example.test" }, secretRef: "VERY_DISTINCTIVE_SECRET_KEY_NAME_xyz",
      version: 1, lastHealthStatus: "gray", lastCheckedAt: null,
      createdByUserId: null, updatedByUserId: null,
      createdAt: new Date(), updatedAt: new Date(),
    } as AdminResourceRow);
    expect(result.errorCode).toBe("SECRET_MISSING");
    expect(result.errorMessage ?? "").not.toContain("VERY_DISTINCTIVE_SECRET_KEY_NAME_xyz");
  });

  it("model probe with missing secret does not name the secret key", async () => {
    const { runProbe } = await import("../../server/jobs/probes");
    const result = await runProbe({
      id: 1, kind: "model", slug: "x", displayName: "X", description: null,
      config: { provider: "openai" }, secretRef: "ANOTHER_DISTINCTIVE_KEY_NAME_abc",
      version: 1, lastHealthStatus: "gray", lastCheckedAt: null,
      createdByUserId: null, updatedByUserId: null,
      createdAt: new Date(), updatedAt: new Date(),
    } as AdminResourceRow);
    expect(result.errorCode).toBe("SECRET_MISSING");
    expect(result.errorMessage ?? "").not.toContain("ANOTHER_DISTINCTIVE_KEY_NAME_abc");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Group 3 — Route layer (mocked storage + auth) — middleware gating + shapes
// ════════════════════════════════════════════════════════════════════════════

vi.mock("../../server/storage", () => ({
  storage: {
    listAdminResources: vi.fn(),
    getAdminResourceById: vi.fn(),
    getAdminResourceBySlug: vi.fn(),
    createAdminResource: vi.fn(),
    updateAdminResource: vi.fn(),
    deleteAdminResource: vi.fn(),
    listAdminResourceVersions: vi.fn(),
    rollbackAdminResource: vi.fn(),
    listResourceImpact: vi.fn(),
    listSpecialistAssignments: vi.fn(),
    syncSpecialistCatalog: vi.fn(),
    listBreakGlassOverrides: vi.fn(),
    createBreakGlassOverride: vi.fn(),
    revokeBreakGlassOverride: vi.fn(),
    recordProbeResult: vi.fn(),
    getLatestHealthCheck: vi.fn(),
    listHealthChecksForResource: vi.fn(),
    getResourceHealthView: vi.fn(),
    listResourcesDueForHealthCheck: vi.fn(),
    isAdminTestRateLimited: vi.fn(),
    createActivityLog: vi.fn().mockResolvedValue(undefined),
  },
}));

// Auth middleware mocks: switchable via globals so individual tests can flip
// behavior between admin / super-admin / unauth.
let mockUser: { id: number; role: string } | null = { id: 99, role: "super_admin" };
vi.mock("../../server/auth", () => ({
  requireAdmin: (req: Request, res: Response, next: NextFunction) => {
    if (!mockUser) return res.status(401).json({ error: "Authentication required" });
    if (mockUser.role !== "admin" && mockUser.role !== "super_admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
    (req as unknown as { user: typeof mockUser }).user = mockUser;
    next();
  },
  requireSuperAdmin: (req: Request, res: Response, next: NextFunction) => {
    if (!mockUser) return res.status(401).json({ error: "Authentication required" });
    if (mockUser.role !== "super_admin") {
      return res.status(403).json({ error: "Super-admin access required" });
    }
    (req as unknown as { user: typeof mockUser }).user = mockUser;
    next();
  },
}));

vi.mock("../../server/jobs/catalog-sync", async () => {
  const actual = await vi.importActual<typeof import("../../server/jobs/catalog-sync")>(
    "../../server/jobs/catalog-sync",
  );
  return { ...actual, syncSpecialistCatalog: vi.fn().mockResolvedValue({ inserted: 0, updated: 0, removed: 0, unresolvedSlugs: 0 }) };
});

vi.mock("../../server/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { storage } from "../../server/storage";
import { registerAdminResourceRoutes } from "../../server/routes/admin/resources";

type Handlers = Record<string, RequestHandler[]>;

function makeApp(): { app: Express; handlers: Handlers } {
  const handlers: Handlers = {};
  const collect = (method: string) => (path: string, ...rest: RequestHandler[]) => {
    handlers[`${method} ${path}`] = rest;
  };
  const app = {
    get: collect("GET"),
    post: collect("POST"),
    put: collect("PUT"),
    delete: collect("DELETE"),
  } as unknown as Express;
  return { app, handlers };
}

async function invoke(
  handlers: Handlers,
  key: string,
  opts: { params?: Record<string, string>; body?: unknown; query?: Record<string, string> } = {},
): Promise<{ status: number; body: unknown }> {
  const chain = handlers[key];
  if (!chain) throw new Error(`No handler registered for ${key}`);
  let status = 200;
  let body: unknown = undefined;
  const req = {
    params: opts.params ?? {},
    query: opts.query ?? {},
    body: opts.body,
    headers: {},
    ip: "127.0.0.1",
  } as unknown as Request;
  const res = {
    status(code: number) { status = code; return this; },
    json(payload: unknown) { body = payload; return this; },
    end() { return this; },
    locals: {},
  } as unknown as Response;
  let idx = 0;
  const next: NextFunction = (err?: unknown) => {
    if (err) throw err;
    if (idx < chain.length) {
      const h = chain[idx++];
      return h(req, res, next);
    }
  };
  next();
  // Allow async handlers to settle.
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  return { status, body };
}

describe("admin/resources routes — gating + shapes", () => {
  let app: Express;
  let handlers: Handlers;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 99, role: "super_admin" };
    const made = makeApp();
    app = made.app;
    handlers = made.handlers;
    registerAdminResourceRoutes(app);
  });

  it("GET /api/admin/resources strips secretRef in list responses", async () => {
    const now = new Date();
    (storage.listAdminResources as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 1,
        kind: "api",
        slug: "fred",
        displayName: "FRED",
        description: null,
        config: {},
        secretRef: "FRED_API_KEY",
        version: 1,
        lastHealthStatus: "gray",
        lastCheckedAt: null,
        createdByUserId: null,
        updatedByUserId: null,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    const { status, body } = await invoke(handlers, "GET /api/admin/resources");
    expect(status).toBe(200);
    const items = body as Array<Record<string, unknown>>;
    expect(items[0]).toHaveProperty("hasSecret", true);
    expect(items[0]).not.toHaveProperty("secretRef");
    expect(JSON.stringify(body)).not.toContain("FRED_API_KEY");
  });

  it("PUT /api/admin/resources/:id returns { resource, impact } and bumps the version", async () => {
    const now = new Date();
    const updated: AdminResourceRow = {
      id: 5,
      kind: "model",
      slug: "primary-llm",
      displayName: "Primary",
      description: null,
      config: { provider: "anthropic" },
      secretRef: null,
      version: 2,
      lastHealthStatus: "gray",
      lastCheckedAt: null,
      createdByUserId: null,
      updatedByUserId: null,
      createdAt: now,
      updatedAt: now,
    } as AdminResourceRow;
    (storage.updateAdminResource as ReturnType<typeof vi.fn>).mockResolvedValue(updated);
    (storage.listResourceImpact as ReturnType<typeof vi.fn>).mockResolvedValue([
      { specialistId: "mgmt-co.funding", assignmentKind: "model", assignmentSlug: "primary-llm", assignmentRole: "tier-1-cognitive", required: true },
    ]);
    const { status, body } = await invoke(handlers, "PUT /api/admin/resources/:id", {
      params: { id: "5" },
      body: { displayName: "Primary", config: { provider: "anthropic" }, changeSummary: "rename" },
    });
    expect(status).toBe(200);
    const payload = body as { resource: ResourcePublicView; impact: unknown[] };
    expect(payload.resource.version).toBe(2);
    expect(payload.impact).toHaveLength(1);
  });

  it("GET /api/admin/resources/:id/versions strips secretRef from history", async () => {
    const now = new Date();
    (storage.listAdminResourceVersions as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 1, resourceId: 5, version: 2,
        displayName: "v2", description: null, config: { x: 2 }, secretRef: "SHOULD_NOT_LEAK",
        changeSummary: "tweak", changedByUserId: 99, changedAt: now,
      },
    ]);
    const { status, body } = await invoke(handlers, "GET /api/admin/resources/:id/versions", { params: { id: "5" } });
    expect(status).toBe(200);
    const versions = body as Array<Record<string, unknown>>;
    expect(versions[0]).toHaveProperty("hasSecret", true);
    expect(versions[0]).not.toHaveProperty("secretRef");
    expect(JSON.stringify(body)).not.toContain("SHOULD_NOT_LEAK");
  });

  it("POST /api/admin/break-glass-overrides rejects regular admins", async () => {
    mockUser = { id: 7, role: "admin" };
    const { status, body } = await invoke(handlers, "POST /api/admin/break-glass-overrides", {
      body: {
        specialistId: "mgmt-co.funding",
        assignmentKind: "model",
        assignmentSlug: "primary-llm",
        reason: "incident-routing",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    });
    expect(status).toBe(403);
    expect((body as { error: string }).error).toMatch(/super-admin/i);
  });

  it("POST /api/admin/break-glass-overrides accepts a super-admin and creates the row", async () => {
    mockUser = { id: 99, role: "super_admin" };
    (storage.createBreakGlassOverride as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 1, specialistId: "mgmt-co.funding", assignmentKind: "model", assignmentSlug: "primary-llm",
      assignmentRole: null, overrideResourceId: null, reason: "incident-routing", expiresAt: new Date(),
      createdByUserId: 99, createdAt: new Date(), revokedAt: null, revokedByUserId: null,
    });
    const { status } = await invoke(handlers, "POST /api/admin/break-glass-overrides", {
      body: {
        specialistId: "mgmt-co.funding",
        assignmentKind: "model",
        assignmentSlug: "primary-llm",
        reason: "incident-routing-test",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    });
    expect(status).toBe(201);
    expect(storage.createBreakGlassOverride).toHaveBeenCalled();
  });

  it("POST /api/admin/break-glass-overrides rejects expiresAt in the past", async () => {
    mockUser = { id: 99, role: "super_admin" };
    const { status } = await invoke(handlers, "POST /api/admin/break-glass-overrides", {
      body: {
        specialistId: "mgmt-co.funding",
        assignmentKind: "model",
        assignmentSlug: "primary-llm",
        reason: "incident-routing",
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      },
    });
    expect(status).toBe(400);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Group 4 — flattenCatalogDeclarations (pure)
// ════════════════════════════════════════════════════════════════════════════

describe("flattenCatalogDeclarations", () => {
  it("emits one declaration per (specialist, kind, slug, role)", () => {
    const flat = flattenCatalogDeclarations(SPECIALIST_CATALOG);
    let totalRefs = 0;
    for (const def of SPECIALIST_CATALOG) totalRefs += def.assignmentRefs.length;
    expect(flat).toHaveLength(totalRefs);
    // Spot-check Funding (Specialist A) wiring.
    const funding = flat.filter((d) => d.specialistId === "mgmt-co.funding");
    expect(funding.length).toBe(2);
    expect(funding.find((d) => d.assignmentSlug === "primary-llm")?.assignmentRole).toBe("tier-1-cognitive");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Group 5 — Insert-schema validation contract (Zod surface area)
// ════════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════════
// Group 6 — Health subsystem (P3): freshness, probes, rate-limit, audit
// ════════════════════════════════════════════════════════════════════════════

describe("deriveHealthStatus — TTL freshness", () => {
  it("returns gray when there has never been a check", async () => {
    const { deriveHealthStatus } = await import("@shared/schema");
    expect(deriveHealthStatus({ lastStatus: null, lastCheckedAt: null, kind: "api" })).toBe("gray");
  });

  it("returns green for an ok check within TTL", async () => {
    const { deriveHealthStatus } = await import("@shared/schema");
    const now = new Date("2026-04-21T12:00:00Z");
    const checkedAt = new Date(now.getTime() - 30_000); // 30s ago, api ttl=60
    expect(deriveHealthStatus({ lastStatus: "ok", lastCheckedAt: checkedAt, kind: "api", now })).toBe("green");
  });

  it("returns amber (NOT green) for an ok check past TTL — stale-green is impossible", async () => {
    const { deriveHealthStatus } = await import("@shared/schema");
    const now = new Date("2026-04-21T12:00:00Z");
    const checkedAt = new Date(now.getTime() - 90_000); // 90s ago, api ttl=60
    expect(deriveHealthStatus({ lastStatus: "ok", lastCheckedAt: checkedAt, kind: "api", now })).toBe("amber");
  });

  it("returns red for a failed check regardless of age", async () => {
    const { deriveHealthStatus } = await import("@shared/schema");
    const now = new Date("2026-04-21T12:00:00Z");
    const checkedAt = new Date(now.getTime() - 5_000);
    expect(deriveHealthStatus({ lastStatus: "fail", lastCheckedAt: checkedAt, kind: "api", now })).toBe("red");
  });

  it("respects per-kind TTL — table is fresh at 30 minutes; api is stale at 30 minutes", async () => {
    const { deriveHealthStatus } = await import("@shared/schema");
    const now = new Date("2026-04-21T12:00:00Z");
    const checkedAt = new Date(now.getTime() - 30 * 60 * 1000);
    expect(deriveHealthStatus({ lastStatus: "ok", lastCheckedAt: checkedAt, kind: "table", now })).toBe("green");
    expect(deriveHealthStatus({ lastStatus: "ok", lastCheckedAt: checkedAt, kind: "api", now })).toBe("amber");
  });
});

describe("runProbe — non-billing safety + structured outcomes", () => {
  it("returns SECRET_MISSING for an api whose secretRef is unset in env", async () => {
    const { runProbe } = await import("../../server/jobs/probes");
    const result = await runProbe({
      id: 1, kind: "api", slug: "x", displayName: "X", description: null,
      config: { baseUrl: "https://example.test" }, secretRef: "DEFINITELY_NOT_SET_KEY_xyz123",
      version: 1, lastHealthStatus: "gray", lastCheckedAt: null,
      createdByUserId: null, updatedByUserId: null,
      createdAt: new Date(), updatedAt: new Date(),
    } as AdminResourceRow);
    expect(result.status).toBe("fail");
    expect(result.errorCode).toBe("SECRET_MISSING");
  });

  it("returns CONFIG_INCOMPLETE for an api with no baseUrl (and no secret required)", async () => {
    const { runProbe } = await import("../../server/jobs/probes");
    const result = await runProbe({
      id: 1, kind: "api", slug: "x", displayName: "X", description: null,
      config: {}, secretRef: null,
      version: 1, lastHealthStatus: "gray", lastCheckedAt: null,
      createdByUserId: null, updatedByUserId: null,
      createdAt: new Date(), updatedAt: new Date(),
    } as AdminResourceRow);
    expect(result.status).toBe("fail");
    expect(result.errorCode).toBe("CONFIG_INCOMPLETE");
  });

  it("returns PROVIDER_UNKNOWN for a model with an unrecognized provider", async () => {
    const { runProbe } = await import("../../server/jobs/probes");
    const result = await runProbe({
      id: 1, kind: "model", slug: "x", displayName: "X", description: null,
      config: { provider: "snake-oil" }, secretRef: null,
      version: 1, lastHealthStatus: "gray", lastCheckedAt: null,
      createdByUserId: null, updatedByUserId: null,
      createdAt: new Date(), updatedAt: new Date(),
    } as AdminResourceRow);
    expect(result.status).toBe("fail");
    expect(result.errorCode).toBe("PROVIDER_UNKNOWN");
  });

  it("never throws — wraps probe exceptions into a structured fail outcome", async () => {
    const { runProbe } = await import("../../server/jobs/probes");
    // unknown kind path
    const result = await runProbe({
      id: 1, kind: "totally-bogus" as unknown as "api", slug: "x", displayName: "X",
      description: null, config: {}, secretRef: null, version: 1,
      lastHealthStatus: "gray", lastCheckedAt: null,
      createdByUserId: null, updatedByUserId: null,
      createdAt: new Date(), updatedAt: new Date(),
    } as AdminResourceRow);
    expect(result.status).toBe("skipped");
    expect(result.errorCode).toBe("UNKNOWN_KIND");
  });
});

describe("admin/resources health routes — gating + audit", () => {
  let app: Express;
  let handlers: Handlers;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 99, role: "super_admin" };
    const made = makeApp();
    app = made.app;
    handlers = made.handlers;
    registerAdminResourceRoutes(app);
  });

  it("GET /api/admin/resources/:id/health returns the freshness-aware view", async () => {
    (storage.getResourceHealthView as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "amber",
      lastChecked: new Date("2026-04-21T12:00:00Z"),
      lastStatus: "ok",
      latencyMs: 12,
      errorCode: null,
      errorMessage: null,
      ttlSeconds: 60,
    });
    const { status, body } = await invoke(handlers, "GET /api/admin/resources/:id/health", { params: { id: "1" } });
    expect(status).toBe(200);
    const payload = body as Record<string, unknown>;
    expect(payload.status).toBe("amber");
    expect(payload.lastChecked).toBe("2026-04-21T12:00:00.000Z");
    expect(payload.ttlSeconds).toBe(60);
  });

  it("POST /api/admin/resources/:id/test rate-limits and returns 429", async () => {
    (storage.getAdminResourceById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 1, kind: "api", slug: "fred", displayName: "FRED", description: null,
      config: { baseUrl: "https://api.example.test" }, secretRef: "FRED_API_KEY",
      version: 1, lastHealthStatus: "gray", lastCheckedAt: null,
      createdByUserId: null, updatedByUserId: null,
      createdAt: new Date(), updatedAt: new Date(),
    });
    (storage.isAdminTestRateLimited as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const { status, body } = await invoke(handlers, "POST /api/admin/resources/:id/test", { params: { id: "1" } });
    expect(status).toBe(429);
    expect((body as { error: string }).error).toMatch(/rate limit/i);
    expect(storage.recordProbeResult).not.toHaveBeenCalled();
  });

  it("POST /api/admin/resources/:id/test runs probe and persists with the actor", async () => {
    (storage.getAdminResourceById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 1, kind: "model", slug: "primary-llm", displayName: "Primary", description: null,
      config: { provider: "anthropic" }, secretRef: null,
      version: 1, lastHealthStatus: "gray", lastCheckedAt: null,
      createdByUserId: null, updatedByUserId: null,
      createdAt: new Date(), updatedAt: new Date(),
    });
    (storage.isAdminTestRateLimited as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    (storage.recordProbeResult as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 7, resourceId: 1, kind: "model", status: "ok", latencyMs: 1, errorCode: null,
      errorMessage: null, triggeredByUserId: 99, checkedAt: new Date("2026-04-21T12:00:00Z"),
    });
    const { status, body } = await invoke(handlers, "POST /api/admin/resources/:id/test", { params: { id: "1" } });
    expect(status).toBe(200);
    expect((body as { status: string }).status).toBe("ok");
    expect(storage.recordProbeResult).toHaveBeenCalledWith(
      1,
      "model",
      expect.objectContaining({ status: "ok" }),
      99, // actor id
    );
  });

  it("POST /api/admin/resources/:id/test rejects unauthenticated callers", async () => {
    mockUser = null;
    const { status } = await invoke(handlers, "POST /api/admin/resources/:id/test", { params: { id: "1" } });
    expect(status).toBe(401);
  });
});

describe("insert schemas", () => {
  it("insertAdminResourceSchema rejects bad slugs", () => {
    const bad = insertAdminResourceSchema.safeParse({
      kind: "api",
      slug: "Bad_Slug",
      displayName: "x",
    });
    expect(bad.success).toBe(false);
  });

  it("insertBreakGlassOverrideSchema requires a meaningful reason", () => {
    const bad = insertBreakGlassOverrideSchema.safeParse({
      specialistId: "x",
      assignmentKind: "api",
      assignmentSlug: "y",
      reason: "short",
      expiresAt: new Date(Date.now() + 60_000),
      createdByUserId: 1,
    });
    expect(bad.success).toBe(false);
  });
});
