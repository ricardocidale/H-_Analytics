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
    // Task #614 — cross-Specialist roll-up of perennial offender candidate
    // fields. Default to an empty array so tests that don't care about
    // this surface render a clean "no offenders" response.
    getTopPerennialRecommendationOffenders: vi.fn().mockResolvedValue([]),
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
    expect(items.find((i) => i.id === "portfolio-ops.watchdog")?.status).toBe("built");
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

  it("GET /api/admin/specialists/perennial-offenders enriches storage rows with catalog metadata", async () => {
    const now = new Date("2026-04-25T12:00:00Z");
    (
      storage.getTopPerennialRecommendationOffenders as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce([
      {
        specialistId: "mgmt-co.funding",
        fieldKey: "runwayBufferMonths",
        appearances: 7,
        firstObservedAt: now.toISOString(),
        lastObservedAt: now.toISOString(),
      },
      {
        specialistId: "mgmt-co.funding",
        fieldKey: "this-key-was-removed-from-the-catalog",
        appearances: 5,
        firstObservedAt: now.toISOString(),
        lastObservedAt: now.toISOString(),
      },
      {
        specialistId: "ghost-specialist-no-longer-in-catalog",
        fieldKey: "anything",
        appearances: 4,
        firstObservedAt: now.toISOString(),
        lastObservedAt: now.toISOString(),
      },
    ]);

    const { status, body } = await invoke(
      handlers,
      "GET /api/admin/specialists/perennial-offenders",
      { query: { limit: "10" } },
    );
    expect(status).toBe(200);
    const items = body as Array<{
      specialistId: string;
      specialistLetter: string;
      fieldKey: string;
      fieldLabel: string;
      fieldSurface: string;
      appearances: number;
    }>;
    // Only the catalog-resolvable row survives — orphan field key and
    // orphan specialist id are dropped server-side so the UI never tries
    // to deep-link to a row it cannot render.
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      specialistId: "mgmt-co.funding",
      specialistLetter: "A",
      fieldKey: "runwayBufferMonths",
      fieldLabel: "Runway buffer (months)",
      fieldSurface: "company-assumptions",
      appearances: 7,
    });
    // Limit was forwarded to storage as a parsed integer.
    expect(
      (storage.getTopPerennialRecommendationOffenders as ReturnType<typeof vi.fn>)
        .mock.calls[0][0],
    ).toBe(10);
  });

  it("GET /api/admin/specialists/perennial-offenders defaults the limit and tolerates an empty result set", async () => {
    const { status, body } = await invoke(
      handlers,
      "GET /api/admin/specialists/perennial-offenders",
    );
    expect(status).toBe(200);
    expect(body).toEqual([]);
    // Bad/missing query → default of 20.
    expect(
      (storage.getTopPerennialRecommendationOffenders as ReturnType<typeof vi.fn>)
        .mock.calls[0][0],
    ).toBe(20);
  });

  // PUT /required-fields, /llm-config, and /runtime are disabled per
  // specialists-are-dev-defined-only.md (admin-cleanup-specialist-readonly, 2026-05-01).
  // Tests updated to assert 405 — disabled endpoints must still be auth-gated.

  it("PUT /api/admin/specialists/:id/required-fields returns 405 (disabled)", async () => {
    const { status } = await invoke(handlers, "PUT /api/admin/specialists/:id/required-fields", {
      params: { id: "photos.photo-enhancer" },
      body: { fields: ["foo"] },
    });
    expect(status).toBe(405);
    expect(storage.updateSpecialistConfigSection).not.toHaveBeenCalled();
  });

  it("PUT /api/admin/specialists/:id/llm-config returns 405 (disabled)", async () => {
    const { status } = await invoke(handlers, "PUT /api/admin/specialists/:id/llm-config", {
      params: { id: "mgmt-co.funding" },
      body: { promptTemplate: "tpl", modelResourceId: 7 },
    });
    expect(status).toBe(405);
    expect(storage.updateSpecialistConfigSection).not.toHaveBeenCalled();
  });

  it("PUT /api/admin/specialists/:id/runtime returns 405 (disabled)", async () => {
    const { status } = await invoke(handlers, "PUT /api/admin/specialists/:id/runtime", {
      params: { id: "portfolio-ops.watchdog" },
      body: { runtimeConfig: { thresholds: { adr: 0.1 } } },
    });
    expect(status).toBe(405);
    expect(storage.updateSpecialistConfigSection).not.toHaveBeenCalled();
  });

  // All remaining PUT /runtime tests are replaced with a single 405 assertion.
  // The /runtime endpoint is disabled per specialists-are-dev-defined-only.md.
  // Schema validation tests (size/depth/Photos validation) are no longer
  // meaningful since the route no longer processes the body.
  it("PUT /api/admin/specialists/:id/runtime returns 405 for Photos (disabled)", async () => {
    const { status } = await invoke(handlers, "PUT /api/admin/specialists/:id/runtime", {
      params: { id: "photos.photo-enhancer" },
      body: { runtimeConfig: { scheduledStyle: "standard" } },
    });
    expect(status).toBe(405);
  });

  it("PUT /api/admin/specialists/:id/runtime response — PLACEHOLDER removed (disabled)", async () => {
    // Formerly tested recommendedModelSlugs in the 200 response.
    // Endpoint now returns 405; this stub keeps the test file non-empty.
    const { status } = await invoke(handlers, "PUT /api/admin/specialists/:id/runtime", {
      params: { id: "portfolio-ops.watchdog" },
      body: { runtimeConfig: {} },
    });
    expect(status).toBe(405);
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

  // /field-toggles and /prerequisite-toggles are disabled per
  // specialists-are-dev-defined-only.md (admin-cleanup, 2026-05-01).
  it("PUT /api/admin/specialists/:id/field-toggles returns 405 (disabled)", async () => {
    const { status } = await invoke(handlers, "PUT /api/admin/specialists/:id/field-toggles", {
      params: { id: "property.risk-intelligence" },
      body: { fieldRequirements: { country: "recommended" } },
    });
    expect(status).toBe(405);
    expect(storage.updateSpecialistConfigSection).not.toHaveBeenCalled();
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
  // PUT /llm-config is disabled per specialists-are-dev-defined-only.md (2026-05-01).
  // All per-field override and audit-diff tests are replaced with a 405 assertion.
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

  it("PUT /llm-config returns 405 for all override cases (disabled)", async () => {
    const { status } = await invoke(
      handlers,
      "PUT /api/admin/specialists/:id/llm-config",
      { params: { id: "mgmt-co.funding" }, body: { promptTemplate: "", modelResourceId: null } },
    );
    expect(status).toBe(405);
    expect(storage.updateSpecialistConfigSection).not.toHaveBeenCalled();
  });
});