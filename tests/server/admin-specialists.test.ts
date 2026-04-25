/**
 * P5 contract tests for /api/admin/specialists/*.
 *
 * Mirror the structure of admin-resources.test.ts: storage is mocked,
 * the route module is registered against a tiny fake Express, requests
 * are dispatched through `invoke`. We assert:
 *   1. catalog list returns all 7 Specialists with expected status flags
 *   2. detail composes definition + config + assignments-with-health
 *   3. PUT routes reject capabilities the Specialist doesn't declare
 *   4. PUT llm-config rejects non-model resource ids
 *   5. NO route exists to relink resource assignments (read-only invariant)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Express, Request, Response, NextFunction, RequestHandler } from "express";

vi.mock("../../server/storage", () => ({
  storage: {
    getOrCreateSpecialistConfig: vi.fn(),
    // Default to a resolved-undefined so the audit route's
    // `storage.getSpecialistConfig?.(id).catch(...)` chain doesn't blow up
    // for tests that don't care about the live-current diff target.
    getSpecialistConfig: vi.fn().mockResolvedValue(undefined),
    updateSpecialistConfigSection: vi.fn(),
    listSpecialistConfigVersions: vi.fn(),
    listSpecialistAssignments: vi.fn(),
    getAdminResourceById: vi.fn(),
    getLatestHealthCheck: vi.fn(),
    createActivityLog: vi.fn().mockResolvedValue(undefined),
    // Phase 3 (#453): list/detail now overlay identity overrides; tests
    // default to "no overrides set" so behavior matches catalog defaults.
    listIdentityOverrides: vi.fn().mockResolvedValue([]),
    getIdentityOverride: vi.fn().mockResolvedValue(null),
    // Task #438 — telemetry endpoints for the Recommendations card.
    recordRecommendationEvent: vi.fn(),
    getRecommendationEventStats: vi.fn(),
    // Task #502 — catalog list overlays a per-row hasLlmOverrides flag
    // by batch-loading specialist_configs rows. Default to "no overrides"
    // so existing assertions on the shape of the catalog response remain
    // stable; the new field is asserted explicitly below.
    listSpecialistsWithLlmOverrides: vi.fn().mockResolvedValue(new Set<string>()),
  },
}));

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
}));

vi.mock("../../server/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { storage } from "../../server/storage";
import { registerAdminSpecialistRoutes } from "../../server/routes/admin/specialists";
import { SPECIALIST_CATALOG } from "../../engine/analyst/registry/specialist-catalog";

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
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  return { status, body };
}

const baseConfig = (id: string) => ({
  id: 1,
  specialistId: id,
  promptTemplate: "",
  modelResourceId: null as number | null,
  requiredFields: [] as string[],
  fieldRequirements: {} as Record<string, "hard" | "recommended" | "off">,
  prerequisiteToggles: {} as Record<string, boolean>,
  runtimeConfig: {} as Record<string, unknown>,
  refreshCadenceDays: null as number | null,
  lastObservedMissing: [] as string[],
  lastObservedMissingAt: null as Date | null,
  version: 1,
  createdByUserId: null as number | null,
  updatedByUserId: null as number | null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe("admin/specialists routes — catalog + detail", () => {
  let app: Express;
  let handlers: Handlers;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 99, role: "super_admin" };
    const made = makeApp();
    app = made.app;
    handlers = made.handlers;
    registerAdminSpecialistRoutes(app);
  });

  it("GET /api/admin/specialists returns the entire catalog with status flags", async () => {
    const { status, body } = await invoke(handlers, "GET /api/admin/specialists");
    expect(status).toBe(200);
    const items = body as Array<{ id: string; status: string; capabilities: string[]; hasLlmOverrides: boolean }>;
    // Phase 3 (#453): list now prepends a synthetic Gaspar row so the
    // orchestrator can be navigated to from the same sidebar.
    expect(items).toHaveLength(SPECIALIST_CATALOG.length + 1);
    expect(items[0].id).toBe("gaspar");
    expect(items.find((i) => i.id === "mgmt-co.funding")?.status).toBe("built");
    expect(items.find((i) => i.id === "portfolio-ops.watchdog")?.status).toBe("needs-page");
    // Task #502 — every row carries a boolean drift flag, defaulting to
    // false when no Specialist diverges from the global LLM defaults.
    for (const item of items) {
      expect(item.hasLlmOverrides).toBe(false);
    }
  });

  it("GET /api/admin/specialists exposes hasLlmOverrides when storage reports drift", async () => {
    (storage.listSpecialistsWithLlmOverrides as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Set(["mgmt-co.funding", "property.executive-summary"]),
    );
    const { status, body } = await invoke(handlers, "GET /api/admin/specialists");
    expect(status).toBe(200);
    const items = body as Array<{ id: string; hasLlmOverrides: boolean }>;
    expect(items.find((i) => i.id === "mgmt-co.funding")?.hasLlmOverrides).toBe(true);
    expect(items.find((i) => i.id === "property.executive-summary")?.hasLlmOverrides).toBe(true);
    expect(items.find((i) => i.id === "mgmt-co.revenue")?.hasLlmOverrides).toBe(false);
    // Synthetic gaspar row never participates in the override count.
    expect(items.find((i) => i.id === "gaspar")?.hasLlmOverrides).toBe(false);
  });

  it("GET /api/admin/specialists/:id composes definition + config + assignments-with-health", async () => {
    (storage.getOrCreateSpecialistConfig as ReturnType<typeof vi.fn>).mockResolvedValue(
      baseConfig("mgmt-co.funding"),
    );
    (storage.listSpecialistAssignments as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 1,
        specialistId: "mgmt-co.funding",
        assignmentKind: "model",
        assignmentSlug: "primary-llm",
        assignmentRole: "tier-1-cognitive",
        required: true,
        resourceId: 7,
      },
    ]);
    (storage.getAdminResourceById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 7, kind: "model", slug: "primary-llm", displayName: "Primary",
      description: null, config: { provider: "anthropic" }, secretRef: null,
      version: 1, lastHealthStatus: "green",
      lastCheckedAt: new Date(), createdByUserId: null, updatedByUserId: null,
      createdAt: new Date(), updatedAt: new Date(),
    });
    (storage.getLatestHealthCheck as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "ok", checkedAt: new Date(), latencyMs: 42, errorCode: null, errorMessage: null,
    });

    const { status, body } = await invoke(handlers, "GET /api/admin/specialists/:id", {
      params: { id: "mgmt-co.funding" },
    });
    expect(status).toBe(200);
    const payload = body as { definition: { id: string; capabilities: string[] }; config: { version: number; fieldRequirements: Record<string, string>; prerequisiteToggles: Record<string, boolean> }; assignments: Array<{ kind: string; resource: unknown; health: { status: string } }> };
    expect(payload.definition.id).toBe("mgmt-co.funding");
    expect(payload.definition.capabilities).toContain("llm-config");
    expect(payload.config.version).toBe(1);
    // Task #488 regression: these fields previously caused a 500 because
    // the columns were missing from the DB schema. Ensure they are part
    // of the `config` payload.
    expect(payload.config.fieldRequirements).toEqual({});
    expect(payload.config.prerequisiteToggles).toEqual({});
    expect(payload.assignments).toHaveLength(1);
    expect(payload.assignments[0].kind).toBe("model");
    expect(payload.assignments[0].resource).not.toBeNull();
    expect(payload.assignments[0].health.status).toBe("green");
  });

  it("GET /api/admin/specialists/:id 404s for an unknown id", async () => {
    const { status } = await invoke(handlers, "GET /api/admin/specialists/:id", {
      params: { id: "does-not-exist" },
    });
    expect(status).toBe(404);
  });

  it("PUT /api/admin/specialists/:id/required-fields rejects a Specialist that doesn't declare the capability", async () => {
    // photos.photo-enhancer declares llm-config + resource-assignments + runtime + audit, NOT required-fields
    const { status, body } = await invoke(handlers, "PUT /api/admin/specialists/:id/required-fields", {
      params: { id: "photos.photo-enhancer" },
      body: { fields: ["foo"] },
    });
    expect(status).toBe(400);
    expect((body as { error: string }).error).toMatch(/required-fields capability/);
  });

  it("PUT /api/admin/specialists/:id/llm-config rejects a non-model resource id", async () => {
    (storage.getAdminResourceById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 12, kind: "api", slug: "fred", displayName: "FRED",
      description: null, config: {}, secretRef: null, version: 1,
      lastHealthStatus: "gray", lastCheckedAt: null,
      createdByUserId: null, updatedByUserId: null,
      createdAt: new Date(), updatedAt: new Date(),
    });
    const { status, body } = await invoke(handlers, "PUT /api/admin/specialists/:id/llm-config", {
      params: { id: "mgmt-co.funding" },
      body: { promptTemplate: "hello", modelResourceId: 12 },
    });
    expect(status).toBe(400);
    expect((body as { error: string }).error).toMatch(/kind=model/);
  });

  it("PUT /api/admin/specialists/:id/llm-config persists when payload is valid", async () => {
    (storage.getAdminResourceById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 7, kind: "model", slug: "primary-llm", displayName: "Primary",
      description: null, config: {}, secretRef: null, version: 1,
      lastHealthStatus: "gray", lastCheckedAt: null,
      createdByUserId: null, updatedByUserId: null,
      createdAt: new Date(), updatedAt: new Date(),
    });
    (storage.updateSpecialistConfigSection as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...baseConfig("mgmt-co.funding"),
      promptTemplate: "tpl",
      modelResourceId: 7,
      version: 2,
    });
    const { status, body } = await invoke(handlers, "PUT /api/admin/specialists/:id/llm-config", {
      params: { id: "mgmt-co.funding" },
      body: { promptTemplate: "tpl", modelResourceId: 7 },
    });
    expect(status).toBe(200);
    expect((body as { version: number }).version).toBe(2);
    expect(storage.updateSpecialistConfigSection).toHaveBeenCalledWith(
      "mgmt-co.funding",
      "llm-config",
      { promptTemplate: "tpl", modelResourceId: 7 },
      99,
      undefined,
    );
  });

  it("PUT /api/admin/specialists/:id/runtime accepts an arbitrary jsonb object", async () => {
    (storage.updateSpecialistConfigSection as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...baseConfig("portfolio-ops.watchdog"),
      runtimeConfig: { thresholds: { adr: 0.1 } },
      version: 3,
    });
    const { status } = await invoke(handlers, "PUT /api/admin/specialists/:id/runtime", {
      params: { id: "portfolio-ops.watchdog" },
      body: { runtimeConfig: { thresholds: { adr: 0.1 } } },
    });
    expect(status).toBe(200);
  });

  it("PUT /api/admin/specialists/:id/cadence rejects a Specialist that doesn't own constants", async () => {
    // photos.photo-enhancer is not a Constants Specialist — the catalog entry
    // has no `refreshCadenceDays`, so the cadence override surface must 400.
    const { status, body } = await invoke(handlers, "PUT /api/admin/specialists/:id/cadence", {
      params: { id: "photos.photo-enhancer" },
      body: { refreshCadenceDays: 30 },
    });
    expect(status).toBe(400);
    expect((body as { error: string }).error).toMatch(/refresh cadence/);
  });

  it("PUT /api/admin/specialists/:id/cadence persists an override for a Constants Specialist", async () => {
    // constants.macro-research is Specialist I (macro), default 7d.
    (storage.updateSpecialistConfigSection as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...baseConfig("constants.macro-research"),
      refreshCadenceDays: 14,
      version: 4,
    });
    const { status, body } = await invoke(handlers, "PUT /api/admin/specialists/:id/cadence", {
      params: { id: "constants.macro-research" },
      body: { refreshCadenceDays: 14, changeSummary: "slow it down" },
    });
    expect(status).toBe(200);
    expect(storage.updateSpecialistConfigSection).toHaveBeenCalledWith(
      "constants.macro-research",
      "cadence",
      { refreshCadenceDays: 14 },
      expect.anything(),
      "slow it down",
    );
    expect(body).toMatchObject({ refreshCadenceDays: 14, refreshCadenceOverridden: true });
  });

  it("PUT /api/admin/specialists/:id/cadence accepts null to clear the override", async () => {
    (storage.updateSpecialistConfigSection as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...baseConfig("constants.macro-research"),
      refreshCadenceDays: null,
      version: 5,
    });
    const { status, body } = await invoke(handlers, "PUT /api/admin/specialists/:id/cadence", {
      params: { id: "constants.macro-research" },
      body: { refreshCadenceDays: null },
    });
    expect(status).toBe(200);
    expect(body).toMatchObject({ refreshCadenceOverridden: false });
  });

  it("GET /api/admin/specialists/:id/audit returns version snapshots", async () => {
    (storage.listSpecialistConfigVersions as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 10, version: 2, section: "llm-config",
        promptTemplate: "old", modelResourceId: null, requiredFields: [], runtimeConfig: {},
        changeSummary: "tweak", changedByUserId: 99, changedAt: new Date(),
      },
    ]);
    const { status, body } = await invoke(handlers, "GET /api/admin/specialists/:id/audit", {
      params: { id: "mgmt-co.funding" },
    });
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect((body as Array<{ section: string; version: number }>)[0]).toMatchObject({ section: "llm-config", version: 2 });
  });

  it("read-only invariant: NO route exists to relink resource assignments", () => {
    // Defensive: scan every registered handler key. Anything that mentions
    // "assignment" on the Specialist surface would violate the doctrine.
    for (const key of Object.keys(handlers)) {
      expect(key.toLowerCase()).not.toMatch(/assignment/);
      expect(key.toLowerCase()).not.toMatch(/relink/);
      expect(key.toLowerCase()).not.toMatch(/rewire/);
    }
  });

  // catalog-locked hard tier guards on /field-toggles.
  // The catalog is the SSoT for hard-required fields; admins may only
  // toggle other candidates between Off ↔ Recommended.
  it("PUT /api/admin/specialists/:id/field-toggles rejects demoting a locked-hard field", async () => {
    // property.risk-intelligence has country/hospitalityType/name marked
    // lockedHard: true in the catalog. Trying to set country to
    // "recommended" must 400 with a lockViolations payload.
    const { status, body } = await invoke(handlers, "PUT /api/admin/specialists/:id/field-toggles", {
      params: { id: "property.risk-intelligence" },
      body: {
        fieldRequirements: { country: "recommended" },
      },
    });
    expect(status).toBe(400);
    const payload = body as {
      error: string;
      lockViolations: { key: string; attemptedLevel: string; reason: string }[];
      lockedHardKeys: string[];
    };
    expect(payload.lockViolations).toHaveLength(1);
    expect(payload.lockViolations[0]).toMatchObject({ key: "country", attemptedLevel: "recommended" });
    expect(payload.lockedHardKeys).toContain("country");
    expect(storage.updateSpecialistConfigSection).not.toHaveBeenCalled();
  });

  it("PUT /api/admin/specialists/:id/field-toggles rejects promoting a non-locked field to hard", async () => {
    // property.risk-intelligence exposes `city` as a candidate
    // that is NOT locked-hard; promoting it to "hard" must 400.
    const { status, body } = await invoke(handlers, "PUT /api/admin/specialists/:id/field-toggles", {
      params: { id: "property.risk-intelligence" },
      body: {
        fieldRequirements: { city: "hard" },
      },
    });
    expect(status).toBe(400);
    const payload = body as {
      lockViolations: { key: string; attemptedLevel: string; reason: string }[];
    };
    expect(payload.lockViolations.some((v) => v.key === "city" && v.attemptedLevel === "hard")).toBe(true);
    expect(storage.updateSpecialistConfigSection).not.toHaveBeenCalled();
  });

  it("PUT /api/admin/specialists/:id/field-toggles allows toggling non-locked fields between off and recommended", async () => {
    (storage.updateSpecialistConfigSection as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...baseConfig("property.risk-intelligence"),
      // The persisted payload should include locked-hard keys as "hard"
      // (auto-merged) plus the admin's chosen "recommended" toggle.
      fieldRequirements: { country: "hard", hospitalityType: "hard", city: "recommended" },
      requiredFields: ["country", "hospitalityType"],
      version: 6,
    });
    const { status } = await invoke(handlers, "PUT /api/admin/specialists/:id/field-toggles", {
      params: { id: "property.risk-intelligence" },
      body: {
        fieldRequirements: { city: "recommended" },
      },
    });
    expect(status).toBe(200);
    expect(storage.updateSpecialistConfigSection).toHaveBeenCalledTimes(1);
    const callArgs = (storage.updateSpecialistConfigSection as ReturnType<typeof vi.fn>).mock.calls[0];
    const sectionPayload = callArgs[2] as {
      fieldRequirements: Record<string, string>;
      requiredFields: string[];
    };
    // Catalog-locked keys auto-merged as "hard" even though the request omitted them.
    expect(sectionPayload.fieldRequirements.country).toBe("hard");
    expect(sectionPayload.fieldRequirements.hospitalityType).toBe("hard");
    expect(sectionPayload.fieldRequirements.city).toBe("recommended");
    // Legacy mirror reflects the locked-hard set.
    expect(new Set(sectionPayload.requiredFields)).toEqual(new Set(["country", "hospitalityType"]));
  });

  // Task #438 — appearance counter for the Recommendations card
  it("GET /api/admin/specialists/:id/recommendation-stats surfaces the appearance counter", async () => {
    (storage.getRecommendationEventStats as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        fieldKey: "city",
        promoteRecommended: 0,
        promoteHard: 0,
        ignore: 2,
        appearances: 7,
        firstObservedAt: new Date("2026-04-01T00:00:00Z").toISOString(),
        lastObservedAt: new Date("2026-04-23T00:00:00Z").toISOString(),
        lastPromotedAt: null,
      },
      {
        fieldKey: "neighborhood",
        promoteRecommended: 1,
        promoteHard: 0,
        ignore: 0,
        appearances: 0,
        firstObservedAt: new Date("2026-04-10T00:00:00Z").toISOString(),
        lastObservedAt: new Date("2026-04-15T00:00:00Z").toISOString(),
        lastPromotedAt: new Date("2026-04-15T01:00:00Z").toISOString(),
      },
    ]);
    const { status, body } = await invoke(
      handlers,
      "GET /api/admin/specialists/:id/recommendation-stats",
      { params: { id: "property.risk-intelligence" } },
    );
    expect(status).toBe(200);
    const stats = body as Array<{
      fieldKey: string;
      appearances: number;
      lastPromotedAt: string | null;
      ignore: number;
    }>;
    expect(stats).toHaveLength(2);
    const city = stats.find((s) => s.fieldKey === "city")!;
    expect(city.appearances).toBe(7);
    expect(city.lastPromotedAt).toBeNull();
    expect(city.ignore).toBe(2);
    const promoted = stats.find((s) => s.fieldKey === "neighborhood")!;
    expect(promoted.appearances).toBe(0);
    expect(promoted.lastPromotedAt).not.toBeNull();
  });

  it("POST /api/admin/specialists/:id/recommendation-event records a promote event for a candidate field", async () => {
    (storage.recordRecommendationEvent as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 42,
      specialistId: "property.risk-intelligence",
      fieldKey: "city",
      action: "promote-recommended",
      actorUserId: 99,
      occurredAt: new Date(),
    });
    const { status, body } = await invoke(
      handlers,
      "POST /api/admin/specialists/:id/recommendation-event",
      {
        params: { id: "property.risk-intelligence" },
        body: { fieldKey: "city", action: "promote-recommended" },
      },
    );
    expect(status).toBe(200);
    expect((body as { id: number }).id).toBe(42);
    expect(storage.recordRecommendationEvent).toHaveBeenCalledWith(
      "property.risk-intelligence",
      "city",
      "promote-recommended",
      99,
    );
  });

  it("POST /api/admin/specialists/:id/recommendation-event rejects an unknown candidate field", async () => {
    const { status, body } = await invoke(
      handlers,
      "POST /api/admin/specialists/:id/recommendation-event",
      {
        params: { id: "property.risk-intelligence" },
        body: { fieldKey: "not-a-real-field", action: "ignore" },
      },
    );
    expect(status).toBe(400);
    expect((body as { error: string }).error).toMatch(/declared candidate/);
    expect(storage.recordRecommendationEvent).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated callers", async () => {
    mockUser = null;
    const { status } = await invoke(handlers, "GET /api/admin/specialists");
    expect(status).toBe(401);
  });

  it("rejects non-admin callers", async () => {
    mockUser = { id: 1, role: "user" };
    const { status } = await invoke(handlers, "GET /api/admin/specialists");
    expect(status).toBe(403);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Task #503 — Per-field LLM override save + audit-diff label coverage.
//
// The happy-path llm-config test above asserts the route persists the legacy
// (promptTemplate + modelResourceId) pair. The override surface added in
// Task #495 introduced five new nullable per-field overrides plus the
// workflowOverrides JSON object. These are silent regressions waiting to
// happen, so we exercise:
//   1. PUT-each-field-individually against /llm-config and assert the
//      route forwards exactly that one field to
//      `updateSpecialistConfigSection`, AND the returned config view
//      reflects the new value with the bumped version number.
//   2. PUT with `null` to clear an override and confirm the persisted
//      patch carries `null` (= "reset to global", inheritance restored)
//      and the response surfaces null.
//   3. GET /audit across two consecutive snapshots + a live row, and
//      verify the per-row `changedFieldLabels` diff is correct for both
//      the scalar fields and the per-key workflowOverrides JSON.
// ────────────────────────────────────────────────────────────────────────────

describe("admin/specialists routes — per-field LLM overrides + audit-diff", () => {
  let app: Express;
  let handlers: Handlers;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 99, role: "super_admin" };
    const made = makeApp();
    app = made.app;
    handlers = made.handlers;
    registerAdminSpecialistRoutes(app);
    // Default: every model-id lookup resolves to a kind=model resource so
    // the per-field override validator passes for any positive integer id.
    (storage.getAdminResourceById as ReturnType<typeof vi.fn>).mockImplementation(
      async (resourceId: number) => ({
        id: resourceId,
        kind: "model",
        slug: `model-${resourceId}`,
        displayName: `Model ${resourceId}`,
        description: null,
        config: {},
        secretRef: null,
        version: 1,
        lastHealthStatus: "gray",
        lastCheckedAt: null,
        createdByUserId: null,
        updatedByUserId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
  });

  /**
   * Per-field PUT cases. Each case sends ONE override field (alongside the
   * required legacy promptTemplate + modelResourceId pair which the schema
   * still demands), and asserts the storage call carries that field with
   * the expected value. The mocked storage response echoes the field on the
   * returned row so we can verify `toConfigView` propagates it onto the
   * public-view payload — guarding against a regression where the route
   * silently drops a new field on its way back out.
   */
  const overrideCases: Array<{
    name: string;
    field: string;
    value: number | boolean | Record<string, unknown>;
  }> = [
    { name: "analyst A model", field: "analystAModelResourceId", value: 21 },
    { name: "analyst B model", field: "analystBModelResourceId", value: 22 },
    { name: "synthesis model", field: "synthesisModelResourceId", value: 23 },
    { name: "fallback model", field: "fallbackModelResourceId", value: 24 },
    { name: "multi-model toggle", field: "multiModelEnabled", value: true },
    {
      name: "workflow overrides",
      field: "workflowOverrides",
      value: { stalenessThresholdHours: 12, dailyTokenBudget: 50_000 },
    },
  ];

  for (const c of overrideCases) {
    it(`PUT /llm-config persists ${c.name} alone and bumps version`, async () => {
      const updatedRow = {
        ...baseConfig("mgmt-co.funding"),
        analystAModelResourceId: null as number | null,
        analystBModelResourceId: null as number | null,
        synthesisModelResourceId: null as number | null,
        fallbackModelResourceId: null as number | null,
        multiModelEnabled: null as boolean | null,
        workflowOverrides: null as Record<string, unknown> | null,
        [c.field]: c.value,
        version: 9,
      };
      (storage.updateSpecialistConfigSection as ReturnType<typeof vi.fn>).mockResolvedValue(updatedRow);

      const body: Record<string, unknown> = {
        promptTemplate: "",
        modelResourceId: null,
        [c.field]: c.value,
      };
      const { status, body: resBody } = await invoke(
        handlers,
        "PUT /api/admin/specialists/:id/llm-config",
        { params: { id: "mgmt-co.funding" }, body },
      );
      expect(status).toBe(200);

      // Storage was invoked with exactly the override under test inside the
      // patch object (other override fields are `undefined`, so the storage
      // layer leaves them untouched per `SpecialistConfigPatch` semantics).
      expect(storage.updateSpecialistConfigSection).toHaveBeenCalledTimes(1);
      const callArgs = (storage.updateSpecialistConfigSection as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[0]).toBe("mgmt-co.funding");
      expect(callArgs[1]).toBe("llm-config");
      const patch = callArgs[2] as Record<string, unknown>;
      expect(patch[c.field]).toEqual(c.value);

      // The public-view (config snapshot used to drive the version bump UI)
      // reflects the new value at the new version number — i.e. the row +
      // version snapshot the server persisted is what the client reads back.
      const view = resBody as Record<string, unknown>;
      expect(view[c.field]).toEqual(c.value);
      expect(view.version).toBe(9);
    });
  }

  it("PUT /llm-config with null in an override clears it (inheritance restored)", async () => {
    // Simulate a row that previously had analystAModelResourceId=42; the
    // admin sends `null` to "Reset to global". The persisted patch must
    // carry `null` (NOT `undefined`, which would leave the existing value
    // in place), and the response must surface `null` so the UI re-renders
    // the "Inheriting global default" placeholder.
    (storage.updateSpecialistConfigSection as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...baseConfig("mgmt-co.funding"),
      analystAModelResourceId: null,
      multiModelEnabled: null,
      workflowOverrides: null,
      version: 12,
    });
    const { status, body } = await invoke(
      handlers,
      "PUT /api/admin/specialists/:id/llm-config",
      {
        params: { id: "mgmt-co.funding" },
        body: {
          promptTemplate: "",
          modelResourceId: null,
          analystAModelResourceId: null,
          multiModelEnabled: null,
          workflowOverrides: null,
        },
      },
    );
    expect(status).toBe(200);

    const callArgs = (storage.updateSpecialistConfigSection as ReturnType<typeof vi.fn>).mock.calls[0];
    const patch = callArgs[2] as Record<string, unknown>;
    expect(patch).toHaveProperty("analystAModelResourceId", null);
    expect(patch).toHaveProperty("multiModelEnabled", null);
    expect(patch).toHaveProperty("workflowOverrides", null);

    const view = body as Record<string, unknown>;
    expect(view.analystAModelResourceId).toBeNull();
    expect(view.multiModelEnabled).toBeNull();
    expect(view.workflowOverrides).toBeNull();
    expect(view.version).toBe(12);
  });

  // Helper: a fully-populated version snapshot with sensible empty defaults
  // so individual tests only have to override the fields under test.
  const makeSnapshot = (overrides: Partial<{
    id: number;
    version: number;
    section: string;
    promptTemplate: string;
    modelResourceId: number | null;
    analystAModelResourceId: number | null;
    analystBModelResourceId: number | null;
    synthesisModelResourceId: number | null;
    fallbackModelResourceId: number | null;
    multiModelEnabled: boolean | null;
    workflowOverrides: Record<string, unknown> | null;
    requiredFields: string[];
    fieldRequirements: Record<string, "hard" | "recommended" | "off">;
    prerequisiteToggles: Record<string, boolean>;
    runtimeConfig: Record<string, unknown>;
    refreshCadenceDays: number | null;
  }>) => ({
    id: 1,
    specialistId: "mgmt-co.funding",
    version: 1,
    section: "llm-config",
    promptTemplate: "",
    modelResourceId: null,
    analystAModelResourceId: null,
    analystBModelResourceId: null,
    synthesisModelResourceId: null,
    fallbackModelResourceId: null,
    multiModelEnabled: null,
    workflowOverrides: null,
    requiredFields: [],
    fieldRequirements: {},
    prerequisiteToggles: {},
    runtimeConfig: {},
    refreshCadenceDays: null,
    changeSummary: null,
    changedByUserId: 99,
    changedAt: new Date("2026-04-20T00:00:00Z"),
    ...overrides,
  });

  it("GET /audit returns per-field changedFieldLabels across two consecutive saves", async () => {
    // Setup: live current row at v4. Two prior snapshots exist:
    //   v3 — pre-edit state before bump to v4. Admin set analystA=42 → v4.
    //         Diff(v3 → live) must surface "Analyst A model".
    //   v2 — pre-edit state before bump to v3. Admin updated prompt and
    //         flipped multiModelEnabled → v3.
    //         Diff(v2 → v3) must surface "prompt" + "multi-model toggle".
    //
    // listSpecialistConfigVersions returns newest-first per the storage
    // contract (DESC by changedAt), so the route compares versions[0]
    // against liveCurrent and versions[1] against versions[0].
    const liveRow = {
      ...baseConfig("mgmt-co.funding"),
      promptTemplate: "latest",
      analystAModelResourceId: 42,
      analystBModelResourceId: null,
      synthesisModelResourceId: null,
      fallbackModelResourceId: null,
      multiModelEnabled: true,
      workflowOverrides: null,
      version: 4,
    };
    (storage.getSpecialistConfig as ReturnType<typeof vi.fn>).mockResolvedValue(liveRow);

    const v3 = makeSnapshot({
      id: 30,
      version: 3,
      promptTemplate: "latest",
      // Other fields match live EXCEPT analystAModelResourceId which is
      // null here → the v3→live diff label surfaces "Analyst A model".
      analystAModelResourceId: null,
      multiModelEnabled: true,
    });
    const v2 = makeSnapshot({
      id: 20,
      version: 2,
      promptTemplate: "old",
      analystAModelResourceId: null,
      multiModelEnabled: false,
    });
    (storage.listSpecialistConfigVersions as ReturnType<typeof vi.fn>).mockResolvedValue([v3, v2]);

    const { status, body } = await invoke(
      handlers,
      "GET /api/admin/specialists/:id/audit",
      { params: { id: "mgmt-co.funding" } },
    );
    expect(status).toBe(200);
    const rows = body as Array<{ version: number; changedFieldLabels: string[] }>;
    expect(rows).toHaveLength(2);
    const v3Out = rows.find((r) => r.version === 3)!;
    const v2Out = rows.find((r) => r.version === 2)!;
    // v3 → live: only analystAModelResourceId changed.
    expect(v3Out.changedFieldLabels).toEqual(["Analyst A model"]);
    // v2 → v3: prompt + multi-model toggle. Order follows SCALAR_LABELS
    // declaration order (prompt before multi-model toggle) so the assertion
    // is exact, not set-based.
    expect(v2Out.changedFieldLabels).toEqual(["prompt", "multi-model toggle"]);
  });

  it("GET /audit emits one workflowOverrides label per changed key, not one opaque label", async () => {
    // Live row sets stalenessThresholdHours=24 and dailyTokenBudget=1000.
    // The newest snapshot has stalenessThresholdHours=48 (different) and
    // dailyTokenBudget=1000 (same). The diff must surface "Staleness
    // threshold" only — "Daily token budget" is unchanged. This guards
    // against regressing the per-key diff back into a single
    // "edited Workflow overrides" label.
    const liveRow = {
      ...baseConfig("mgmt-co.funding"),
      analystAModelResourceId: null,
      analystBModelResourceId: null,
      synthesisModelResourceId: null,
      fallbackModelResourceId: null,
      multiModelEnabled: null,
      workflowOverrides: { stalenessThresholdHours: 24, dailyTokenBudget: 1000 } as Record<string, unknown>,
      version: 5,
    };
    (storage.getSpecialistConfig as ReturnType<typeof vi.fn>).mockResolvedValue(liveRow);

    const snapshot = makeSnapshot({
      id: 40,
      version: 4,
      workflowOverrides: { stalenessThresholdHours: 48, dailyTokenBudget: 1000 },
    });
    (storage.listSpecialistConfigVersions as ReturnType<typeof vi.fn>).mockResolvedValue([snapshot]);

    const { status, body } = await invoke(
      handlers,
      "GET /api/admin/specialists/:id/audit",
      { params: { id: "mgmt-co.funding" } },
    );
    expect(status).toBe(200);
    const rows = body as Array<{ version: number; changedFieldLabels: string[] }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].changedFieldLabels).toEqual(["Staleness threshold"]);
  });
});
