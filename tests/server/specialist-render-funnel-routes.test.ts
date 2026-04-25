/**
 * Task #441 — Specialist render funnel route coverage.
 *
 * Locks down the HTTP contract of the new render funnel endpoints:
 *
 *   POST /api/specialists/photo-enhancer/run   (album buttons + console)
 *   GET  /api/specialists/photo-enhancer/calls (specialist call log)
 *
 * Done-looks-like (per task brief):
 *   1. Running a job creates a research_runs row tagged with
 *      `metadata.specialistId = "photos.photo-enhancer"` and the
 *      originating propertyId.
 *   2. The calls endpoint returns runs filtered by specialistId
 *      (delegates to storage.getResearchRunsForSpecialist with the
 *      right id, and only the matching runs come back).
 *   3. Failure paths:
 *        - rate-limit exceeded → HTTP 429, no run created
 *        - Replicate error (with no working fallback) → run marked
 *          "failed" with the error message captured
 *
 * These tests use the real route handlers wired into a fresh Express
 * app, with Replicate / OpenAI / object-storage / research_runs storage
 * / SSRF resolver / auth / loggers all mocked. No DB and no network.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

// ─── Auth + rate-limit mock ──────────────────────────────────────────────────

const rateLimitState = { limited: false };
const authedUserId = 7;

vi.mock("../../server/auth", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
  requireAdmin: (_req: any, _res: any, next: any) => next(),
  getAuthUser: (_req: any) => ({ id: authedUserId, role: "admin" }),
  isApiRateLimited: (_userId: number, _key: string, _limit: number) =>
    rateLimitState.limited,
}));

// ─── Replicate + OpenAI mocks ────────────────────────────────────────────────

const replicateGen = vi.fn();
const isStyleEnabledMock = vi.fn(async () => true);

vi.mock("../../server/integrations/replicate", () => ({
  replicateService: { generateImage: (...args: any[]) => replicateGen(...args) },
  isStyleEnabled: (style: string) => isStyleEnabledMock(style),
  getDefaultImageSize: async () => "1024x1024",
  getAdminRateLimit: async () => 10,
  getAvailableStylesFromDb: async () => [],
}));

const generateImageBufferMock = vi.fn(async () => Buffer.from("openai-img"));
vi.mock("../../server/image/client", () => ({
  generateImageBuffer: (...args: any[]) => generateImageBufferMock(...args),
  getOpenAIClient: () => ({}),
  getGeminiClient: () => ({}),
}));

// ─── Object storage mock ─────────────────────────────────────────────────────

const uploadBufferMock = vi.fn(async (name: string) => `/objects/${name}.png`);
vi.mock("../../server/providers/storage", () => ({
  getStorageProvider: () => ({ uploadBuffer: uploadBufferMock }),
}));

// ─── research_runs storage mock ──────────────────────────────────────────────
//
// The mock keeps an in-memory table of research_runs rows so we can:
//   - Inspect what got created (specialistId, propertyId, entityId, etc.)
//   - Verify the calls endpoint really filters by specialistId via storage.

interface FakeRun {
  id: number;
  entityType: string;
  entityId: number;
  status: string;
  modelPrimary?: string;
  startedAt?: Date | null;
  completedAt?: Date | null;
  durationMs?: number | null;
  error?: string | null;
  metadata: any;
}

const researchRunRows: FakeRun[] = [];
let nextRunId = 1;

const createResearchRun = vi.fn(async (input: any): Promise<FakeRun> => {
  const row: FakeRun = {
    id: nextRunId++,
    entityType: input.entityType,
    entityId: input.entityId,
    status: input.status,
    modelPrimary: input.modelPrimary,
    metadata: input.metadata,
    startedAt: new Date(),
    completedAt: null,
    durationMs: null,
    error: null,
  };
  researchRunRows.push(row);
  return row;
});

const updateResearchRun = vi.fn(async (id: number, patch: any) => {
  const row = researchRunRows.find((r) => r.id === id);
  if (row) Object.assign(row, patch);
  return row;
});

// Real-shape filter: the production storage method filters
// research_runs by metadata->>'specialistId'. Mirror that contract here so
// the test verifies the route delegates correctly AND that the filter
// semantics still hold against representative data.
const getResearchRunsForSpecialist = vi.fn(
  async (specialistId: string, limit = 50): Promise<FakeRun[]> => {
    return researchRunRows
      .filter((r) => r.metadata?.specialistId === specialistId)
      .slice(-limit)
      .reverse();
  },
);

const recordObservedMissingFields = vi.fn(async () => undefined);

vi.mock("../../server/storage", () => ({
  storage: {
    createResearchRun,
    updateResearchRun,
    getResearchRunsForSpecialist,
    recordObservedMissingFields,
  },
}));

// ─── SSRF resolver mock — never blocks in this file ──────────────────────────

vi.mock("../../server/routes/ssrf-guard", () => ({
  isBlockedHostResolved: async () => false,
}));

// ─── Quiet peripheral mocks ──────────────────────────────────────────────────

vi.mock("../../server/middleware/cost-logger", () => ({
  logApiCost: () => undefined,
  estimateCost: () => 0,
  unitCost: () => 0,
}));

vi.mock("../../server/logger", () => ({
  logger: {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  },
  loggerFor: () => ({
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  }),
}));

vi.mock("../../engine/analyst/registry/specialist-catalog", () => ({
  getSpecialistById: () => ({ humanName: "Photos & Renders" }),
}));

vi.mock("../../server/ai/resolve-llm", () => ({
  resolveLlm: async () => ({}),
  getVendorService: () => ({}),
}));

// ─── Build app AFTER mocks are registered ────────────────────────────────────

async function buildApp(): Promise<Express> {
  const { register } = await import(
    "../../server/routes/specialist-photo-enhancer"
  );
  const app = express();
  app.use(express.json());
  register(app);
  return app;
}

// ─── Shared reset ────────────────────────────────────────────────────────────

beforeEach(() => {
  rateLimitState.limited = false;
  researchRunRows.length = 0;
  nextRunId = 1;
  replicateGen.mockReset();
  replicateGen.mockResolvedValue(Buffer.from("replicate-img"));
  generateImageBufferMock.mockReset();
  generateImageBufferMock.mockResolvedValue(Buffer.from("openai-img"));
  uploadBufferMock.mockClear();
  createResearchRun.mockClear();
  updateResearchRun.mockClear();
  getResearchRunsForSpecialist.mockClear();
  recordObservedMissingFields.mockClear();
  isStyleEnabledMock.mockReset();
  isStyleEnabledMock.mockResolvedValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("POST /api/specialists/photo-enhancer/run — research_runs row contract", () => {
  it("creates a research_runs row tagged with the specialistId and the originating propertyId", async () => {
    const app = await buildApp();
    const propertyId = 4242;

    const res = await request(app)
      .post("/api/specialists/photo-enhancer/run")
      .send({
        prompt: "twilight exterior",
        style: "architectural-exterior",
        propertyId,
        originatedFrom: "album",
      });

    expect(res.status).toBe(200);
    expect(res.body.specialistRunId).toBeTypeOf("number");

    expect(createResearchRun).toHaveBeenCalledTimes(1);
    const created = createResearchRun.mock.calls[0][0];

    // Specialist tagging — required for both the per-Specialist Calls tab
    // and the per-property album call log to find this row.
    expect(created.metadata.specialistId).toBe("photos.photo-enhancer");

    // Originating propertyId is captured in BOTH the structured entity
    // pointer (so it joins to properties) AND the metadata blob (so the
    // calls UI can render it without a property table join).
    expect(created.entityType).toBe("property");
    expect(created.entityId).toBe(propertyId);
    expect(created.metadata.propertyId).toBe(propertyId);
    expect(created.metadata.originatedFrom).toBe("album");
    expect(created.metadata.route).toBe("/api/specialists/photo-enhancer/run");

    // The completion update keeps the same specialistId+propertyId so a
    // race that read the row mid-run vs after-run still routes correctly.
    const completeCall = updateResearchRun.mock.calls.find(
      (c: any[]) => c[1]?.status === "completed",
    );
    expect(completeCall).toBeDefined();
    expect(completeCall![1].metadata.specialistId).toBe("photos.photo-enhancer");
    expect(completeCall![1].metadata.propertyId).toBe(propertyId);
  });

  it("creates a research_runs row even when no propertyId is supplied (specialist-page workflow)", async () => {
    const app = await buildApp();

    const res = await request(app)
      .post("/api/specialists/photo-enhancer/run")
      .send({ prompt: "design study", style: "interior-design" });

    expect(res.status).toBe(200);
    const created = createResearchRun.mock.calls[0][0];
    expect(created.metadata.specialistId).toBe("photos.photo-enhancer");
    // Without a property, the row is anchored to the specialist itself,
    // not silently joined onto property #0 in the UI.
    expect(created.entityType).toBe("specialist-run");
    expect(created.entityId).toBe(0);
    expect(created.metadata.propertyId).toBeNull();
  });
});

describe("GET /api/specialists/photo-enhancer/calls — filtered by specialistId", () => {
  it("delegates to storage.getResearchRunsForSpecialist with the canonical id", async () => {
    const app = await buildApp();

    const res = await request(app).get("/api/specialists/photo-enhancer/calls");
    expect(res.status).toBe(200);
    expect(res.body.specialistId).toBe("photos.photo-enhancer");
    expect(getResearchRunsForSpecialist).toHaveBeenCalledTimes(1);
    expect(getResearchRunsForSpecialist).toHaveBeenCalledWith(
      "photos.photo-enhancer",
      expect.any(Number),
    );
  });

  it("only returns runs whose metadata.specialistId matches; runs from other specialists are excluded", async () => {
    const app = await buildApp();

    // Seed an unrelated run that another specialist would have produced —
    // the calls endpoint must NOT leak it.
    researchRunRows.push({
      id: nextRunId++,
      entityType: "property",
      entityId: 1,
      status: "completed",
      modelPrimary: "openai:gpt-5",
      startedAt: new Date(),
      completedAt: new Date(),
      durationMs: 100,
      error: null,
      metadata: { specialistId: "macro.industry-analyst" },
    });

    // Now run a real render through the funnel — that one SHOULD show up.
    const runRes = await request(app)
      .post("/api/specialists/photo-enhancer/run")
      .send({ prompt: "x", style: "architectural-exterior", propertyId: 9 });
    expect(runRes.status).toBe(200);

    const res = await request(app).get("/api/specialists/photo-enhancer/calls");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.runs)).toBe(true);
    expect(res.body.runs.length).toBe(1);
    expect(res.body.runs[0].metadata.specialistId).toBe("photos.photo-enhancer");
    expect(res.body.runs[0].entityId).toBe(9);
  });

  it("respects a custom ?limit query param (clamped to a sane upper bound)", async () => {
    const app = await buildApp();

    await request(app).get("/api/specialists/photo-enhancer/calls?limit=25");
    expect(getResearchRunsForSpecialist).toHaveBeenLastCalledWith(
      "photos.photo-enhancer",
      25,
    );

    // Unbounded values should be clamped, not echoed back verbatim.
    await request(app).get("/api/specialists/photo-enhancer/calls?limit=99999");
    const lastCall = getResearchRunsForSpecialist.mock.calls.at(-1)!;
    expect(lastCall[0]).toBe("photos.photo-enhancer");
    expect(lastCall[1]).toBeLessThanOrEqual(200);
  });
});

describe("POST /api/specialists/photo-enhancer/run — failure paths", () => {
  it("returns HTTP 429 when the shared 'generate-image' bucket is exhausted, and creates no run", async () => {
    rateLimitState.limited = true;
    const app = await buildApp();

    const res = await request(app)
      .post("/api/specialists/photo-enhancer/run")
      .send({ prompt: "x", style: "standard", propertyId: 1 });

    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/rate limit/i);
    // No row, no generator invocation, no upload — the funnel short-circuits
    // BEFORE any side effect.
    expect(createResearchRun).not.toHaveBeenCalled();
    expect(replicateGen).not.toHaveBeenCalled();
    expect(generateImageBufferMock).not.toHaveBeenCalled();
    expect(uploadBufferMock).not.toHaveBeenCalled();
  });

  it("marks the research_runs row 'failed' with the Replicate error captured when generation cannot recover", async () => {
    // Replicate fails AND the OpenAI fallback also fails — the funnel can
    // produce no image, so the run must be persisted as failed with the
    // underlying error message preserved (truncated) for the call log.
    replicateGen.mockRejectedValueOnce(new Error("replicate exploded: 503"));
    generateImageBufferMock.mockRejectedValueOnce(new Error("openai also down"));
    const app = await buildApp();

    const res = await request(app)
      .post("/api/specialists/photo-enhancer/run")
      .send({
        prompt: "x",
        style: "photo-upscale",
        propertyId: 77,
      });

    expect(res.status).toBe(500);

    // A row was created (so the call log shows the attempt at all)…
    expect(createResearchRun).toHaveBeenCalledTimes(1);
    const created = createResearchRun.mock.calls[0][0];
    expect(created.metadata.specialistId).toBe("photos.photo-enhancer");
    expect(created.metadata.propertyId).toBe(77);

    // …and that row was flipped to 'failed' with the error string captured.
    const failedCall = updateResearchRun.mock.calls.find(
      (c: any[]) => c[1]?.status === "failed",
    );
    expect(failedCall).toBeDefined();
    expect(failedCall![1].error).toMatch(/openai also down|replicate exploded/);
    expect(failedCall![1].completedAt).toBeInstanceOf(Date);

    // Crucially, no 'completed' update was issued.
    const completedCall = updateResearchRun.mock.calls.find(
      (c: any[]) => c[1]?.status === "completed",
    );
    expect(completedCall).toBeUndefined();
  });

  it("for the standard (no-replicate) style, a generator failure marks the run failed with the error captured", async () => {
    // The 'standard' style skips Replicate entirely and goes straight to
    // OpenAI — so a single OpenAI failure is sufficient to mark the run
    // failed and surface the error in the call log.
    generateImageBufferMock.mockRejectedValueOnce(
      new Error("openai timeout after 30s"),
    );
    const app = await buildApp();

    const res = await request(app)
      .post("/api/specialists/photo-enhancer/run")
      .send({ prompt: "x", style: "standard", propertyId: 33 });

    expect(res.status).toBe(500);

    const failedCall = updateResearchRun.mock.calls.find(
      (c: any[]) => c[1]?.status === "failed",
    );
    expect(failedCall).toBeDefined();
    expect(failedCall![1].error).toMatch(/openai timeout after 30s/);

    // The failed row is visible through the calls endpoint so the admin
    // can see what went wrong instead of silently losing the attempt.
    const calls = await request(app).get("/api/specialists/photo-enhancer/calls");
    expect(calls.status).toBe(200);
    const failedRun = calls.body.runs.find((r: any) => r.status === "failed");
    expect(failedRun).toBeDefined();
    expect(failedRun.error).toMatch(/openai timeout/);
    expect(failedRun.metadata.specialistId).toBe("photos.photo-enhancer");
    expect(failedRun.entityId).toBe(33);
  });
});
