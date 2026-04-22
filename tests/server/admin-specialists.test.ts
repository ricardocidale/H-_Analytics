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
    updateSpecialistConfigSection: vi.fn(),
    listSpecialistConfigVersions: vi.fn(),
    listSpecialistAssignments: vi.fn(),
    getAdminResourceById: vi.fn(),
    getLatestHealthCheck: vi.fn(),
    createActivityLog: vi.fn().mockResolvedValue(undefined),
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
  runtimeConfig: {} as Record<string, unknown>,
  refreshCadenceDays: null as number | null,
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
    const items = body as Array<{ id: string; status: string; capabilities: string[] }>;
    expect(items).toHaveLength(SPECIALIST_CATALOG.length);
    expect(items.find((i) => i.id === "mgmt-co.funding")?.status).toBe("built");
    expect(items.find((i) => i.id === "portfolio-ops.watchdog")?.status).toBe("needs-page");
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
    const payload = body as { definition: { id: string; capabilities: string[] }; config: { version: number }; assignments: Array<{ kind: string; resource: unknown; health: { status: string } }> };
    expect(payload.definition.id).toBe("mgmt-co.funding");
    expect(payload.definition.capabilities).toContain("llm-config");
    expect(payload.config.version).toBe(1);
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
