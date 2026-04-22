/**
 * Phase 4 (Constants doctrine) — runtime tests for the new Refresh
 * (preview) + Apply-Proposal endpoints and the per-row research-history
 * endpoint.
 *
 * Locks the user-facing Phase 4 contract:
 *   1. POST /api/admin/model-constants/:key/refresh runs the Specialist
 *      and returns the proposal **without writing the override**. This
 *      lets the admin see the Previous/New diff before deciding.
 *   2. POST /api/admin/model-constants/:key/apply-proposal accepts ONLY
 *      a `researchRunId` in the body — never a value, never an authority
 *      string. The route loads the persisted research run and writes
 *      the override with `source = 'analyst'`. This guarantees the admin
 *      cannot inject a value into the Constants table.
 *   3. /apply-proposal rejects research runs that don't belong to the
 *      requested (key, country, subdivision) tuple — protects against
 *      replay-attacks across rows.
 *   4. /refresh on an unknown key → 404 with no storage write.
 *   5. /refresh validates locality (e.g. universal constant cannot
 *      be passed a country) and returns 400 without calling the proposer.
 *   6. GET /api/admin/model-constants/:key/research-history returns the
 *      runs from storage.getResearchRunsForConstant scoped by locality.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import request from "supertest";

const sampleRun = {
  id: 555,
  startedAt: new Date("2026-04-22T00:00:00Z"),
  completedAt: new Date("2026-04-22T00:00:05Z"),
  status: "completed",
  durationMs: 5000,
  metadata: {
    specialistId: "constants.tax-research",
    specialistLetter: "H",
    constant: { key: "taxRate", country: "United States", subdivision: "California" },
    proposal: {
      value: 0.30,
      authority: "California FTB",
      referenceUrl: "https://example.test/ftb",
      reasoning: "Statutory rate as of 2026.",
      isDifferentFromCurrent: true,
    },
    sources: [{ title: "FTB Notice", url: "https://example.test/ftb-notice" }],
  },
};

vi.mock("../../server/storage", () => ({
  storage: {
    upsertModelConstantOverride: vi.fn(async (args: Record<string, unknown>) => ({
      id: 7,
      ...args,
      createdAt: new Date("2026-04-22T00:00:00Z").toISOString(),
    })),
    deleteModelConstantOverride: vi.fn(async () => undefined),
    listModelConstantOverrides: vi.fn(async () => []),
    getRefreshCadenceOverrides: vi.fn(async () => new Map<string, number>()),
    listCanonicals: vi.fn(async () => []),
    getResearchRunsForConstant: vi.fn(async () => [sampleRun]),
    getLatestSuccessfulRunForConstant: vi.fn(async () => null),
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

describe("POST /:key/refresh — Phase 4 preview-only Specialist research", () => {
  let app: Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  it("returns the proposal WITHOUT writing the override (preview semantics)", async () => {
    const res = await request(app)
      .post("/api/admin/model-constants/taxRate/refresh?country=United%20States&subdivision=California")
      .send();

    expect(res.status).toBe(200);
    expect(proposeConstantRegeneration).toHaveBeenCalledTimes(1);
    expect(storage.upsertModelConstantOverride).not.toHaveBeenCalled();

    expect(res.body.proposal.value).toBe(0.30);
    expect(res.body.proposal.authority).toBe("California FTB");
    expect(res.body.proposal.researchRunId).toBe(555);
    expect(res.body.proposal.isDifferentFromCurrent).toBe(true);
  });

  it("returns 404 for unknown keys without calling the proposer", async () => {
    const res = await request(app)
      .post("/api/admin/model-constants/not-a-real-key/refresh")
      .send();
    expect(res.status).toBe(404);
    expect(proposeConstantRegeneration).not.toHaveBeenCalled();
  });

  it("rejects an invalid locality (universal key with country) without calling the proposer", async () => {
    const res = await request(app)
      .post("/api/admin/model-constants/daysPerMonth/refresh?country=United%20States")
      .send();
    expect(res.status).toBe(400);
    expect(proposeConstantRegeneration).not.toHaveBeenCalled();
  });
});

describe("POST /:key/apply-proposal — Phase 4 admin-cannot-inject-value contract", () => {
  let app: Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  it("loads the persisted research_run and writes source='analyst' with the run's value", async () => {
    const res = await request(app)
      .post("/api/admin/model-constants/taxRate/apply-proposal?country=United%20States&subdivision=California")
      .send({ researchRunId: 555 });

    expect(res.status).toBe(200);
    expect(storage.getResearchRunsForConstant).toHaveBeenCalledWith(
      "taxRate", "United States", "California", 25,
    );
    expect(storage.upsertModelConstantOverride).toHaveBeenCalledTimes(1);
    expect(storage.upsertModelConstantOverride).toHaveBeenCalledWith(
      expect.objectContaining({
        constantKey: "taxRate",
        country: "United States",
        countrySubdivision: "California",
        // Crucial: value comes from the persisted Specialist run, not
        // from the request body. Doctrine guarantee.
        value: 0.30,
        source: "analyst",
        authority: "California FTB",
        researchRunId: 555,
      }),
    );
    expect(res.body.appliedFromResearchRunId).toBe(555);
  });

  it("rejects an unknown researchRunId for this row with 404 (no replay across rows)", async () => {
    const res = await request(app)
      .post("/api/admin/model-constants/taxRate/apply-proposal?country=United%20States&subdivision=California")
      .send({ researchRunId: 9999 });

    expect(res.status).toBe(404);
    expect(storage.upsertModelConstantOverride).not.toHaveBeenCalled();
  });

  it("rejects body without researchRunId with 400", async () => {
    const res = await request(app)
      .post("/api/admin/model-constants/taxRate/apply-proposal?country=United%20States&subdivision=California")
      .send({});
    expect(res.status).toBe(400);
    expect(storage.upsertModelConstantOverride).not.toHaveBeenCalled();
  });

  it("ignores extra body fields like `value` (admin cannot inject a value)", async () => {
    const res = await request(app)
      .post("/api/admin/model-constants/taxRate/apply-proposal?country=United%20States&subdivision=California")
      .send({ researchRunId: 555, value: 0.99, authority: "EVIL" });

    expect(res.status).toBe(200);
    // Server still wrote 0.30 (the run's value), not 0.99.
    expect(storage.upsertModelConstantOverride).toHaveBeenCalledWith(
      expect.objectContaining({ value: 0.30, authority: "California FTB" }),
    );
  });
});

describe("GET /:key/research-history — Phase 4 history surface", () => {
  let app: Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  it("returns runs from storage scoped by (key, country, subdivision)", async () => {
    const res = await request(app)
      .get("/api/admin/model-constants/taxRate/research-history?country=United%20States&subdivision=California");

    expect(res.status).toBe(200);
    expect(storage.getResearchRunsForConstant).toHaveBeenCalledWith(
      "taxRate", "United States", "California", 10,
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

describe("GET /api/admin/model-constants — per-state Stale badge (Task #396)", () => {
  let app: Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  it("flags isStale on a per-state row when the latest research run is older than the cadence", async () => {
    // taxRate is country+state; cadence is 30 days. Make the latest
    // successful run for (US, California) 90 days old → must be stale.
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    (storage.getLatestSuccessfulRunForConstant as ReturnType<typeof vi.fn>).mockImplementation(
      async (key: string, country: string | null, sub: string | null) => {
        if (key === "taxRate" && country === "United States" && sub === "California") {
          return {
            id: 999,
            startedAt: ninetyDaysAgo,
            completedAt: ninetyDaysAgo,
            status: "completed",
            metadata: { proposal: { value: 0.30, authority: "California FTB" } },
          };
        }
        return null;
      },
    );

    const res = await request(app)
      .get("/api/admin/model-constants?country=United%20States&subdivision=California");

    expect(res.status).toBe(200);
    const taxRow = (res.body.items as { key: string; scope: { subdivision: string | null }; isStale: boolean }[])
      .find((r) => r.key === "taxRate");
    expect(taxRow).toBeDefined();
    expect(taxRow!.scope.subdivision).toBe("California");
    expect(taxRow!.isStale).toBe(true);
  });

  it("does NOT flag isStale on a per-state row whose latest run is fresh", async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    (storage.getLatestSuccessfulRunForConstant as ReturnType<typeof vi.fn>).mockImplementation(
      async (key: string, country: string | null, sub: string | null) => {
        if (key === "taxRate" && country === "United States" && sub === "California") {
          return {
            id: 1000,
            startedAt: yesterday,
            completedAt: yesterday,
            status: "completed",
            metadata: { proposal: { value: 0.30, authority: "California FTB" } },
          };
        }
        return null;
      },
    );

    const res = await request(app)
      .get("/api/admin/model-constants?country=United%20States&subdivision=California");

    expect(res.status).toBe(200);
    const taxRow = (res.body.items as { key: string; isStale: boolean }[])
      .find((r) => r.key === "taxRate");
    expect(taxRow!.isStale).toBe(false);
  });
});
