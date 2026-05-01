/**
 * Route tests for the three sibling Specialist quality endpoints in
 * `server/routes/admin/resources-transparency.ts` (Task #546). Task #537
 * already covered `GET /:id/quality/history`; the routes under test here
 * are the ones the Specialist page's quality card and the gaps banner's
 * "Recompute all" button rely on:
 *
 *   • GET  /api/admin/specialists/:id/quality
 *       Lazy auto-recompute: returns a fresh snapshot as-is, but kicks
 *       off `recomputeAndRecordSpecialistQuality` exactly once when the
 *       snapshot is missing or older than the 6h TTL before responding.
 *   • POST /api/admin/specialists/:id/quality/recompute
 *       Force-recompute admin button. Returns the result shape
 *       `{ specialistId, score, gaps, signals }`.
 *   • POST /api/admin/specialists/quality/recompute-all
 *       Bulk recompute used by the gaps-banner refresh button. Iterates
 *       every catalog id and returns `{ updated, results }`.
 *
 * The recompute function and storage are mocked; we only exercise the
 * route shells. Mocking pattern mirrors `admin-specialist-quality.test.ts`
 * (Task #537) so reviewers can diff the two side-by-side.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Express, Request, Response, NextFunction, RequestHandler } from "express";

// ── Storage mock ────────────────────────────────────────────────────────────
vi.mock("../../server/storage", () => ({
  storage: {
    getLatestQualitySnapshot: vi.fn(),
    // Methods touched by the rest of the transparency router; declare as
    // no-op vi.fn() so registration doesn't choke if it inspects storage.
    listQualitySnapshotHistory: vi.fn(),
    listAdminResources: vi.fn(),
    getAdminResourceById: vi.fn(),
    getLatestHealthCheck: vi.fn(),
    listHealthChecksForResource: vi.fn(),
    listResourceImpact: vi.fn(),
    listSpecialistAssignments: vi.fn(),
    getResearchRunsForSpecialist: vi.fn(),
    getLatestQualitySnapshotsFor: vi.fn().mockResolvedValue(new Map()),
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
// Three specialists exist so the recompute-all assertion can prove the
// route iterates the whole catalog (not just the first one). The list
// is inlined inside the factory because `vi.mock` is hoisted above any
// top-level `const` declarations.
vi.mock("../../engine/analyst/registry/specialist-catalog", () => {
  const catalog = [
    { id: "alpha", letter: "A", humanName: "Alpha" },
    { id: "bravo", letter: "B", humanName: "Bravo" },
    { id: "charlie", letter: "C", humanName: "Charlie" },
  ];
  return {
    getSpecialistById: (id: string) => catalog.find((d) => d.id === id),
    SPECIALIST_CATALOG: catalog,
  };
});

vi.mock("../../server/ai/research-quality", () => ({
  recomputeAndRecordSpecialistQuality: vi.fn(),
}));

vi.mock("../../server/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { storage } from "../../server/storage";
import { recomputeAndRecordSpecialistQuality } from "../../server/ai/research-quality";
import { registerResourceTransparencyRoutes } from "../../server/routes/admin/resources-transparency";

// ── Lightweight Express stub (mirrors admin-specialist-quality.test.ts) ────
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
  await new Promise((r) => setTimeout(r, 0));
  return { status, body };
}

const QUALITY_TTL_MS = 6 * 60 * 60 * 1000;

// Reusable result shape returned by the mocked recompute.
function makeRecomputeResult(specialistId: string, score = 80) {
  return {
    score,
    gaps: [
      { kind: "missing-source", severity: "critical" as const, message: "no probe" },
    ],
    signals: { freshnessMs: 1234, runs: { total: 5, ok: 5 } },
  };
}

describe("Specialist quality routes (Task #546)", () => {
  let handlers: Handlers;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 99, role: "super_admin" };
    const made = makeApp();
    handlers = made.handlers;
    registerResourceTransparencyRoutes(made.app);
  });

  // ───────────────────────────────────────────────────────────────────────
  // GET /api/admin/specialists/:id/quality
  // ───────────────────────────────────────────────────────────────────────
  describe("GET /api/admin/specialists/:id/quality", () => {
    const ROUTE = "GET /api/admin/specialists/:id/quality";

    it("returns 401 when the request is unauthenticated", async () => {
      mockUser = null;
      const { status, body } = await invoke(handlers, ROUTE, { params: { id: "alpha" } });
      expect(status).toBe(401);
      expect((body as { error: string }).error).toMatch(/auth/i);
      expect(storage.getLatestQualitySnapshot).not.toHaveBeenCalled();
      expect(recomputeAndRecordSpecialistQuality).not.toHaveBeenCalled();
    });

    it("returns 403 when the user is authenticated but not an admin", async () => {
      mockUser = { id: 7, role: "viewer" };
      const { status, body } = await invoke(handlers, ROUTE, { params: { id: "alpha" } });
      expect(status).toBe(403);
      expect((body as { error: string }).error).toMatch(/admin/i);
      expect(storage.getLatestQualitySnapshot).not.toHaveBeenCalled();
      expect(recomputeAndRecordSpecialistQuality).not.toHaveBeenCalled();
    });

    it("returns 404 when the specialist id is unknown to the catalog", async () => {
      const { status, body } = await invoke(handlers, ROUTE, { params: { id: "ghost" } });
      expect(status).toBe(404);
      expect((body as { error: string }).error).toMatch(/specialist not found/i);
      expect(storage.getLatestQualitySnapshot).not.toHaveBeenCalled();
      expect(recomputeAndRecordSpecialistQuality).not.toHaveBeenCalled();
    });

    it("returns the existing snapshot WITHOUT recomputing when it is fresh", async () => {
      // Within TTL → no recompute, single read of the existing snapshot.
      const computedAt = new Date(Date.now() - 60 * 60 * 1000); // 1h old
      (storage.getLatestQualitySnapshot as ReturnType<typeof vi.fn>).mockResolvedValue({
        specialistId: "alpha",
        score: 87,
        gaps: [{ kind: "stale-runs", severity: "warning", message: "stale" }],
        signals: { freshnessMs: 100 },
        computedAt,
      });

      const { status, body } = await invoke(handlers, ROUTE, { params: { id: "alpha" } });
      expect(status).toBe(200);
      expect(body).toEqual({
        specialistId: "alpha",
        score: 87,
        gaps: [{ kind: "stale-runs", severity: "warning", message: "stale" }],
        signals: { freshnessMs: 100 },
        computedAt: computedAt.toISOString(),
      });
      expect(recomputeAndRecordSpecialistQuality).not.toHaveBeenCalled();
      // The route reads twice: once to check freshness, once to render.
      // Both reads return the same fresh snapshot because the TTL branch
      // never fired (no recompute happened in between).
      expect(storage.getLatestQualitySnapshot).toHaveBeenCalledTimes(2);
    });

    it("recomputes exactly once when no snapshot exists, then returns the new one", async () => {
      // First read returns nothing (missing) → triggers recompute → second
      // read picks up the freshly-persisted snapshot and serves it.
      const fresh = {
        specialistId: "alpha",
        score: 72,
        gaps: [],
        signals: { freshnessMs: 0 },
        computedAt: new Date(),
      };
      (storage.getLatestQualitySnapshot as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(fresh);
      (recomputeAndRecordSpecialistQuality as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeRecomputeResult("alpha", 72),
      );

      const { status, body } = await invoke(handlers, ROUTE, { params: { id: "alpha" } });
      expect(status).toBe(200);
      expect(recomputeAndRecordSpecialistQuality).toHaveBeenCalledTimes(1);
      expect(recomputeAndRecordSpecialistQuality).toHaveBeenCalledWith("alpha");
      expect((body as { score: number }).score).toBe(72);
    });

    it("recomputes exactly once when the snapshot is older than the 6h TTL", async () => {
      const stale = {
        specialistId: "alpha",
        score: 50,
        gaps: [],
        signals: {},
        computedAt: new Date(Date.now() - QUALITY_TTL_MS - 60 * 1000), // > 6h old
      };
      const fresh = { ...stale, score: 88, computedAt: new Date() };
      (storage.getLatestQualitySnapshot as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(stale)
        .mockResolvedValueOnce(fresh);
      (recomputeAndRecordSpecialistQuality as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeRecomputeResult("alpha", 88),
      );

      const { status, body } = await invoke(handlers, ROUTE, { params: { id: "alpha" } });
      expect(status).toBe(200);
      expect(recomputeAndRecordSpecialistQuality).toHaveBeenCalledTimes(1);
      expect(recomputeAndRecordSpecialistQuality).toHaveBeenCalledWith("alpha");
      expect((body as { score: number }).score).toBe(88);
    });

    it("returns 500 when no snapshot is available even after recompute", async () => {
      // Defensive branch: recompute "succeeded" but the second read still
      // returns nothing (e.g. storage write swallowed). Route must surface
      // this as a 500 instead of crashing on a null snapshot.
      (storage.getLatestQualitySnapshot as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (recomputeAndRecordSpecialistQuality as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeRecomputeResult("alpha"),
      );

      const { status, body } = await invoke(handlers, ROUTE, { params: { id: "alpha" } });
      expect(status).toBe(500);
      expect((body as { error: string }).error).toMatch(/quality snapshot unavailable/i);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // POST /api/admin/specialists/:id/quality/recompute
  // ───────────────────────────────────────────────────────────────────────
  describe("POST /api/admin/specialists/:id/quality/recompute", () => {
    const ROUTE = "POST /api/admin/specialists/:id/quality/recompute";

    it("returns 401 when the request is unauthenticated", async () => {
      mockUser = null;
      const { status, body } = await invoke(handlers, ROUTE, { params: { id: "alpha" } });
      expect(status).toBe(401);
      expect((body as { error: string }).error).toMatch(/auth/i);
      expect(recomputeAndRecordSpecialistQuality).not.toHaveBeenCalled();
    });

    it("returns 403 when the user is authenticated but not an admin", async () => {
      mockUser = { id: 7, role: "viewer" };
      const { status, body } = await invoke(handlers, ROUTE, { params: { id: "alpha" } });
      expect(status).toBe(403);
      expect((body as { error: string }).error).toMatch(/admin/i);
      expect(recomputeAndRecordSpecialistQuality).not.toHaveBeenCalled();
    });

    it("returns 404 when the specialist id is unknown to the catalog", async () => {
      const { status, body } = await invoke(handlers, ROUTE, { params: { id: "ghost" } });
      expect(status).toBe(404);
      expect((body as { error: string }).error).toMatch(/specialist not found/i);
      expect(recomputeAndRecordSpecialistQuality).not.toHaveBeenCalled();
    });

    it("returns the recompute result shape { specialistId, score, gaps, signals }", async () => {
      const result = makeRecomputeResult("alpha", 91);
      (recomputeAndRecordSpecialistQuality as ReturnType<typeof vi.fn>).mockResolvedValue(result);

      const { status, body } = await invoke(handlers, ROUTE, { params: { id: "alpha" } });
      expect(status).toBe(200);
      expect(body).toEqual({
        specialistId: "alpha",
        score: result.score,
        gaps: result.gaps,
        signals: result.signals,
      });
      expect(recomputeAndRecordSpecialistQuality).toHaveBeenCalledTimes(1);
      expect(recomputeAndRecordSpecialistQuality).toHaveBeenCalledWith("alpha");
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // POST /api/admin/specialists/quality/recompute-all
  // ───────────────────────────────────────────────────────────────────────
  describe("POST /api/admin/specialists/quality/recompute-all", () => {
    const ROUTE = "POST /api/admin/specialists/quality/recompute-all";

    it("returns 401 when the request is unauthenticated", async () => {
      mockUser = null;
      const { status, body } = await invoke(handlers, ROUTE);
      expect(status).toBe(401);
      expect((body as { error: string }).error).toMatch(/auth/i);
      expect(recomputeAndRecordSpecialistQuality).not.toHaveBeenCalled();
    });

    it("returns 403 when the user is authenticated but not an admin", async () => {
      mockUser = { id: 7, role: "viewer" };
      const { status, body } = await invoke(handlers, ROUTE);
      expect(status).toBe(403);
      expect((body as { error: string }).error).toMatch(/admin/i);
      expect(recomputeAndRecordSpecialistQuality).not.toHaveBeenCalled();
    });

    it("iterates every catalog id and returns { updated, results }", async () => {
      // Different score per id so the result order can be asserted.
      const scoreById: Record<string, number> = { alpha: 80, bravo: 65, charlie: 92 };
      (recomputeAndRecordSpecialistQuality as ReturnType<typeof vi.fn>).mockImplementation(
        async (sid: string) => makeRecomputeResult(sid, scoreById[sid] ?? 0),
      );

      const { status, body } = await invoke(handlers, ROUTE);
      expect(status).toBe(200);

      // One call per catalog entry, in catalog order.
      const expectedIds = ["alpha", "bravo", "charlie"];
      expect(recomputeAndRecordSpecialistQuality).toHaveBeenCalledTimes(expectedIds.length);
      const calledIds = (recomputeAndRecordSpecialistQuality as ReturnType<typeof vi.fn>).mock.calls.map(
        (c) => c[0],
      );
      expect(calledIds).toEqual(expectedIds);

      const payload = body as {
        updated: number;
        results: Array<{ specialistId: string; score: number }>;
      };
      expect(payload.updated).toBe(expectedIds.length);
      expect(payload.results).toEqual([
        { specialistId: "alpha", score: 80 },
        { specialistId: "bravo", score: 65 },
        { specialistId: "charlie", score: 92 },
      ]);
    });
  });
});
