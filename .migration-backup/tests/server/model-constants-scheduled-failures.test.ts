/**
 * Tests for the GET /api/admin/model-constants/scheduled-failures route
 * and its companion POST .../dismiss endpoint that powers the Constants-tab
 * "since-last-visit" failure banner.
 *
 * Locks the contract:
 *   1. First visit (no prior page-visit row) → 30d lookback, returns
 *      whatever failures storage reports, AND records a fresh page-visit
 *      so the next call uses this load's timestamp as the boundary.
 *   2. Second visit → uses the timestamp from the previous visit as
 *      `since`. Failures older than that are filtered by storage; the
 *      route correctly forwards the right boundary date.
 *   3. POST /dismiss simply records a fresh visit so subsequent loads
 *      see no stale failures.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import request from "supertest";

const getPageVisit = vi.fn();
const recordVisit = vi.fn();
const getFailedScheduledRefreshes = vi.fn();

vi.mock("../../server/storage", () => ({
  storage: {
    upsertModelConstantOverride: vi.fn(),
    deleteModelConstantOverride: vi.fn(),
    listModelConstantOverrides: vi.fn(async () => []),
    listCanonicals: vi.fn(async () => []),
    getResearchRunsForConstant: vi.fn(async () => []),
    getLatestSuccessfulRunForConstant: vi.fn(async () => null),
    getPageVisit: (uid: number, k: string) => getPageVisit(uid, k),
    recordVisit: (uid: number, k: string) => recordVisit(uid, k),
    getFailedScheduledConstantsRefreshes: (since: Date, limit?: number) =>
      getFailedScheduledRefreshes(since, limit),
  },
}));

vi.mock("../../server/auth", () => ({
  requireAdmin: (req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: { id: number } }).user = { id: 42 };
    next();
  },
}));

vi.mock("../../server/routes/helpers", () => ({
  logActivity: vi.fn(),
  logAndSendError: (res: Response, msg: string, err: unknown) => {
    res.status(500).json({ error: msg, detail: String(err) });
  },
}));

vi.mock("../../server/ai/regenerate-constants", () => ({
  proposeConstantRegeneration: vi.fn(),
}));

vi.mock("../../server/logger", () => ({
  log: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { registerModelConstantsRoutes } from "../../server/routes/admin/model-constants";

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  registerModelConstantsRoutes(app);
  return app;
}

beforeEach(() => {
  getPageVisit.mockReset();
  recordVisit.mockReset();
  getFailedScheduledRefreshes.mockReset();
  recordVisit.mockResolvedValue({ lastVisitedAt: new Date() });
});

describe("GET /api/admin/model-constants/scheduled-failures", () => {
  it("first visit (no prior page-visit) → 30d lookback and records a fresh visit", async () => {
    getPageVisit.mockResolvedValue(null);
    getFailedScheduledRefreshes.mockResolvedValue([
      {
        id: 1,
        completedAt: new Date(),
        error: "boom",
        metadata: { scheduledRefresh: true, constant: { key: "taxRate", country: null, subdivision: null } },
      },
    ]);
    const app = buildApp();
    const res = await request(app).get("/api/admin/model-constants/scheduled-failures");
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.failures[0].key).toBe("taxRate");

    // Storage was called with a date roughly 30d in the past.
    const [sinceArg] = getFailedScheduledRefreshes.mock.calls[0];
    const ageMs = Date.now() - new Date(sinceArg).getTime();
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    // Within ±1d of 30d ago — locks the lookback intent without coupling to the exact ms.
    expect(ageMs).toBeGreaterThan(THIRTY_DAYS_MS - 24 * 60 * 60 * 1000);
    expect(ageMs).toBeLessThan(THIRTY_DAYS_MS + 24 * 60 * 60 * 1000);

    // Visit is recorded so the next call sees this load's timestamp as `since`.
    expect(recordVisit).toHaveBeenCalledWith(42, "admin-constants-failures");
  });

  it("subsequent visit uses the prior visit timestamp as the `since` boundary", async () => {
    const lastVisit = new Date("2026-04-21T12:00:00Z");
    getPageVisit.mockResolvedValue({ lastVisitedAt: lastVisit });
    getFailedScheduledRefreshes.mockResolvedValue([]);

    const app = buildApp();
    const res = await request(app).get("/api/admin/model-constants/scheduled-failures");
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
    expect(res.body.lastVisitedAt).toBe(lastVisit.toISOString());

    const [sinceArg] = getFailedScheduledRefreshes.mock.calls[0];
    expect(new Date(sinceArg).toISOString()).toBe(lastVisit.toISOString());

    // And the visit is refreshed for next time.
    expect(recordVisit).toHaveBeenCalledWith(42, "admin-constants-failures");
  });
});

describe("POST /api/admin/model-constants/scheduled-failures/dismiss", () => {
  it("records a fresh page-visit and returns the dismissal timestamp", async () => {
    const now = new Date("2026-04-22T17:00:00Z");
    recordVisit.mockResolvedValue({ lastVisitedAt: now });

    const app = buildApp();
    const res = await request(app).post("/api/admin/model-constants/scheduled-failures/dismiss");
    expect(res.status).toBe(200);
    expect(recordVisit).toHaveBeenCalledWith(42, "admin-constants-failures");
    expect(new Date(res.body.dismissedAt).toISOString()).toBe(now.toISOString());
  });
});
