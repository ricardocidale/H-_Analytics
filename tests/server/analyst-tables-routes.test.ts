/**
 * End-to-end-ish tests for the second Analyst-managed table (`exit_multiples`).
 *
 * Two concerns are exercised here:
 *   1. Route layer (`server/routes/admin/analyst-tables.ts`):
 *        - GET  /api/admin/analyst-tables             (both tables, freshness)
 *        - POST /:id/refresh                          (routes through researchExitMultiples)
 *        - POST /:id/commit                           (upserts exit_multiples)
 *        - POST /:id/reseed-accounts                  (upserts exit_multiples)
 *   2. Storage layer (`server/storage/intelligence-v2.ts`):
 *        - upsertExitMultiple insert path (no existing row)
 *        - upsertExitMultiple update path (existing row)
 *
 * The seven security guards are covered separately in
 * `analyst-refresh-guards.test.ts`, so we stub out `analystRefreshGuards()`
 * here to keep the focus on the second-branch wiring.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Express, Request, Response, NextFunction, RequestHandler } from "express";

// ── Mocks (must be declared before importing the module under test) ─────────
vi.mock("../../server/storage", () => ({
  storage: {
    getAnalystRefreshSettings: vi.fn(),
    getCapitalRaiseBenchmarkSummary: vi.fn(),
    getExitMultiplesSummary: vi.fn(),
    getRecentAnalystRefreshAuditLogs: vi.fn(),
    getCapitalRaiseBenchmarks: vi.fn(),
    getExitMultiples: vi.fn(),
    upsertCapitalRaiseBenchmark: vi.fn(),
    upsertExitMultiple: vi.fn(),
    finalizeAnalystRefreshAuditLog: vi.fn(),
    createAnalystRefreshAuditLog: vi.fn(),
    updateAnalystRefreshSettings: vi.fn(),
    createActivityLog: vi.fn(),
  },
}));

vi.mock("../../server/auth", () => ({
  requireAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock("../../server/middleware/analyst-refresh-guards", async () => {
  const actual = await vi.importActual<
    typeof import("../../server/middleware/analyst-refresh-guards")
  >("../../server/middleware/analyst-refresh-guards");
  return {
    ...actual,
    analystRefreshGuards: () => [
      (_req: Request, res: Response, next: NextFunction) => {
        res.locals.analystRefreshAuditId = 4242;
        next();
      },
    ],
    releaseInFlight: vi.fn(),
  };
});

vi.mock("../../server/ai/analyst-table-refresh", () => ({
  researchCapitalRaiseBenchmarks: vi.fn(),
  researchExitMultiples: vi.fn(),
}));

vi.mock("../../server/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { storage } from "../../server/storage";
import { registerAdminAnalystTableRoutes } from "../../server/routes/admin/analyst-tables";
import {
  researchCapitalRaiseBenchmarks,
  researchExitMultiples,
} from "../../server/ai/analyst-table-refresh";

// ── Mini express harness — captures handlers by `${METHOD} ${path}` ─────────
type Handlers = Record<string, RequestHandler[]>;

function makeApp(): { app: Express; handlers: Handlers } {
  const handlers: Handlers = {};
  const collect =
    (method: string) =>
    (path: string, ...fns: RequestHandler[]) => {
      handlers[`${method} ${path}`] = fns;
    };
  const app = {
    get: collect("GET"),
    post: collect("POST"),
    patch: collect("PATCH"),
    delete: collect("DELETE"),
    put: collect("PUT"),
    use: () => {},
  } as unknown as Express;
  return { app, handlers };
}

async function invoke(
  handlers: Handlers,
  method: string,
  path: string,
  opts: { params?: Record<string, string>; body?: unknown } = {},
): Promise<{ statusCode: number; body: unknown }> {
  const fns = handlers[`${method} ${path}`];
  if (!fns) throw new Error(`No handler registered for ${method} ${path}`);
  const req: any = {
    params: opts.params ?? {},
    body: opts.body ?? {},
    headers: {},
    user: { id: 1, role: "admin" },
    ip: "127.0.0.1",
    socket: { remoteAddress: "127.0.0.1" },
  };
  const res: any = { locals: {}, statusCode: 200, body: undefined, headersSent: false };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (data: unknown) => { res.body = data; res.headersSent = true; return res; };
  res.setHeader = () => res;
  res.on = () => {};

  for (const fn of fns) {
    if (res.headersSent) break;
    let nextCalled = false;
    let nextErr: unknown = null;
    await new Promise<void>((resolve, reject) => {
      const ret = (fn as any)(req, res, (err?: unknown) => {
        nextCalled = true;
        nextErr = err;
        resolve();
      });
      if (ret && typeof (ret as Promise<unknown>).then === "function") {
        (ret as Promise<unknown>).then(() => resolve()).catch(reject);
      } else if (!nextCalled && res.headersSent) {
        resolve();
      } else if (!nextCalled) {
        // Synchronous handler that didn't call next and didn't respond yet.
        // Resolve so we don't hang; subsequent loop iteration will handle.
        resolve();
      }
    });
    if (nextErr) throw nextErr;
    if (!nextCalled && res.headersSent) break;
  }
  return { statusCode: res.statusCode, body: res.body };
}

// ── Route-layer tests ─────────────────────────────────────────────────────
describe("admin/analyst-tables routes — second branch (exit_multiples)", () => {
  let handlers: Handlers;
  const mockedStorage = storage as unknown as Record<string, ReturnType<typeof vi.fn>>;
  const mockedResearchExit = researchExitMultiples as unknown as ReturnType<typeof vi.fn>;
  const mockedResearchCapital = researchCapitalRaiseBenchmarks as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedStorage.createActivityLog.mockResolvedValue(undefined);
    const { app, handlers: h } = makeApp();
    registerAdminAnalystTableRoutes(app);
    handlers = h;
  });

  describe("GET /api/admin/analyst-tables", () => {
    it("returns BOTH tables (capital_raise_benchmarks + exit_multiples) with freshness", async () => {
      const recent = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000); // 1 day old → fresh
      const stale = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // 60 days old → stale (cadence=30)

      mockedStorage.getAnalystRefreshSettings.mockResolvedValue({
        globalCadenceDays: 30,
        lastSuspiciousAlertAt: null,
      });
      mockedStorage.getCapitalRaiseBenchmarkSummary.mockResolvedValue({
        rows: [{ dimensionKey: "valuationCap", label: "Valuation Cap", unit: "usd",
                 valueLow: 1, valueMid: 2, valueHigh: 3 }],
        sourceCount: 5,
        lastRefreshedAt: recent,
      });
      mockedStorage.getExitMultiplesSummary.mockResolvedValue({
        rows: [{ dimensionKey: "saas", label: "SaaS", unit: "x_revenue",
                 valueLow: 3, valueMid: 6, valueHigh: 12 }],
        sourceCount: 4,
        lastRefreshedAt: stale,
      });
      mockedStorage.getRecentAnalystRefreshAuditLogs.mockResolvedValue([{ tokensUsed: 1234 }]);

      const { statusCode, body } = await invoke(handlers, "GET", "/api/admin/analyst-tables");
      expect(statusCode).toBe(200);
      const tables = (body as any).tables as Array<{ id: string; freshness: string; ranges: unknown[] }>;
      expect(tables).toHaveLength(2);
      const capital = tables.find(t => t.id === "capital_raise_benchmarks")!;
      const exits = tables.find(t => t.id === "exit_multiples")!;
      expect(capital).toBeDefined();
      expect(exits).toBeDefined();
      expect(capital.freshness).toBe("fresh");
      expect(exits.freshness).toBe("stale");
      expect(exits.ranges).toHaveLength(1);
      expect((exits.ranges[0] as any).dimensionKey).toBe("saas");
      expect((body as any).settings.globalCadenceDays).toBe(30);
    });

    it("reports freshness=missing when exit_multiples has never been refreshed", async () => {
      mockedStorage.getAnalystRefreshSettings.mockResolvedValue({
        globalCadenceDays: 30, lastSuspiciousAlertAt: null,
      });
      mockedStorage.getCapitalRaiseBenchmarkSummary.mockResolvedValue({
        rows: [], sourceCount: 0, lastRefreshedAt: null,
      });
      mockedStorage.getExitMultiplesSummary.mockResolvedValue({
        rows: [], sourceCount: 0, lastRefreshedAt: null,
      });
      mockedStorage.getRecentAnalystRefreshAuditLogs.mockResolvedValue([]);

      const { body } = await invoke(handlers, "GET", "/api/admin/analyst-tables");
      const exits = (body as any).tables.find((t: any) => t.id === "exit_multiples");
      expect(exits.freshness).toBe("missing");
      expect(exits.tokensUsedLastRefresh).toBeNull();
    });
  });

  describe("POST /api/admin/analyst-tables/exit_multiples/refresh", () => {
    it("routes through researchExitMultiples (NOT researchCapitalRaiseBenchmarks) and finalizes the audit row", async () => {
      mockedStorage.getExitMultiples.mockResolvedValue([
        { dimensionKey: "saas", label: "SaaS", unit: "x_revenue",
          valueLow: 3, valueMid: 6, valueHigh: 12 },
      ]);
      mockedResearchExit.mockResolvedValue({
        proposedRanges: [{ dimensionKey: "saas", label: "SaaS", unit: "x_revenue",
                           valueLow: 4, valueMid: 7, valueHigh: 14 }],
        narration: ["…"],
        sourceCount: 3,
        tokensUsed: 555,
        evidence: [{ source: "PitchBook 2026", finding: "median 7x" }],
      });
      mockedStorage.finalizeAnalystRefreshAuditLog.mockResolvedValue(undefined);

      const { statusCode, body } = await invoke(
        handlers, "POST", "/api/admin/analyst-tables/:id/refresh",
        { params: { id: "exit_multiples" } },
      );

      expect(statusCode).toBe(200);
      expect(mockedResearchExit).toHaveBeenCalledTimes(1);
      expect(mockedResearchCapital).not.toHaveBeenCalled();
      expect(mockedStorage.getExitMultiples).toHaveBeenCalledTimes(1);
      expect(mockedStorage.getCapitalRaiseBenchmarks).not.toHaveBeenCalled();

      // Audit log finalized as success with the LLM tokens & sourceCount
      expect(mockedStorage.finalizeAnalystRefreshAuditLog).toHaveBeenCalledWith(
        4242,
        expect.objectContaining({
          status: "success",
          tokensUsed: 555,
          sourceCount: 3,
        }),
      );
      expect((body as any).tableId).toBe("exit_multiples");
      expect((body as any).auditId).toBe(4242);
      expect((body as any).proposedRanges[0].valueMid).toBe(7);
    });

    it("finalizes audit row as failure when researchExitMultiples throws", async () => {
      mockedStorage.getExitMultiples.mockResolvedValue([]);
      mockedResearchExit.mockRejectedValue(new Error("LLM exploded"));
      mockedStorage.finalizeAnalystRefreshAuditLog.mockResolvedValue(undefined);

      const { statusCode } = await invoke(
        handlers, "POST", "/api/admin/analyst-tables/:id/refresh",
        { params: { id: "exit_multiples" } },
      );

      expect(statusCode).toBe(500);
      expect(mockedStorage.finalizeAnalystRefreshAuditLog).toHaveBeenCalledWith(
        4242,
        expect.objectContaining({ status: "failure", errorMessage: "LLM exploded" }),
      );
    });
  });

  describe("POST /api/admin/analyst-tables/exit_multiples/commit", () => {
    it("upserts into exit_multiples (NOT capital_raise_benchmarks)", async () => {
      mockedStorage.upsertExitMultiple.mockResolvedValue({});
      mockedStorage.finalizeAnalystRefreshAuditLog.mockResolvedValue(undefined);

      const { statusCode, body } = await invoke(
        handlers, "POST", "/api/admin/analyst-tables/:id/commit",
        {
          params: { id: "exit_multiples" },
          body: {
            auditId: 99,
            sourceCount: 6,
            proposedRanges: [
              { dimensionKey: "saas", label: "SaaS",
                valueLow: 4, valueMid: 7, valueHigh: 14 },
              { dimensionKey: "marketplace", label: "Marketplace",
                valueLow: 2, valueMid: 4, valueHigh: 8 },
            ],
          },
        },
      );

      expect(statusCode).toBe(200);
      expect(body).toEqual({ ok: true });
      expect(mockedStorage.upsertExitMultiple).toHaveBeenCalledTimes(2);
      expect(mockedStorage.upsertCapitalRaiseBenchmark).not.toHaveBeenCalled();

      // Default unit for exit_multiples should be "x_revenue"
      expect(mockedStorage.upsertExitMultiple).toHaveBeenCalledWith(
        expect.objectContaining({
          dimensionKey: "saas",
          unit: "x_revenue",
          valueMid: 7,
          sourceCount: 6,
          lastRefreshedAt: expect.any(Date),
        }),
      );
      expect(mockedStorage.finalizeAnalystRefreshAuditLog).toHaveBeenCalledWith(
        99, expect.objectContaining({ status: "success" }),
      );
    });

    it("rejects unknown table id with 400", async () => {
      const { statusCode } = await invoke(
        handlers, "POST", "/api/admin/analyst-tables/:id/commit",
        { params: { id: "drop_users" }, body: { proposedRanges: [] } },
      );
      expect(statusCode).toBe(400);
      expect(mockedStorage.upsertExitMultiple).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/admin/analyst-tables/exit_multiples/reseed-accounts", () => {
    it("re-upserts each existing exit_multiples row with a fresh lastRefreshedAt", async () => {
      mockedStorage.getExitMultiples.mockResolvedValue([
        { dimensionKey: "saas", label: "SaaS", unit: "x_revenue",
          valueLow: 3, valueMid: 6, valueHigh: 12, sourceCount: 4 },
        { dimensionKey: "marketplace", label: "Marketplace", unit: "x_revenue",
          valueLow: 1.5, valueMid: 3, valueHigh: 6, sourceCount: 4 },
      ]);
      mockedStorage.upsertExitMultiple.mockResolvedValue({});

      const { statusCode, body } = await invoke(
        handlers, "POST", "/api/admin/analyst-tables/:id/reseed-accounts",
        { params: { id: "exit_multiples" } },
      );

      expect(statusCode).toBe(200);
      expect(body).toEqual({ ok: true, rowsReseeded: 2 });
      expect(mockedStorage.upsertExitMultiple).toHaveBeenCalledTimes(2);
      expect(mockedStorage.upsertCapitalRaiseBenchmark).not.toHaveBeenCalled();
      expect(mockedStorage.getCapitalRaiseBenchmarks).not.toHaveBeenCalled();
      // Every payload has a fresh lastRefreshedAt
      for (const call of mockedStorage.upsertExitMultiple.mock.calls) {
        expect(call[0].lastRefreshedAt).toBeInstanceOf(Date);
      }
    });
  });
});

// ── Storage-layer tests for upsertExitMultiple insert + update paths ────────
const dbState: { existing: unknown[] } = { existing: [] };
const insertValues = vi.fn();
const updateSet = vi.fn();

vi.mock("../../server/db", () => {
  const limit = vi.fn(() => Promise.resolve(dbState.existing));
  const where = vi.fn(() => ({ limit, returning: () => Promise.resolve(dbState.existing) }));
  const set = vi.fn((data: unknown) => {
    updateSet(data);
    return { where: () => ({ returning: () => Promise.resolve([{ id: 7, ...(data as object) }]) }) };
  });
  const from = vi.fn(() => ({ where, orderBy: () => Promise.resolve(dbState.existing) }));
  const values = vi.fn((data: unknown) => {
    insertValues(data);
    return { returning: () => Promise.resolve([{ id: 99, ...(data as object) }]) };
  });
  return {
    db: {
      select: vi.fn(() => ({ from })),
      insert: vi.fn(() => ({ values })),
      update: vi.fn(() => ({ set })),
    },
    pool: {},
    withRetry: async <T,>(fn: () => Promise<T>) => fn(),
  };
});

describe("IntelligenceV2Storage.upsertExitMultiple", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbState.existing = [];
  });

  it("INSERT path: when no row matches dimensionKey, inserts a new row", async () => {
    const { IntelligenceV2Storage } = await import("../../server/storage/intelligence-v2");
    const repo = new IntelligenceV2Storage();
    const result = await repo.upsertExitMultiple({
      dimensionKey: "saas",
      label: "SaaS",
      unit: "x_revenue",
      valueLow: 3,
      valueMid: 6,
      valueHigh: 12,
      sourceCount: 4,
      lastRefreshedAt: new Date("2026-04-01T00:00:00Z"),
    } as any);

    expect(insertValues).toHaveBeenCalledTimes(1);
    expect(updateSet).not.toHaveBeenCalled();
    expect(insertValues.mock.calls[0][0]).toMatchObject({
      dimensionKey: "saas",
      valueMid: 6,
    });
    expect((result as any).id).toBe(99);
  });

  it("UPDATE path: when a row exists for dimensionKey, updates and stamps updatedAt", async () => {
    dbState.existing = [{ id: 7, dimensionKey: "saas" }];
    const { IntelligenceV2Storage } = await import("../../server/storage/intelligence-v2");
    const repo = new IntelligenceV2Storage();

    const result = await repo.upsertExitMultiple({
      dimensionKey: "saas",
      label: "SaaS",
      unit: "x_revenue",
      valueLow: 4,
      valueMid: 8,
      valueHigh: 16,
      sourceCount: 6,
      lastRefreshedAt: new Date("2026-04-15T00:00:00Z"),
    } as any);

    expect(updateSet).toHaveBeenCalledTimes(1);
    expect(insertValues).not.toHaveBeenCalled();
    const setPayload = updateSet.mock.calls[0][0] as Record<string, unknown>;
    expect(setPayload.dimensionKey).toBe("saas");
    expect(setPayload.valueMid).toBe(8);
    expect(setPayload.updatedAt).toBeInstanceOf(Date);
    expect((result as any).id).toBe(7);
  });
});
