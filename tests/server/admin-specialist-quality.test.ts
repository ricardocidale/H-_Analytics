/**
 * Route test for `GET /api/admin/specialists/:id/quality/history`
 * (added in Task #511, registered in
 * `server/routes/admin/resources-transparency.ts`).
 *
 * The Specialist page renders a sparkline of quality score over time from
 * this endpoint, so we lock in the four contracts the chart relies on:
 *
 *   1. Auth gating: 401 when unauthenticated, 403 when authenticated but
 *      not an admin.
 *   2. 404 when the specialist id is unknown to the catalog.
 *   3. 200 with an empty `points` array when no snapshots exist (chart
 *      should render an empty state, not crash).
 *   4. `points` are returned in chronological order (oldest first), the
 *      `limit` query param is forwarded to storage, and invalid limits
 *      are rejected per the Zod schema (returns 400).
 *
 * Storage and the specialist catalog are mocked; we only exercise the
 * route shell here. The mock pattern follows
 * `tests/server/admin-resources.test.ts` (Group 3).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Express, Request, Response, NextFunction, RequestHandler } from "express";

// ── Storage mock ────────────────────────────────────────────────────────────
vi.mock("../../server/storage", () => ({
  storage: {
    listQualitySnapshotHistory: vi.fn(),
    // Other methods touched by the rest of the transparency router are
    // unused by the history route; declare as no-op vi.fn() so that
    // `registerResourceTransparencyRoutes` doesn't choke if it inspects
    // the storage object eagerly (it doesn't today, but be defensive).
    listAdminResources: vi.fn(),
    getAdminResourceById: vi.fn(),
    getLatestHealthCheck: vi.fn(),
    listHealthChecksForResource: vi.fn(),
    listResourceImpact: vi.fn(),
    listSpecialistAssignments: vi.fn(),
    getResearchRunsForSpecialist: vi.fn(),
    getLatestQualitySnapshot: vi.fn(),
    getLatestQualitySnapshotsFor: vi.fn().mockResolvedValue(new Map()),
    listQualitySnapshotHistoryForMany: vi.fn().mockResolvedValue(new Map()),
    aggregateLatestQualityScores: vi.fn(),
  },
}));

// ── Auth mock (switchable per test via `mockUser`) ──────────────────────────
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

// ── Specialist catalog mock ────────────────────────────────────────────────
// Only "alpha" exists; any other id should 404.
vi.mock("../../engine/analyst/registry/specialist-catalog", () => ({
  getSpecialistById: (id: string) =>
    id === "alpha" ? { id: "alpha", letter: "A", humanName: "Alpha" } : undefined,
  SPECIALIST_CATALOG: [{ id: "alpha", letter: "A", humanName: "Alpha" }],
}));

// research-quality is only consumed by sibling routes (recompute / quality
// auto-recompute), but the module must resolve when the router is registered.
vi.mock("../../server/ai/research-quality", () => ({
  recomputeAndRecordSpecialistQuality: vi.fn(),
}));

vi.mock("../../server/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { storage } from "../../server/storage";
import { registerResourceTransparencyRoutes } from "../../server/routes/admin/resources-transparency";

// ── Lightweight Express stub (mirrors admin-resources.test.ts) ─────────────
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

const ROUTE = "GET /api/admin/specialists/:id/quality/history";

describe("GET /api/admin/specialists/:id/quality/history", () => {
  let handlers: Handlers;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 99, role: "super_admin" };
    const made = makeApp();
    handlers = made.handlers;
    registerResourceTransparencyRoutes(made.app);
  });

  it("returns 401 when the request is unauthenticated", async () => {
    mockUser = null;
    const { status, body } = await invoke(handlers, ROUTE, { params: { id: "alpha" } });
    expect(status).toBe(401);
    expect((body as { error: string }).error).toMatch(/auth/i);
    expect(storage.listQualitySnapshotHistory).not.toHaveBeenCalled();
  });

  it("returns 403 when the user is authenticated but not an admin", async () => {
    mockUser = { id: 7, role: "viewer" };
    const { status, body } = await invoke(handlers, ROUTE, { params: { id: "alpha" } });
    expect(status).toBe(403);
    expect((body as { error: string }).error).toMatch(/admin/i);
    expect(storage.listQualitySnapshotHistory).not.toHaveBeenCalled();
  });

  it("returns 404 when the specialist id is unknown to the catalog", async () => {
    const { status, body } = await invoke(handlers, ROUTE, { params: { id: "ghost" } });
    expect(status).toBe(404);
    expect((body as { error: string }).error).toMatch(/specialist not found/i);
    expect(storage.listQualitySnapshotHistory).not.toHaveBeenCalled();
  });

  it("returns 200 with an empty `points` array when no snapshots exist", async () => {
    (storage.listQualitySnapshotHistory as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const { status, body } = await invoke(handlers, ROUTE, { params: { id: "alpha" } });
    expect(status).toBe(200);
    expect(body).toEqual({ specialistId: "alpha", points: [] });
    // Default limit is 30 when no `limit` query param was supplied
    // (Task #540: ~30 days of nightly recompute snapshots).
    expect(storage.listQualitySnapshotHistory).toHaveBeenCalledWith("alpha", 30);
  });

  it("returns `points` in chronological order (oldest first) — chart contract", async () => {
    // Storage returns DESC (newest first); the route must reverse it so
    // the chart can plot left-to-right without re-sorting client-side.
    const newest = new Date("2025-03-01T00:00:00.000Z");
    const middle = new Date("2025-02-01T00:00:00.000Z");
    const oldest = new Date("2025-01-01T00:00:00.000Z");
    (storage.listQualitySnapshotHistory as ReturnType<typeof vi.fn>).mockResolvedValue([
      { specialistId: "alpha", score: 90, gaps: [], signals: {}, computedAt: newest },
      { specialistId: "alpha", score: 75, gaps: [], signals: {}, computedAt: middle },
      { specialistId: "alpha", score: 60, gaps: [], signals: {}, computedAt: oldest },
    ]);
    const { status, body } = await invoke(handlers, ROUTE, { params: { id: "alpha" } });
    expect(status).toBe(200);
    const payload = body as {
      specialistId: string;
      points: Array<{ score: number; computedAt: string }>;
    };
    expect(payload.specialistId).toBe("alpha");
    expect(payload.points.map((p) => p.score)).toEqual([60, 75, 90]);
    expect(payload.points.map((p) => p.computedAt)).toEqual([
      oldest.toISOString(),
      middle.toISOString(),
      newest.toISOString(),
    ]);
  });

  it("forwards a valid `limit` query param to storage", async () => {
    (storage.listQualitySnapshotHistory as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const { status } = await invoke(handlers, ROUTE, {
      params: { id: "alpha" },
      query: { limit: "5" },
    });
    expect(status).toBe(200);
    expect(storage.listQualitySnapshotHistory).toHaveBeenCalledWith("alpha", 5);
  });

  it("rejects out-of-range `limit` values with 400 (Zod min/max)", async () => {
    // Zod schema enforces .int().min(1).max(100); 0 and 101 must both fail.
    const tooSmall = await invoke(handlers, ROUTE, {
      params: { id: "alpha" },
      query: { limit: "0" },
    });
    expect(tooSmall.status).toBe(400);

    const tooLarge = await invoke(handlers, ROUTE, {
      params: { id: "alpha" },
      query: { limit: "101" },
    });
    expect(tooLarge.status).toBe(400);

    const notANumber = await invoke(handlers, ROUTE, {
      params: { id: "alpha" },
      query: { limit: "abc" },
    });
    expect(notANumber.status).toBe(400);

    expect(storage.listQualitySnapshotHistory).not.toHaveBeenCalled();
  });

  it("accepts `limit` at the documented boundaries (1 and 100)", async () => {
    (storage.listQualitySnapshotHistory as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const lower = await invoke(handlers, ROUTE, {
      params: { id: "alpha" },
      query: { limit: "1" },
    });
    expect(lower.status).toBe(200);
    expect(storage.listQualitySnapshotHistory).toHaveBeenLastCalledWith("alpha", 1);

    const upper = await invoke(handlers, ROUTE, {
      params: { id: "alpha" },
      query: { limit: "100" },
    });
    expect(upper.status).toBe(200);
    expect(storage.listQualitySnapshotHistory).toHaveBeenLastCalledWith("alpha", 100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bulk per-resource history (Task #555).
//
// `GET /api/admin/resources/:id/quality/history` collapses what used to be
// one request per consumer in the Resource detail dialog into a single
// round trip. We lock in:
//   1. Auth gating (401/403).
//   2. 404 when the resource id does not exist.
//   3. Empty `histories` when the resource has no consumers.
//   4. The payload returns one entry per distinct consumer specialistId,
//      points are chronological (oldest first), and consumers without
//      snapshots get an empty `points` array (not omitted).
//   5. Default limit is 30; `limit` is forwarded to storage and validated
//      with the same Zod min/max as the per-Specialist endpoint.
// ─────────────────────────────────────────────────────────────────────────────
const BULK_ROUTE = "GET /api/admin/resources/:id/quality/history";

describe("GET /api/admin/resources/:id/quality/history", () => {
  let handlers: Handlers;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 99, role: "super_admin" };
    const made = makeApp();
    handlers = made.handlers;
    registerResourceTransparencyRoutes(made.app);
    // Default: resource exists with no consumers; tests override as needed.
    (storage.getAdminResourceById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 7,
      slug: "openai-gpt-5",
      kind: "model",
    });
    (storage.listResourceImpact as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (storage.listQualitySnapshotHistoryForMany as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Map(),
    );
  });

  it("returns 401 when the request is unauthenticated", async () => {
    mockUser = null;
    const { status } = await invoke(handlers, BULK_ROUTE, { params: { id: "7" } });
    expect(status).toBe(401);
    expect(storage.listQualitySnapshotHistoryForMany).not.toHaveBeenCalled();
  });

  it("returns 403 when the user is authenticated but not an admin", async () => {
    mockUser = { id: 7, role: "viewer" };
    const { status } = await invoke(handlers, BULK_ROUTE, { params: { id: "7" } });
    expect(status).toBe(403);
    expect(storage.listQualitySnapshotHistoryForMany).not.toHaveBeenCalled();
  });

  it("returns 404 when the resource id does not exist", async () => {
    (storage.getAdminResourceById as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const { status, body } = await invoke(handlers, BULK_ROUTE, { params: { id: "7" } });
    expect(status).toBe(404);
    expect((body as { error: string }).error).toMatch(/resource not found/i);
    expect(storage.listQualitySnapshotHistoryForMany).not.toHaveBeenCalled();
  });

  it("returns empty histories when the resource has no consumers", async () => {
    const { status, body } = await invoke(handlers, BULK_ROUTE, { params: { id: "7" } });
    expect(status).toBe(200);
    expect(body).toEqual({ resourceId: 7, histories: [] });
    // Even with zero consumers we still call the bulk method (with []) —
    // keeps the route shape predictable and the early-return cheap.
    expect(storage.listQualitySnapshotHistoryForMany).toHaveBeenCalledWith([], 30);
  });

  it("returns one chronological points array per distinct consumer", async () => {
    (storage.listResourceImpact as ReturnType<typeof vi.fn>).mockResolvedValue([
      { specialistId: "alpha", required: true, assignmentRole: "primary" },
      { specialistId: "beta", required: false, assignmentRole: "primary" },
      { specialistId: "alpha", required: false, assignmentRole: "secondary" },
    ]);
    const newest = new Date("2025-03-01T00:00:00.000Z");
    const oldest = new Date("2025-01-01T00:00:00.000Z");
    (storage.listQualitySnapshotHistoryForMany as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Map([
        // Storage returns DESC; the route must reverse to chronological.
        [
          "alpha",
          [
            { specialistId: "alpha", score: 90, gaps: [], signals: {}, computedAt: newest },
            { specialistId: "alpha", score: 60, gaps: [], signals: {}, computedAt: oldest },
          ],
        ],
        // beta: empty array (consumer with no snapshots) — still surfaced
        // so the client can render the empty-state per row.
        ["beta", []],
      ]),
    );
    const { status, body } = await invoke(handlers, BULK_ROUTE, { params: { id: "7" } });
    expect(status).toBe(200);
    const payload = body as {
      resourceId: number;
      histories: Array<{ specialistId: string; points: Array<{ score: number; computedAt: string }> }>;
    };
    expect(payload.resourceId).toBe(7);
    // Distinct consumers only (alpha appears twice in impact rows).
    expect(payload.histories.map((h) => h.specialistId).sort()).toEqual(["alpha", "beta"]);
    const alpha = payload.histories.find((h) => h.specialistId === "alpha")!;
    expect(alpha.points.map((p) => p.score)).toEqual([60, 90]);
    expect(alpha.points.map((p) => p.computedAt)).toEqual([
      oldest.toISOString(),
      newest.toISOString(),
    ]);
    const beta = payload.histories.find((h) => h.specialistId === "beta")!;
    expect(beta.points).toEqual([]);
    // Bulk storage method got the deduped consumer list.
    const callArgs = (storage.listQualitySnapshotHistoryForMany as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(callArgs[0].sort()).toEqual(["alpha", "beta"]);
    expect(callArgs[1]).toBe(30);
  });

  it("forwards a valid `limit` query param to storage", async () => {
    const { status } = await invoke(handlers, BULK_ROUTE, {
      params: { id: "7" },
      query: { limit: "5" },
    });
    expect(status).toBe(200);
    expect(storage.listQualitySnapshotHistoryForMany).toHaveBeenCalledWith([], 5);
  });

  it("rejects out-of-range `limit` values with 400 (Zod min/max)", async () => {
    for (const bad of ["0", "101", "abc"]) {
      const { status } = await invoke(handlers, BULK_ROUTE, {
        params: { id: "7" },
        query: { limit: bad },
      });
      expect(status).toBe(400);
    }
    expect(storage.listQualitySnapshotHistoryForMany).not.toHaveBeenCalled();
  });
});
