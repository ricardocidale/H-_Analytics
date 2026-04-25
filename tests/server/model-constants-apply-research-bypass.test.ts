/**
 * Task #388 — Close the apply-research doctrine bypass.
 *
 * Phase 3 (Task #386) shut the manual Constants edit path
 * (PUT /api/admin/model-constants/:key returns 422 for specialist-owned
 * keys). But the analyst path POST /api/admin/model-constants/:key/apply-
 * research previously trusted whatever the client sent — value, authority,
 * reasoning, researchRunId. An admin who could call /apply-research
 * directly could skip the AI Specialist regenerate step, type any value,
 * label it "analyst," reference any researchRunId (even one for a
 * different key/locality), and write it through.
 *
 * This suite locks the runtime contract that closes the hole. Every
 * doctrine-violating shape returns 422 (not 400 / 404) so monitoring
 * can distinguish doctrine bypass attempts from ordinary HTTP errors:
 *
 *   1. Missing / null / non-positive researchRunId → 422
 *      RESEARCH_RUN_ID_REQUIRED, no storage write.
 *   2. Unknown researchRunId (no row in the table) → 422
 *      RESEARCH_RUN_NOT_FOUND with a logger.warn tamper trail.
 *   3. researchRunId belongs to a different (key, country, subdivision)
 *      tuple → 422 RESEARCH_RUN_LOCALITY_MISMATCH with a logger.warn
 *      tamper trail. (Cross-row replay is blocked even on a direct id
 *      lookup because we re-verify metadata.constant against the
 *      request.)
 *   4. Tampered `value` → 422 with RESEARCH_RUN_TAMPERED, mismatchedFields
 *      includes "value", and a logger.warn tamper trail. No storage
 *      write.
 *   5. Tampered `authority` → 422 RESEARCH_RUN_TAMPERED, mismatched
 *      "authority". No storage write.
 *   6. Tampered `reasoning` → 422 RESEARCH_RUN_TAMPERED, mismatched
 *      "reasoning". No storage write.
 *   7. Tampered `referenceUrl` → 422 RESEARCH_RUN_TAMPERED. No storage
 *      write.
 *   8. Run row without a complete proposal → 422
 *      RESEARCH_RUN_INCOMPLETE. No storage write.
 *   9. Happy path (matching body + valid run) → 200; storage is called
 *      with the *persisted* proposal's value/authority/referenceUrl/
 *      reasoning, NOT the body's. (Proves the body fields are tamper-
 *      detection only — the canonical source is the run row.)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import request from "supertest";

const PERSISTED_VALUE = 0.30;
const PERSISTED_AUTHORITY = "California FTB";
const PERSISTED_REFERENCE_URL = "https://example.test/ftb";
const PERSISTED_REASONING = "Statutory rate change for tax year 2026.";

/**
 * Storage mock helper. By default the mock's `getResearchRunById` resolves
 * the fixture row for RUN_ID. Tests override it via `mockImplementation`
 * to simulate unknown ids, locality mismatches, and incomplete proposals.
 */
function makeRunRow(
  id: number,
  proposalOverrides: Record<string, unknown> = {},
  constantOverrides: Record<string, unknown> = {},
) {
  return {
    id,
    startedAt: new Date(),
    completedAt: new Date(),
    status: "completed",
    metadata: {
      specialistId: "constants.tax-research",
      constant: {
        key: "taxRate",
        country: "United States",
        subdivision: "California",
        ...constantOverrides,
      },
      proposal: {
        value: PERSISTED_VALUE,
        authority: PERSISTED_AUTHORITY,
        referenceUrl: PERSISTED_REFERENCE_URL,
        reasoning: PERSISTED_REASONING,
        ...proposalOverrides,
      },
    },
  };
}

const RUN_ID = 555;

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
    // Direct-by-id lookup is the canonical doctrine path (Task #388).
    // The route also ranges over `getResearchRunsForConstant` for the
    // /apply-proposal sibling path, so we keep both mocks defined.
    getResearchRunById: vi.fn(async () => undefined),
    getResearchRunsForConstant: vi.fn(async () => []),
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

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  registerModelConstantsRoutes(app);
  return app;
}

const URL_TAX_CALIFORNIA = "/api/admin/model-constants/taxRate/apply-research";

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    country: "United States",
    countrySubdivision: "California",
    value: PERSISTED_VALUE,
    authority: PERSISTED_AUTHORITY,
    referenceUrl: PERSISTED_REFERENCE_URL,
    reasoning: PERSISTED_REASONING,
    researchRunId: RUN_ID,
    ...overrides,
  };
}

describe("apply-research doctrine bypass close (Task #388)", () => {
  let app: Express;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: getResearchRunById resolves the matching fixture for RUN_ID
    // and undefined for any other id. Per-test overrides via
    // mockImplementation simulate the bypass-attempt shapes (unknown id,
    // locality mismatch, incomplete proposal).
    (storage.getResearchRunById as ReturnType<typeof vi.fn>).mockImplementation(
      async (id: number) => (id === RUN_ID ? makeRunRow(RUN_ID) : undefined),
    );
    (storage.getResearchRunsForConstant as ReturnType<typeof vi.fn>).mockImplementation(
      async () => [],
    );
    app = buildApp();
  });

  describe("required researchRunId (doctrine pre-check → 422)", () => {
    it("rejects body without researchRunId with 422 RESEARCH_RUN_ID_REQUIRED and no storage write", async () => {
      const body = validBody();
      delete (body as { researchRunId?: number }).researchRunId;
      const res = await request(app).post(URL_TAX_CALIFORNIA).send(body);

      expect(res.status).toBe(422);
      expect(res.body.code).toBe("RESEARCH_RUN_ID_REQUIRED");
      expect(storage.upsertModelConstantOverride).not.toHaveBeenCalled();
      expect(storage.getResearchRunById).not.toHaveBeenCalled();
    });

    it("rejects body with null researchRunId with 422 RESEARCH_RUN_ID_REQUIRED", async () => {
      const body = validBody({ researchRunId: null });
      const res = await request(app).post(URL_TAX_CALIFORNIA).send(body);

      expect(res.status).toBe(422);
      expect(res.body.code).toBe("RESEARCH_RUN_ID_REQUIRED");
      expect(storage.upsertModelConstantOverride).not.toHaveBeenCalled();
    });

    it("rejects body with non-positive researchRunId with 422 RESEARCH_RUN_ID_REQUIRED", async () => {
      const res = await request(app)
        .post(URL_TAX_CALIFORNIA)
        .send(validBody({ researchRunId: 0 }));

      expect(res.status).toBe(422);
      expect(res.body.code).toBe("RESEARCH_RUN_ID_REQUIRED");
      expect(storage.upsertModelConstantOverride).not.toHaveBeenCalled();
    });

    it("rejects body with non-numeric researchRunId with 422 RESEARCH_RUN_ID_REQUIRED", async () => {
      const res = await request(app)
        .post(URL_TAX_CALIFORNIA)
        .send(validBody({ researchRunId: "not-a-number" }));

      expect(res.status).toBe(422);
      expect(res.body.code).toBe("RESEARCH_RUN_ID_REQUIRED");
      expect(storage.upsertModelConstantOverride).not.toHaveBeenCalled();
    });

    it("logs a doctrine-rejection warn when researchRunId is missing", async () => {
      const body = validBody();
      delete (body as { researchRunId?: number }).researchRunId;
      await request(app).post(URL_TAX_CALIFORNIA).send(body);

      expect(logger.warn).toHaveBeenCalled();
      const warnings = (logger.warn as ReturnType<typeof vi.fn>).mock.calls
        .map((c) => c[0])
        .join("\n");
      expect(warnings).toMatch(/missing or invalid researchRunId/);
    });
  });

  describe("unknown researchRunId (→ 422 RESEARCH_RUN_NOT_FOUND)", () => {
    it("returns 422 RESEARCH_RUN_NOT_FOUND when the run id does not exist", async () => {
      const res = await request(app)
        .post(URL_TAX_CALIFORNIA)
        .send(validBody({ researchRunId: 9999 }));

      expect(res.status).toBe(422);
      expect(res.body.code).toBe("RESEARCH_RUN_NOT_FOUND");
      expect(storage.upsertModelConstantOverride).not.toHaveBeenCalled();
    });

    it("logs a tamper warning when the run id is unknown", async () => {
      await request(app)
        .post(URL_TAX_CALIFORNIA)
        .send(validBody({ researchRunId: 9999 }));

      expect(logger.warn).toHaveBeenCalled();
      const warnings = (logger.warn as ReturnType<typeof vi.fn>).mock.calls
        .map((c) => c[0])
        .join("\n");
      expect(warnings).toMatch(/apply-research tamper attempt/);
      expect(warnings).toMatch(/researchRunId=9999/);
    });

    it("uses a direct by-id lookup (unbounded) so old run ids are not falsely 404'd", async () => {
      // Important: we MUST NOT use a windowed list+find lookup because a
      // valid old run could fall outside the recency window. The direct
      // by-id lookup is the doctrine-correct path.
      await request(app)
        .post(URL_TAX_CALIFORNIA)
        .send(validBody({ researchRunId: 9999 }));

      expect(storage.getResearchRunById).toHaveBeenCalledWith(9999);
    });
  });

  describe("cross-row replay (→ 422 RESEARCH_RUN_LOCALITY_MISMATCH)", () => {
    it("rejects when the run's persisted constant.key differs from the URL key", async () => {
      // Real-world bypass: admin grabs a researchRunId that produced a
      // proposal for vacancyRate / Texas and tries to replay it against
      // taxRate / California. Direct id lookup would happily return the
      // row — the metadata.constant scope check is what blocks it.
      (storage.getResearchRunById as ReturnType<typeof vi.fn>).mockImplementation(
        async () =>
          makeRunRow(RUN_ID, {}, {
            key: "vacancyRate",
            country: "United States",
            subdivision: "Texas",
          }),
      );

      const res = await request(app)
        .post(URL_TAX_CALIFORNIA)
        .send(validBody());

      expect(res.status).toBe(422);
      expect(res.body.code).toBe("RESEARCH_RUN_LOCALITY_MISMATCH");
      expect(res.body.expected).toEqual({
        key: "taxRate",
        country: "United States",
        subdivision: "California",
      });
      expect(res.body.actual).toEqual({
        key: "vacancyRate",
        country: "United States",
        subdivision: "Texas",
      });
      expect(storage.upsertModelConstantOverride).not.toHaveBeenCalled();
    });

    it("rejects when only the subdivision differs (key/country match)", async () => {
      (storage.getResearchRunById as ReturnType<typeof vi.fn>).mockImplementation(
        async () =>
          makeRunRow(RUN_ID, {}, {
            key: "taxRate",
            country: "United States",
            subdivision: "Nevada",
          }),
      );

      const res = await request(app)
        .post(URL_TAX_CALIFORNIA)
        .send(validBody());

      expect(res.status).toBe(422);
      expect(res.body.code).toBe("RESEARCH_RUN_LOCALITY_MISMATCH");
      expect(storage.upsertModelConstantOverride).not.toHaveBeenCalled();
    });

    it("logs a tamper warning on locality mismatch", async () => {
      (storage.getResearchRunById as ReturnType<typeof vi.fn>).mockImplementation(
        async () =>
          makeRunRow(RUN_ID, {}, {
            key: "vacancyRate",
            country: "United States",
            subdivision: "Texas",
          }),
      );

      await request(app)
        .post(URL_TAX_CALIFORNIA)
        .send(validBody());

      const warnings = (logger.warn as ReturnType<typeof vi.fn>).mock.calls
        .map((c) => c[0])
        .join("\n");
      expect(warnings).toMatch(/apply-research tamper attempt/);
      expect(warnings).toMatch(/belongs to vacancyRate/);
    });
  });

  describe("tampered fields (→ 422 RESEARCH_RUN_TAMPERED)", () => {
    it("rejects a tampered value with 422 RESEARCH_RUN_TAMPERED", async () => {
      const res = await request(app)
        .post(URL_TAX_CALIFORNIA)
        .send(validBody({ value: 0.99 }));

      expect(res.status).toBe(422);
      expect(res.body.code).toBe("RESEARCH_RUN_TAMPERED");
      expect(res.body.mismatchedFields).toContain("value");
      expect(storage.upsertModelConstantOverride).not.toHaveBeenCalled();
    });

    it("rejects a tampered authority with 422", async () => {
      const res = await request(app)
        .post(URL_TAX_CALIFORNIA)
        .send(validBody({ authority: "EVIL CORP" }));

      expect(res.status).toBe(422);
      expect(res.body.code).toBe("RESEARCH_RUN_TAMPERED");
      expect(res.body.mismatchedFields).toContain("authority");
      expect(storage.upsertModelConstantOverride).not.toHaveBeenCalled();
    });

    it("rejects a tampered reasoning with 422", async () => {
      const res = await request(app)
        .post(URL_TAX_CALIFORNIA)
        .send(validBody({ reasoning: "I just made this up" }));

      expect(res.status).toBe(422);
      expect(res.body.code).toBe("RESEARCH_RUN_TAMPERED");
      expect(res.body.mismatchedFields).toContain("reasoning");
      expect(storage.upsertModelConstantOverride).not.toHaveBeenCalled();
    });

    it("rejects a tampered referenceUrl with 422", async () => {
      const res = await request(app)
        .post(URL_TAX_CALIFORNIA)
        .send(validBody({ referenceUrl: "https://malicious.test/spoof" }));

      expect(res.status).toBe(422);
      expect(res.body.code).toBe("RESEARCH_RUN_TAMPERED");
      expect(res.body.mismatchedFields).toContain("referenceUrl");
      expect(storage.upsertModelConstantOverride).not.toHaveBeenCalled();
    });

    it("logs a tamper warning when fields are tampered", async () => {
      await request(app)
        .post(URL_TAX_CALIFORNIA)
        .send(validBody({ value: 0.99, authority: "EVIL" }));

      expect(logger.warn).toHaveBeenCalled();
      const warnings = (logger.warn as ReturnType<typeof vi.fn>).mock.calls
        .map((c) => c[0])
        .join("\n");
      expect(warnings).toMatch(/apply-research tamper attempt/);
      expect(warnings).toMatch(/value/);
      expect(warnings).toMatch(/authority/);
    });

    it("reports ALL mismatched fields in one response (no early-exit)", async () => {
      const res = await request(app)
        .post(URL_TAX_CALIFORNIA)
        .send(validBody({
          value: 0.99,
          authority: "EVIL",
          referenceUrl: "https://malicious.test/spoof",
          reasoning: "fake",
        }));

      expect(res.status).toBe(422);
      expect(res.body.mismatchedFields).toEqual(
        expect.arrayContaining(["value", "authority", "referenceUrl", "reasoning"]),
      );
    });
  });

  describe("incomplete persisted proposals (→ 422 RESEARCH_RUN_INCOMPLETE)", () => {
    it("returns 422 RESEARCH_RUN_INCOMPLETE when the run has no proposal in metadata", async () => {
      (storage.getResearchRunById as ReturnType<typeof vi.fn>).mockImplementation(
        async () => ({
          id: RUN_ID,
          startedAt: new Date(),
          completedAt: new Date(),
          status: "completed",
          metadata: {
            specialistId: "constants.tax-research",
            constant: {
              key: "taxRate",
              country: "United States",
              subdivision: "California",
            },
            // no `proposal`
          },
        }),
      );

      const res = await request(app)
        .post(URL_TAX_CALIFORNIA)
        .send(validBody());

      expect(res.status).toBe(422);
      expect(res.body.code).toBe("RESEARCH_RUN_INCOMPLETE");
      expect(storage.upsertModelConstantOverride).not.toHaveBeenCalled();
    });

    it("returns 422 RESEARCH_RUN_INCOMPLETE when the persisted proposal lacks an authority", async () => {
      (storage.getResearchRunById as ReturnType<typeof vi.fn>).mockImplementation(
        async () => makeRunRow(RUN_ID, { authority: undefined }),
      );

      const res = await request(app).post(URL_TAX_CALIFORNIA).send(validBody());

      expect(res.status).toBe(422);
      expect(res.body.code).toBe("RESEARCH_RUN_INCOMPLETE");
      expect(storage.upsertModelConstantOverride).not.toHaveBeenCalled();
    });
  });

  describe("happy path", () => {
    it("writes the override using the persisted proposal (not the body) when everything matches", async () => {
      const res = await request(app)
        .post(URL_TAX_CALIFORNIA)
        .send(validBody());

      expect(res.status).toBe(200);
      expect(storage.upsertModelConstantOverride).toHaveBeenCalledTimes(1);
      const call = (storage.upsertModelConstantOverride as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(call).toMatchObject({
        constantKey: "taxRate",
        country: "United States",
        countrySubdivision: "California",
        value: PERSISTED_VALUE,
        source: "analyst",
        authority: PERSISTED_AUTHORITY,
        referenceUrl: PERSISTED_REFERENCE_URL,
        researchRunId: RUN_ID,
        overrideNote: PERSISTED_REASONING,
      });
    });

    it("treats body referenceUrl undefined === persisted null as equivalent (no false tamper)", async () => {
      // Persisted proposal carries referenceUrl=null. A client that
      // omits the field entirely (legacy) must not be flagged as
      // tampering — both normalise to `null` for comparison.
      (storage.getResearchRunById as ReturnType<typeof vi.fn>).mockImplementation(
        async () => makeRunRow(RUN_ID, { referenceUrl: null }),
      );

      const body = validBody();
      delete (body as { referenceUrl?: string | null }).referenceUrl;

      const res = await request(app).post(URL_TAX_CALIFORNIA).send(body);

      expect(res.status).toBe(200);
      expect(storage.upsertModelConstantOverride).toHaveBeenCalledWith(
        expect.objectContaining({ referenceUrl: null }),
      );
    });
  });
});
