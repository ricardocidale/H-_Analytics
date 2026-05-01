/**
 * Phase 3 (Constants doctrine) — behavioral route tests.
 *
 * Companion to `model-constants-guard.test.ts` (which is static-analysis
 * only). This suite boots an Express app with mocked storage and auth
 * and exercises the real handlers over HTTP, locking the runtime
 * behavior the doctrine depends on:
 *
 *   1. PUT on a specialist-owned key → HTTP 422 with
 *      SPECIALIST_OWNED_CONSTANT, and storage.upsertModelConstantOverride
 *      is NOT called.
 *   2. PUT on a non-specialist-owned key → HTTP 200, storage IS called,
 *      and a deprecation warning is emitted via logger.warn.
 *   3. POST /apply-research on the same specialist-owned key → HTTP 200,
 *      storage IS called with source = "analyst" (the analyst writer
 *      keeps writing).
 *   4. DELETE on a specialist-owned key → HTTP 200, storage delete IS
 *      called (rollback escape hatch is preserved).
 *   5. PUT on an unknown key → HTTP 404 (the guard does not mask the
 *      unknown-key error).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import request from "supertest";

/**
 * Sample research_run that the apply-research handler will look up to
 * verify the body. Task #388 hardened the apply path to require a real
 * server-issued proposal — the storage mock returns this row for the
 * (taxRate, United States, California) tuple.
 */
const FIXTURE_RESEARCH_RUN_ID = 999;
const FIXTURE_PROPOSAL = {
  value: 0.30,
  authority: "California FTB",
  referenceUrl: "https://example.test/ftb",
  reasoning: "Statutory rate change",
};

vi.mock("../../server/storage", () => ({
  storage: {
    upsertModelConstantOverride: vi.fn(async (args: Record<string, unknown>) => ({
      id: 1,
      ...args,
      createdAt: new Date().toISOString(),
    })),
    deleteModelConstantOverride: vi.fn(async () => undefined),
    listModelConstantOverrides: vi.fn(async () => []),
    listCanonicals: vi.fn(async () => []),
    // The doctrine-correct apply path looks the run up directly by id
    // (Task #388); the mock returns the fixture row only for the
    // (taxRate, US, California) tuple that the test exercises.
    getResearchRunById: vi.fn(async (id: number) => {
      if (id !== FIXTURE_RESEARCH_RUN_ID) return undefined;
      return {
        id: FIXTURE_RESEARCH_RUN_ID,
        startedAt: new Date(),
        completedAt: new Date(),
        status: "completed",
        metadata: {
          specialistId: "constants.tax-research",
          constant: { key: "taxRate", country: "United States", subdivision: "California" },
          proposal: FIXTURE_PROPOSAL,
        },
      };
    }),
    // Sibling /apply-proposal still uses the constant-scoped helper.
    getResearchRunsForConstant: vi.fn(async (
      key: string,
      country: string | null,
      subdivision: string | null,
    ) => {
      if (key === "taxRate" && country === "United States" && subdivision === "California") {
        return [{
          id: FIXTURE_RESEARCH_RUN_ID,
          startedAt: new Date(),
          completedAt: new Date(),
          status: "completed",
          metadata: {
            specialistId: "constants.tax-research",
            constant: { key, country, subdivision },
            proposal: FIXTURE_PROPOSAL,
          },
        }];
      }
      return [];
    }),
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
  proposeConstantRegeneration: vi.fn(async () => ({
    proposed: { value: 0.21, authority: "IRS Pub. 542", referenceUrl: null, reasoning: "test" },
    current: { value: 0.21, source: "factory" },
    researchRunId: 999,
    specialistId: "constants.tax-research",
  })),
}));

vi.mock("../../server/logger", () => ({
  log: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { registerModelConstantsRoutes } from "../../server/routes/admin/model-constants";
import { storage } from "../../server/storage";
import { logger } from "../../server/logger";
import { MODEL_CONSTANTS_REGISTRY } from "../../shared/model-constants-registry";

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  registerModelConstantsRoutes(app);
  return app;
}

describe("PUT /api/admin/model-constants/:key — Phase 3 doctrine guard (runtime)", () => {
  let app: Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns HTTP 422 with SPECIALIST_OWNED_CONSTANT for a specialist-owned key", async () => {
    const res = await request(app)
      .put("/api/admin/model-constants/taxRate")
      .send({
        country: "United States",
        countrySubdivision: "California",
        value: 0.30,
        overrideNote: "manual attempt",
      });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("SPECIALIST_OWNED_CONSTANT");
    expect(res.body.error).toMatch(/authority-sourced/);
    expect(res.body.error).toMatch(/Refresh research/);
  });

  it("does not call storage.upsertModelConstantOverride when the guard rejects", async () => {
    await request(app)
      .put("/api/admin/model-constants/depreciationYears")
      .send({
        country: "United States",
        value: 39,
        overrideNote: "manual attempt",
      });

    expect(storage.upsertModelConstantOverride).not.toHaveBeenCalled();
  });

  it("rejects every currently-registered specialist-owned key", async () => {
    // Non-specialist-owned entries (e.g. operating-structure overlays from
    // Task #809, sourced from industry surveys rather than authority
    // publications) take the legacy manual-write path covered by the
    // separate `non-specialist-owned key (legacy path)` describe below.
    for (const key of Object.keys(MODEL_CONSTANTS_REGISTRY)) {
      const entry = MODEL_CONSTANTS_REGISTRY[key]!;
      if (entry.specialistOwned !== true) continue;
      const body: Record<string, unknown> = { value: 1, overrideNote: "blocked" };
      if (entry.locality !== "universal") body.country = "United States";
      if (entry.locality === "country+state") body.countrySubdivision = "California";

      const res = await request(app).put(`/api/admin/model-constants/${key}`).send(body);
      expect(res.status, `key '${key}' should be guarded`).toBe(422);
      expect(res.body.code).toBe("SPECIALIST_OWNED_CONSTANT");
    }
    expect(storage.upsertModelConstantOverride).not.toHaveBeenCalled();
  });

  it("returns HTTP 404 for unknown keys (guard does not mask the unknown-key error)", async () => {
    const res = await request(app)
      .put("/api/admin/model-constants/not-a-real-key")
      .send({ value: 1, overrideNote: "anything" });
    expect(res.status).toBe(404);
    expect(storage.upsertModelConstantOverride).not.toHaveBeenCalled();
  });
});

describe("PUT /api/admin/model-constants/:key — non-specialist-owned key (legacy path)", () => {
  let app: Express;
  const ownedKey = "taxRate";

  beforeEach(() => {
    vi.clearAllMocks();
    // Temporarily flip the registry flag so the legacy manual path is
    // exercised. Restored in afterEach to keep the doctrine default for
    // every other test in the file.
    MODEL_CONSTANTS_REGISTRY[ownedKey]!.specialistOwned = false;
    app = buildApp();
  });

  afterEach(() => {
    MODEL_CONSTANTS_REGISTRY[ownedKey]!.specialistOwned = true;
    vi.clearAllMocks();
  });

  it("allows the manual write (HTTP 200) and emits a deprecation warning", async () => {
    const res = await request(app)
      .put(`/api/admin/model-constants/${ownedKey}`)
      .send({
        country: "United States",
        countrySubdivision: "California",
        value: 0.30,
        overrideNote: "legacy path",
      });

    expect(res.status).toBe(200);
    expect(storage.upsertModelConstantOverride).toHaveBeenCalledTimes(1);
    expect(storage.upsertModelConstantOverride).toHaveBeenCalledWith(
      expect.objectContaining({ constantKey: ownedKey, source: "manual" }),
    );

    expect(logger.warn).toHaveBeenCalledTimes(1);
    const calls = (logger.warn as unknown as { mock: { calls: [string, string?][] } }).mock.calls;
    const [msg] = calls[0]!;
    expect(msg).toMatch(/deprecated/);
    expect(msg).toMatch(new RegExp(ownedKey));
  });
});

describe("POST /api/admin/model-constants/:key/apply-research — analyst writer (Task #388 doctrine)", () => {
  let app: Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  it("happy path: matching body + valid researchRunId still writes (HTTP 200, source='analyst')", async () => {
    const res = await request(app)
      .post("/api/admin/model-constants/taxRate/apply-research")
      .send({
        country: "United States",
        countrySubdivision: "California",
        value: 0.30,
        authority: "California FTB",
        referenceUrl: "https://example.test/ftb",
        reasoning: "Statutory rate change",
        researchRunId: FIXTURE_RESEARCH_RUN_ID,
      });

    expect(res.status).toBe(200);
    expect(storage.upsertModelConstantOverride).toHaveBeenCalledTimes(1);
    expect(storage.upsertModelConstantOverride).toHaveBeenCalledWith(
      expect.objectContaining({
        constantKey: "taxRate",
        source: "analyst",
        researchRunId: FIXTURE_RESEARCH_RUN_ID,
        authority: "California FTB",
        value: 0.30,
      }),
    );
  });
});

describe("DELETE /api/admin/model-constants/:key — rollback escape hatch is unaffected", () => {
  let app: Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  it("still resets a specialist-owned key to factory (HTTP 200)", async () => {
    const res = await request(app).delete(
      "/api/admin/model-constants/taxRate?country=United%20States&subdivision=California",
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(storage.deleteModelConstantOverride).toHaveBeenCalledTimes(1);
    expect(storage.deleteModelConstantOverride).toHaveBeenCalledWith(
      "taxRate",
      "United States",
      "California",
    );
  });
});
