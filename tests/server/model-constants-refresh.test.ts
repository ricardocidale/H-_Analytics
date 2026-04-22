/**
 * Phase 4 (Constants doctrine) — runtime tests for the new one-shot
 * Refresh Research endpoint and the per-row research-history endpoint.
 *
 * Locks the user-facing Phase 4 contract:
 *   1. POST /api/admin/model-constants/:key/refresh runs the Specialist
 *      AND auto-applies the verdict in a single call (the admin never
 *      types or approves a value).
 *      → 200 with `proposal` payload
 *      → storage.upsertModelConstantOverride is called with
 *        source = "analyst" and the proposal's researchRunId.
 *      → no separate /apply-research call is required.
 *   2. POST /refresh on an unknown key → 404 with no storage write.
 *   3. POST /refresh validates locality (e.g. universal constant cannot
 *      be passed a country) and returns 400 without calling the proposer.
 *   4. GET /api/admin/model-constants/:key/research-history returns the
 *      runs from storage.getResearchRunsForConstant scoped by locality.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import request from "supertest";

vi.mock("../../server/storage", () => ({
  storage: {
    upsertModelConstantOverride: vi.fn(async (args: Record<string, unknown>) => ({
      id: 7,
      ...args,
      createdAt: new Date("2026-04-22T00:00:00Z").toISOString(),
    })),
    deleteModelConstantOverride: vi.fn(async () => undefined),
    listModelConstantOverrides: vi.fn(async () => []),
    listCanonicals: vi.fn(async () => []),
    getResearchRunsForConstant: vi.fn(async () => [
      {
        id: 101,
        startedAt: new Date("2026-04-20T10:00:00Z"),
        completedAt: new Date("2026-04-20T10:00:05Z"),
        status: "completed",
        durationMs: 5000,
        metadata: {
          specialistId: "constants.tax-research",
          specialistLetter: "H",
          proposal: { value: 0.21, authority: "IRS", isDifferentFromCurrent: false },
          sources: [{ title: "IRS Pub 542", url: "https://example.test/irs" }],
        },
      },
    ]),
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
  proposeConstantRegeneration: vi.fn(async (args: { key: string; country: string | null; subdivision: string | null }) => ({
    key: args.key,
    label: "Income tax rate",
    country: args.country,
    subdivision: args.subdivision,
    value: 0.30,
    authority: "California FTB",
    referenceUrl: "https://example.test/ftb",
    reasoning: "Statutory rate as of 2026.",
    sources: [{ title: "FTB Notice", url: "https://example.test/ftb-notice" }],
    factoryValue: 0.21,
    currentValue: 0.21,
    isDifferentFromCurrent: true,
    researchRunId: 555,
    specialistId: "constants.tax-research",
  })),
}));

vi.mock("../../server/logger", () => ({
  log: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { registerModelConstantsRoutes } from "../../server/routes/admin/model-constants";
import { storage } from "../../server/storage";
import { proposeConstantRegeneration } from "../../server/ai/regenerate-constants";

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  registerModelConstantsRoutes(app);
  return app;
}

describe("POST /api/admin/model-constants/:key/refresh — Phase 4 one-shot flow", () => {
  let app: Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  it("runs the Specialist and auto-applies the verdict in a single call", async () => {
    const res = await request(app)
      .post("/api/admin/model-constants/taxRate/refresh?country=United%20States&subdivision=California")
      .send();

    expect(res.status).toBe(200);
    expect(proposeConstantRegeneration).toHaveBeenCalledTimes(1);
    expect(proposeConstantRegeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "taxRate",
        country: "United States",
        subdivision: "California",
      }),
    );

    expect(storage.upsertModelConstantOverride).toHaveBeenCalledTimes(1);
    expect(storage.upsertModelConstantOverride).toHaveBeenCalledWith(
      expect.objectContaining({
        constantKey: "taxRate",
        country: "United States",
        countrySubdivision: "California",
        value: 0.30,
        source: "analyst",
        authority: "California FTB",
        researchRunId: 555,
      }),
    );

    expect(res.body.proposal.value).toBe(0.30);
    expect(res.body.proposal.authority).toBe("California FTB");
    expect(res.body.proposal.isDifferentFromCurrent).toBe(true);
    expect(res.body.wasNoChange).toBe(false);
  });

  it("returns 404 for unknown keys without calling the proposer", async () => {
    const res = await request(app)
      .post("/api/admin/model-constants/not-a-real-key/refresh")
      .send();
    expect(res.status).toBe(404);
    expect(proposeConstantRegeneration).not.toHaveBeenCalled();
    expect(storage.upsertModelConstantOverride).not.toHaveBeenCalled();
  });

  it("rejects an invalid locality (universal key with country) without calling the proposer", async () => {
    const res = await request(app)
      .post("/api/admin/model-constants/daysPerMonth/refresh?country=United%20States")
      .send();
    expect(res.status).toBe(400);
    expect(proposeConstantRegeneration).not.toHaveBeenCalled();
    expect(storage.upsertModelConstantOverride).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/model-constants/:key/research-history — Phase 4 history surface", () => {
  let app: Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  it("returns runs from storage scoped by (key, country, subdivision)", async () => {
    const res = await request(app)
      .get("/api/admin/model-constants/taxRate/research-history?country=United%20States&subdivision=California");

    expect(res.status).toBe(200);
    expect(storage.getResearchRunsForConstant).toHaveBeenCalledTimes(1);
    expect(storage.getResearchRunsForConstant).toHaveBeenCalledWith(
      "taxRate",
      "United States",
      "California",
      10,
    );
    expect(res.body.runs).toHaveLength(1);
    expect(res.body.runs[0].metadata.specialistLetter).toBe("H");
  });

  it("returns 404 for unknown keys without hitting storage", async () => {
    const res = await request(app).get("/api/admin/model-constants/not-a-real-key/research-history");
    expect(res.status).toBe(404);
    expect(storage.getResearchRunsForConstant).not.toHaveBeenCalled();
  });
});
