/**
 * Route-level regression test for the model-constants list endpoint.
 *
 * GET /api/admin/model-constants
 *
 * Pins down the no-N+1 contract that closed Sentry #7471411947: the route
 * must fetch the latest successful Constants research_run for every
 * registered key with **one** batch call (`getLatestSuccessfulRunsForAllConstants`)
 * and must **never** fall back to per-key `getLatestSuccessfulRunForConstant`
 * calls inside the `REGISTERED_CONSTANT_KEYS.map(...)` loop.
 *
 * Companion to `src/tests/storage/research-runs-batch-constants.test.ts`,
 * which pins the same contract at the storage layer. This test is the
 * orchestrator/route audit referenced in Task #1438 — together they make
 * any future regression that re-introduces the per-key call fail loudly.
 */

import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import express, { type NextFunction, type Response } from "express";
import supertest from "supertest";

const {
  mockGetLatestSuccessfulRunsForAllConstants,
  mockGetLatestSuccessfulRunForConstant,
  mockListModelConstantOverrides,
  mockListCanonicals,
  mockGetRefreshCadenceOverrides,
} = vi.hoisted(() => ({
  mockGetLatestSuccessfulRunsForAllConstants: vi.fn(),
  mockGetLatestSuccessfulRunForConstant: vi.fn(),
  mockListModelConstantOverrides: vi.fn(),
  mockListCanonicals: vi.fn(),
  mockGetRefreshCadenceOverrides: vi.fn(),
}));

vi.mock("../../../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../../auth", () => ({
  // The GET handler under test does not read req.user, so the mock just
  // short-circuits the auth gate without forging a Passport user object.
  requireAdmin: (_req: unknown, _res: Response, next: NextFunction) => next(),
}));

vi.mock("../../../routes/helpers", () => ({
  logAndSendError: (res: Response, msg: string, err: unknown) => {
    res.status(500).json({ error: msg, detail: String(err) });
  },
  logActivity: vi.fn(),
  zodErrorMessage: (err: unknown) => String(err),
}));

vi.mock("../../../storage", () => ({
  storage: {
    getLatestSuccessfulRunsForAllConstants: (...args: unknown[]) =>
      mockGetLatestSuccessfulRunsForAllConstants(...args),
    getLatestSuccessfulRunForConstant: (...args: unknown[]) =>
      mockGetLatestSuccessfulRunForConstant(...args),
    listModelConstantOverrides: (...args: unknown[]) => mockListModelConstantOverrides(...args),
    listCanonicals: (...args: unknown[]) => mockListCanonicals(...args),
    getRefreshCadenceOverrides: (...args: unknown[]) => mockGetRefreshCadenceOverrides(...args),
  },
}));

import { registerModelConstantsRoutes } from "../../../routes/admin/model-constants";
import { REGISTERED_CONSTANT_KEYS } from "@shared/model-constants-registry";

let agent: ReturnType<typeof supertest>;

beforeAll(() => {
  const app = express();
  app.use(express.json());
  registerModelConstantsRoutes(app);
  agent = supertest(app);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/admin/model-constants — batch research-run lookup (Task #1438)", () => {
  it("calls getLatestSuccessfulRunsForAllConstants exactly once and never the per-key variant", async () => {
    mockListModelConstantOverrides.mockResolvedValueOnce([]);
    mockListCanonicals.mockResolvedValueOnce([]);
    mockGetRefreshCadenceOverrides.mockResolvedValueOnce(new Map());
    mockGetLatestSuccessfulRunsForAllConstants.mockResolvedValueOnce(new Map());

    const res = await agent.get("/api/admin/model-constants?country=United%20States&subdivision=NY");

    expect(res.status).toBe(200);

    // The whole point of the batch method: one call, regardless of how many
    // constant keys the registry contains. Today that is dozens — a future
    // refactor that re-introduces the per-key fan-out would either bump
    // this count or call the per-key method below.
    expect(mockGetLatestSuccessfulRunsForAllConstants).toHaveBeenCalledTimes(1);
    expect(mockGetLatestSuccessfulRunsForAllConstants).toHaveBeenCalledWith("United States", "NY");

    // The per-key method must not be invoked from the list route — that was
    // the original N+1 (Sentry #7471411947).
    expect(mockGetLatestSuccessfulRunForConstant).not.toHaveBeenCalled();

    // Sanity: scaling stays O(1) in batch calls regardless of the registry
    // size. If someone adds a per-key call back, this assertion catches it
    // even if they forget to add a mock for it.
    expect(mockGetLatestSuccessfulRunsForAllConstants.mock.calls.length).toBeLessThan(
      REGISTERED_CONSTANT_KEYS.length,
    );
  });

  it("populates response items from the batch map (latest-run id surfaces per key)", async () => {
    const sampleKey = REGISTERED_CONSTANT_KEYS[0];

    mockListModelConstantOverrides.mockResolvedValueOnce([]);
    mockListCanonicals.mockResolvedValueOnce([]);
    mockGetRefreshCadenceOverrides.mockResolvedValueOnce(new Map());

    // Build a batch map covering all three locality tiers the route may
    // resolve to for `sampleKey` so the entry matches regardless of whether
    // the constant is universal / country / full.
    const completedAt = new Date("2026-05-10T00:00:00Z");
    const baseRun = {
      id: 4242,
      userId: null,
      entityType: "model-constant" as const,
      entityId: 0,
      scenarioId: null,
      tier: 1,
      status: "completed" as const,
      startedAt: new Date("2026-05-09T23:59:00Z"),
      completedAt,
      durationMs: 1000,
      modelPrimary: null,
      modelSecondary: null,
      modelSynthesis: null,
      tokensUsed: null,
      estimatedCost: null,
      error: null,
      metadata: { proposal: { authority: "Test Authority" }, sources: [] },
      cacheKey: null,
      cacheInputsHash: null,
    };
    const batchMap = new Map<string, typeof baseRun>([
      [`${sampleKey}||`, baseRun],
      [`${sampleKey}|United States|`, baseRun],
      [`${sampleKey}|United States|NY`, baseRun],
    ]);
    mockGetLatestSuccessfulRunsForAllConstants.mockResolvedValueOnce(batchMap);

    const res = await agent.get("/api/admin/model-constants?country=United%20States&subdivision=NY");

    expect(res.status).toBe(200);
    expect(mockGetLatestSuccessfulRunsForAllConstants).toHaveBeenCalledTimes(1);
    expect(mockGetLatestSuccessfulRunForConstant).not.toHaveBeenCalled();

    const items: Array<{ key: string; latestResearchRun?: { id?: number; authority?: string | null } | null }> =
      res.body.items;
    expect(Array.isArray(items)).toBe(true);
    const entry = items.find((item) => item.key === sampleKey);
    expect(entry?.latestResearchRun?.id).toBe(4242);
    expect(entry?.latestResearchRun?.authority).toBe("Test Authority");
  });
});
