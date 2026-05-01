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
    getUserById: vi.fn(),
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
    // The /run-watchdog endpoint composes csrfTokenGuard directly; stub
    // it pass-through here so we can exercise the watchdog handler in
    // isolation. The CSRF contract itself is covered by the dedicated
    // analyst-refresh-guards.test.ts.
    csrfTokenGuard: (_req: Request, _res: Response, next: NextFunction) => next(),
    releaseInFlight: vi.fn(),
  };
});

vi.mock("../../server/ai/analyst-table-refresh", () => ({
  researchCapitalRaiseBenchmarks: vi.fn(),
  researchExitMultiples: vi.fn(),
}));

// The /run-watchdog endpoint delegates the actual scheduled-cycle work
// to `runCapitalRaiseWatchdogCycle`. We mock it here so the route tests
// don't pull in the real LLM / storage stack — `capital-raise-watchdog-cycle.test.ts`
// already covers the cycle's own behavior.
vi.mock("../../server/ai/ambient/capital-raise-watchdog", () => ({
  runCapitalRaiseWatchdogCycle: vi.fn(),
}));

// Phase 3 (#453) added a `narrateSpecialistHandoff(...)` call in the
// /refresh handler. The handler must tolerate failures from that helper
// (it reads from storage, which can transient-fail) without downgrading
// a successful refresh — already finalized in the audit row — into a
// 500 that the client can't recover from. We deliberately leave
// `narrateSpecialistHandoff` UNMOCKED so the assertion below double-
// duties as a guard against regressing the resilience behavior. Without
// the storage surface it depends on, the helper will throw, and the
// handler's try/catch around it must keep the response at 200.

vi.mock("../../server/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { storage } from "../../server/storage";
import {
  registerAdminAnalystTableRoutes,
  clearWatchdogRateState,
} from "../../server/routes/admin/analyst-tables";
import {
  researchCapitalRaiseBenchmarks,
  researchExitMultiples,
} from "../../server/ai/analyst-table-refresh";
import { runCapitalRaiseWatchdogCycle } from "../../server/ai/ambient/capital-raise-watchdog";

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
): Promise<{ statusCode: number; body: unknown; headers: Record<string, string> }> {
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
  const res: any = {
    locals: {},
    statusCode: 200,
    body: undefined,
    headersSent: false,
    headers: {} as Record<string, string>,
  };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (data: unknown) => { res.body = data; res.headersSent = true; return res; };
  res.setHeader = (name: string, value: string) => { res.headers[name] = value; return res; };
  res.getHeader = (name: string) => res.headers[name];
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
  return { statusCode: res.statusCode, body: res.body, headers: res.headers };
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
      expect(exits.lastRefreshSource).toBeNull();
      expect(exits.recentRefreshes).toEqual([]);
    });

    // Task #358 — the watchdog ingest path tags audit rows with
    // userAgent="capital-raise-watchdog" and adminId=null. Manual admin
    // refreshes carry an adminId we must resolve back to a display name.
    // Both must surface on the table card and in the recent-refresh list
    // so admins can tell at a glance who/what last touched the ranges.
    it("labels the most-recent successful refresh and the recent-refresh history by source", async () => {
      const watchdogStartedAt = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2h ago
      const adminStartedAt = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1h ago
      const pendingStartedAt = new Date(Date.now() - 60 * 1000); // 1min ago

      mockedStorage.getAnalystRefreshSettings.mockResolvedValue({
        globalCadenceDays: 30, lastSuspiciousAlertAt: null,
      });
      mockedStorage.getCapitalRaiseBenchmarkSummary.mockResolvedValue({
        rows: [], sourceCount: 0, lastRefreshedAt: adminStartedAt,
      });
      mockedStorage.getExitMultiplesSummary.mockResolvedValue({
        rows: [], sourceCount: 0, lastRefreshedAt: null,
      });
      // Recent rows are returned newest-first by the storage layer.
      mockedStorage.getRecentAnalystRefreshAuditLogs.mockImplementation(
        async ({ tableId }: { tableId?: string }) => {
          if (tableId !== "capital_raise_benchmarks") return [];
          return [
            { id: 30, tableId, adminId: 7, userAgent: "Mozilla/5.0",
              status: "pending", startedAt: pendingStartedAt, finishedAt: null,
              tokensUsed: null },
            { id: 20, tableId, adminId: 7, userAgent: "Mozilla/5.0",
              status: "success", startedAt: adminStartedAt, finishedAt: adminStartedAt,
              tokensUsed: 999 },
            { id: 10, tableId, adminId: null, userAgent: "capital-raise-watchdog",
              status: "success", startedAt: watchdogStartedAt, finishedAt: watchdogStartedAt,
              tokensUsed: 0 },
          ];
        },
      );
      mockedStorage.getUserById.mockImplementation(async (id: number) => {
        if (id === 7) return { id: 7, firstName: "Avery", lastName: "Lee", email: "avery@h.example" };
        return undefined;
      });

      const { body } = await invoke(handlers, "GET", "/api/admin/analyst-tables");
      const capital = (body as any).tables.find((t: any) => t.id === "capital_raise_benchmarks");

      // The most-recent SUCCESS row (admin Avery Lee) is what's currently
      // live, even though a newer "pending" row exists above it.
      expect(capital.lastRefreshSource).toEqual({
        kind: "admin",
        adminId: 7,
        adminName: "Avery Lee",
        label: "Admin Avery Lee",
      });
      // tokens-used should also come from the latest finalized success.
      expect(capital.tokensUsedLastRefresh).toBe(999);

      // History list keeps original ordering and labels each row.
      expect(capital.recentRefreshes).toHaveLength(3);
      expect(capital.recentRefreshes[0].source.label).toBe("Admin Avery Lee");
      expect(capital.recentRefreshes[0].status).toBe("pending");
      expect(capital.recentRefreshes[1].source.label).toBe("Admin Avery Lee");
      expect(capital.recentRefreshes[1].status).toBe("success");
      expect(capital.recentRefreshes[2].source).toEqual({
        kind: "watchdog",
        label: "Watchdog",
      });
      expect(capital.recentRefreshes[2].status).toBe("success");
    });

    it("falls back to email then admin id when the user has no first/last name", async () => {
      const startedAt = new Date(Date.now() - 60 * 1000);
      mockedStorage.getAnalystRefreshSettings.mockResolvedValue({
        globalCadenceDays: 30, lastSuspiciousAlertAt: null,
      });
      mockedStorage.getCapitalRaiseBenchmarkSummary.mockResolvedValue({
        rows: [], sourceCount: 0, lastRefreshedAt: startedAt,
      });
      mockedStorage.getExitMultiplesSummary.mockResolvedValue({
        rows: [], sourceCount: 0, lastRefreshedAt: null,
      });
      mockedStorage.getRecentAnalystRefreshAuditLogs.mockImplementation(
        async ({ tableId }: { tableId?: string }) => {
          if (tableId !== "capital_raise_benchmarks") return [];
          return [
            { id: 1, tableId, adminId: 9, userAgent: "Mozilla/5.0",
              status: "success", startedAt, finishedAt: startedAt, tokensUsed: 1 },
            { id: 2, tableId, adminId: 11, userAgent: "Mozilla/5.0",
              status: "success", startedAt, finishedAt: startedAt, tokensUsed: 1 },
          ];
        },
      );
      mockedStorage.getUserById.mockImplementation(async (id: number) => {
        if (id === 9) return { id: 9, firstName: null, lastName: null, email: "noname@h.example" };
        return undefined; // 11 is a deleted admin
      });

      const { body } = await invoke(handlers, "GET", "/api/admin/analyst-tables");
      const capital = (body as any).tables.find((t: any) => t.id === "capital_raise_benchmarks");
      expect(capital.lastRefreshSource).toEqual({
        kind: "admin",
        adminId: 9,
        adminName: "noname@h.example",
        label: "Admin noname@h.example",
      });
      // The deleted admin (id=11) falls back to a synthetic placeholder.
      // Label drops the redundant "Admin " prefix so we don't render
      // "Admin Admin #11" — just "Admin #11".
      const deletedRow = capital.recentRefreshes.find((r: any) => r.id === 2);
      expect(deletedRow.source).toEqual({
        kind: "admin",
        adminId: 11,
        adminName: "Admin #11",
        label: "Admin #11",
      });
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

  describe("POST /api/admin/analyst-tables/:id/run-watchdog (Task #567)", () => {
    const mockedRunWatchdog = runCapitalRaiseWatchdogCycle as unknown as ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockedRunWatchdog.mockReset();
      // Reset the module-level rate-limit cooldown between tests so a 429
      // from one test doesn't bleed into the next.
      clearWatchdogRateState();
    });

    it("calls runCapitalRaiseWatchdogCycle({ force: true }) and returns audit + applied/skipped", async () => {
      mockedRunWatchdog.mockResolvedValue({
        ran: true,
        reason: "applied",
        result: {
          tableId: "capital_raise_benchmarks",
          auditId: 7777,
          appliedDimensions: ["valuationCap", "discountRate"],
          skippedDimensions: ["unknownThing"],
          recordedAt: new Date("2026-04-25T00:00:00Z"),
        },
        sourceCount: 4,
        tokensUsed: 12345,
      });

      const { statusCode, body } = await invoke(
        handlers, "POST", "/api/admin/analyst-tables/:id/run-watchdog",
        { params: { id: "capital_raise_benchmarks" } },
      );

      expect(statusCode).toBe(200);
      expect(mockedRunWatchdog).toHaveBeenCalledWith({ force: true });
      expect(body).toMatchObject({
        ran: true,
        reason: "applied",
        tableId: "capital_raise_benchmarks",
        auditId: 7777,
        appliedDimensions: ["valuationCap", "discountRate"],
        skippedDimensions: ["unknownThing"],
        sourceCount: 4,
        tokensUsed: 12345,
      });
      // Activity log written so admin actions remain audit-traceable.
      expect(mockedStorage.createActivityLog).toHaveBeenCalledTimes(1);
    });

    it("rejects exit_multiples with 400 (watchdog is capital-raise-only today)", async () => {
      const { statusCode, body } = await invoke(
        handlers, "POST", "/api/admin/analyst-tables/:id/run-watchdog",
        { params: { id: "exit_multiples" } },
      );
      expect(statusCode).toBe(400);
      expect((body as any).error).toMatch(/capital_raise_benchmarks/);
      expect(mockedRunWatchdog).not.toHaveBeenCalled();
    });

    it("rate-limits a second forced run from the same admin within 60 seconds (429)", async () => {
      mockedRunWatchdog.mockResolvedValue({
        ran: true,
        reason: "applied",
        result: {
          tableId: "capital_raise_benchmarks",
          auditId: 1,
          appliedDimensions: [],
          skippedDimensions: [],
          recordedAt: new Date(),
        },
        sourceCount: 3,
        tokensUsed: 10,
      });

      const first = await invoke(
        handlers, "POST", "/api/admin/analyst-tables/:id/run-watchdog",
        { params: { id: "capital_raise_benchmarks" } },
      );
      expect(first.statusCode).toBe(200);

      const second = await invoke(
        handlers, "POST", "/api/admin/analyst-tables/:id/run-watchdog",
        { params: { id: "capital_raise_benchmarks" } },
      );
      expect(second.statusCode).toBe(429);
      // Lock the 429 contract: Retry-After header (HTTP standard) + a
      // structured body with both `retryAfter` (canonical, used by the
      // admin UI) and `retryAfterSeconds` (legacy alias) + a friendly
      // human-readable `message` for the toast.
      const body = second.body as any;
      expect(body.error).toBe("RATE_LIMITED");
      expect(body.retryAfter).toBeGreaterThan(0);
      expect(body.retryAfterSeconds).toBe(body.retryAfter);
      expect(typeof body.message).toBe("string");
      expect(body.message).toMatch(/wait/i);
      expect(second.headers["Retry-After"]).toBe(String(body.retryAfter));
      // Watchdog cycle invoked exactly once — the rate-limited 2nd call
      // never reaches it.
      expect(mockedRunWatchdog).toHaveBeenCalledTimes(1);
    });

    it("propagates a 500 if the watchdog cycle throws", async () => {
      mockedRunWatchdog.mockRejectedValue(new Error("LLM offline"));
      const { statusCode } = await invoke(
        handlers, "POST", "/api/admin/analyst-tables/:id/run-watchdog",
        { params: { id: "capital_raise_benchmarks" } },
      );
      expect(statusCode).toBe(500);
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
