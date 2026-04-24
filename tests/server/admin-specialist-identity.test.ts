/**
 * Phase 3 (Task #453) — admin-editable Specialist identity routes + resolver.
 *
 * Mirrors the structure of admin-specialists.test.ts: storage is mocked,
 * route module is registered against a tiny fake Express, requests dispatched
 * via `invoke`. Asserts:
 *   1. resolver: override beats catalog per field; missing override falls back
 *   2. pronoun helper covers male/female/neutral
 *   3. GET returns catalog + override + resolved view (override-when-present)
 *   4. PUT validates payload and persists with audit
 *   5. PUT rejects oversize humanName
 *   6. DELETE clears the override and returns the catalog-only resolved view
 *   7. Same routes accept id="gaspar" (orchestrator)
 *   8. Auth: 401 / 403 enforced
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Express, Request, Response, NextFunction, RequestHandler } from "express";

vi.mock("../../server/storage", () => ({
  storage: {
    getIdentityOverride: vi.fn(),
    upsertIdentityOverride: vi.fn(),
    resetIdentityOverride: vi.fn(),
    listIdentityOverrideHistory: vi.fn(),
    createActivityLog: vi.fn().mockResolvedValue(undefined),
    // Required by the route module's other handlers — left as no-ops.
    getOrCreateSpecialistConfig: vi.fn(),
    updateSpecialistConfigSection: vi.fn(),
    listSpecialistConfigVersions: vi.fn(),
    listSpecialistAssignments: vi.fn(),
    getAdminResourceById: vi.fn(),
    getLatestHealthCheck: vi.fn(),
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
import { resolveSpecialistIdentity, pronounSet, GASPAR_IDENTITY } from "../../engine/analyst/identity";

type Handlers = Record<string, RequestHandler[]>;
function makeApp(): { app: Express; handlers: Handlers } {
  const handlers: Handlers = {};
  const collect = (m: string) => (path: string, ...rest: RequestHandler[]) => {
    handlers[`${m} ${path}`] = rest;
  };
  const app = {
    get: collect("GET"), post: collect("POST"), put: collect("PUT"), delete: collect("DELETE"),
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
    params: opts.params ?? {}, query: opts.query ?? {}, body: opts.body, headers: {}, ip: "127.0.0.1",
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
    if (idx < chain.length) return chain[idx++](req, res, next);
  };
  next();
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  return { status, body };
}

describe("resolveSpecialistIdentity — pure resolver", () => {
  const catalog = { humanName: "Helena", gender: "female" as const };

  it("returns catalog defaults when override is null", () => {
    const r = resolveSpecialistIdentity(catalog, null);
    expect(r.humanName).toBe("Helena");
    expect(r.gender).toBe("female");
    expect(r.source.humanName).toBe("catalog");
    expect(r.source.gender).toBe("catalog");
  });

  it("override wins per field (humanName only)", () => {
    const r = resolveSpecialistIdentity(catalog, { humanName: "Hellena", gender: null });
    expect(r.humanName).toBe("Hellena");
    expect(r.gender).toBe("female"); // catalog still wins
    expect(r.source.humanName).toBe("override");
    expect(r.source.gender).toBe("catalog");
  });

  it("override wins per field (gender only)", () => {
    const r = resolveSpecialistIdentity(catalog, { humanName: null, gender: "neutral" });
    expect(r.humanName).toBe("Helena");
    expect(r.gender).toBe("neutral");
    expect(r.source.humanName).toBe("catalog");
    expect(r.source.gender).toBe("override");
  });

  it("override wins for both fields", () => {
    const r = resolveSpecialistIdentity(catalog, { humanName: "Hel", gender: "male" });
    expect(r.humanName).toBe("Hel");
    expect(r.gender).toBe("male");
    expect(r.source.humanName).toBe("override");
    expect(r.source.gender).toBe("override");
  });
});

describe("pronounSet — covers all 3 grammatical genders", () => {
  it("female", () => {
    expect(pronounSet("female")).toEqual({
      subject: "she", object: "her", possessive: "her", possessivePronoun: "hers", reflexive: "herself",
    });
  });
  it("male", () => {
    expect(pronounSet("male")).toEqual({
      subject: "he", object: "him", possessive: "his", possessivePronoun: "his", reflexive: "himself",
    });
  });
  it("neutral", () => {
    expect(pronounSet("neutral")).toEqual({
      subject: "they", object: "them", possessive: "their", possessivePronoun: "theirs", reflexive: "themself",
    });
  });
});

describe("admin/specialists identity routes", () => {
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

  it("GET returns catalog + override + resolved view (override-wins)", async () => {
    (storage.getIdentityOverride as ReturnType<typeof vi.fn>).mockResolvedValue({
      specialistId: "constants.tax-research",
      humanName: "Hellena",
      gender: null,
      updatedByUserId: 99,
      updatedAt: new Date("2026-04-23T00:00:00Z"),
    });
    const { status, body } = await invoke(handlers, "GET /api/admin/specialists/:id/identity", {
      params: { id: "constants.tax-research" },
    });
    expect(status).toBe(200);
    const view = body as { catalog: { humanName: string }; override: { humanName: string } | null; resolved: { humanName: string; source: { humanName: string; gender: string } } };
    expect(view.catalog.humanName).toBe("Helena");
    expect(view.override?.humanName).toBe("Hellena");
    expect(view.resolved.humanName).toBe("Hellena");
    expect(view.resolved.source.humanName).toBe("override");
    expect(view.resolved.source.gender).toBe("catalog");
  });

  it("GET returns null override when no row exists", async () => {
    (storage.getIdentityOverride as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const { status, body } = await invoke(handlers, "GET /api/admin/specialists/:id/identity", {
      params: { id: "constants.tax-research" },
    });
    expect(status).toBe(200);
    const view = body as { override: unknown; resolved: { humanName: string } };
    expect(view.override).toBeNull();
    expect(view.resolved.humanName).toBe("Helena");
  });

  it("GET 404s for unknown specialist", async () => {
    const { status } = await invoke(handlers, "GET /api/admin/specialists/:id/identity", {
      params: { id: "does-not-exist" },
    });
    expect(status).toBe(404);
  });

  it("GET accepts id=\"gaspar\" (orchestrator)", async () => {
    (storage.getIdentityOverride as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const { status, body } = await invoke(handlers, "GET /api/admin/specialists/:id/identity", {
      params: { id: "gaspar" },
    });
    expect(status).toBe(200);
    const view = body as { catalog: { humanName: string; gender: string }; resolved: { humanName: string } };
    expect(view.catalog.humanName).toBe(GASPAR_IDENTITY.humanName);
    expect(view.catalog.gender).toBe("male");
    expect(view.resolved.humanName).toBe(GASPAR_IDENTITY.humanName);
  });

  it("PUT validates payload and persists override + writes audit", async () => {
    (storage.upsertIdentityOverride as ReturnType<typeof vi.fn>).mockResolvedValue({
      specialistId: "constants.tax-research",
      humanName: "Hellena",
      gender: "female",
      updatedByUserId: 99,
      updatedAt: new Date(),
    });
    const { status, body } = await invoke(handlers, "PUT /api/admin/specialists/:id/identity", {
      params: { id: "constants.tax-research" },
      body: { humanName: "Hellena", gender: "female", changeSummary: "spelling" },
    });
    expect(status).toBe(200);
    expect((body as { resolved: { humanName: string } }).resolved.humanName).toBe("Hellena");
    expect(storage.upsertIdentityOverride).toHaveBeenCalledWith(
      "constants.tax-research",
      { humanName: "Hellena", gender: "female" },
      99,
      "spelling",
    );
    expect(storage.createActivityLog).toHaveBeenCalled();
  });

  it("PUT rejects humanName longer than 40 chars", async () => {
    const { status } = await invoke(handlers, "PUT /api/admin/specialists/:id/identity", {
      params: { id: "constants.tax-research" },
      body: { humanName: "x".repeat(41), gender: "female" },
    });
    expect(status).toBe(400);
    expect(storage.upsertIdentityOverride).not.toHaveBeenCalled();
  });

  it("PUT rejects unknown gender value", async () => {
    const { status } = await invoke(handlers, "PUT /api/admin/specialists/:id/identity", {
      params: { id: "constants.tax-research" },
      body: { humanName: "Helena", gender: "robot" },
    });
    expect(status).toBe(400);
  });

  it("PUT accepts null fields (per-field clearing)", async () => {
    (storage.upsertIdentityOverride as ReturnType<typeof vi.fn>).mockResolvedValue({
      specialistId: "constants.tax-research",
      humanName: null,
      gender: "neutral",
      updatedByUserId: 99,
      updatedAt: new Date(),
    });
    const { status } = await invoke(handlers, "PUT /api/admin/specialists/:id/identity", {
      params: { id: "constants.tax-research" },
      body: { humanName: null, gender: "neutral" },
    });
    expect(status).toBe(200);
    expect(storage.upsertIdentityOverride).toHaveBeenCalledWith(
      "constants.tax-research",
      { humanName: null, gender: "neutral" },
      99,
      undefined,
    );
  });

  it("DELETE clears the override and returns catalog-only resolved view", async () => {
    (storage.resetIdentityOverride as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const { status, body } = await invoke(handlers, "DELETE /api/admin/specialists/:id/identity", {
      params: { id: "constants.tax-research" },
      body: { changeSummary: "back to default" },
    });
    expect(status).toBe(200);
    const view = body as { override: unknown; resolved: { humanName: string; source: { humanName: string } } };
    expect(view.override).toBeNull();
    expect(view.resolved.humanName).toBe("Helena");
    expect(view.resolved.source.humanName).toBe("catalog");
    expect(storage.resetIdentityOverride).toHaveBeenCalledWith(
      "constants.tax-research",
      99,
      "back to default",
    );
  });

  it("PUT accepts id=\"gaspar\"", async () => {
    (storage.upsertIdentityOverride as ReturnType<typeof vi.fn>).mockResolvedValue({
      specialistId: "gaspar",
      humanName: "Gaspar Sr.",
      gender: "male",
      updatedByUserId: 99,
      updatedAt: new Date(),
    });
    const { status } = await invoke(handlers, "PUT /api/admin/specialists/:id/identity", {
      params: { id: "gaspar" },
      body: { humanName: "Gaspar Sr.", gender: "male" },
    });
    expect(status).toBe(200);
    expect(storage.upsertIdentityOverride).toHaveBeenCalled();
  });

  it("rejects unauthenticated callers (401)", async () => {
    mockUser = null;
    const { status } = await invoke(handlers, "GET /api/admin/specialists/:id/identity", {
      params: { id: "constants.tax-research" },
    });
    expect(status).toBe(401);
  });

  it("rejects non-admin callers (403)", async () => {
    mockUser = { id: 1, role: "user" };
    const { status } = await invoke(handlers, "PUT /api/admin/specialists/:id/identity", {
      params: { id: "constants.tax-research" },
      body: { humanName: "Helena", gender: "female" },
    });
    expect(status).toBe(403);
  });

  it("GET .../identity/history returns capped, normalized entries", async () => {
    (storage.listIdentityOverrideHistory as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 1, specialistId: "constants.tax-research", action: "upsert",
        prevHumanName: "Helena", prevGender: "female",
        nextHumanName: "Hellena", nextGender: "female",
        changeSummary: "spelling", changedByUserId: 99, changedAt: new Date(),
      },
    ]);
    const { status, body } = await invoke(handlers, "GET /api/admin/specialists/:id/identity/history", {
      params: { id: "constants.tax-research" },
    });
    expect(status).toBe(200);
    const rows = body as Array<{ action: string; prevHumanName: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("upsert");
    expect(rows[0].prevHumanName).toBe("Helena");
  });
});
