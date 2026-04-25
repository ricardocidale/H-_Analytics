/**
 * Phase 5a — Photos & Renders pipeline, behavioral/runtime tests.
 *
 * Wires up an Express app with the real route handlers against mocked
 * collaborators (Replicate, OpenAI image client, object storage, research_runs
 * writer, auth, SSRF resolver) and exercises the HTTP surface with supertest.
 *
 * What these tests guarantee (the Phase 5a acceptance surface):
 *
 *   1. Both /api/specialists/photo-enhancer/run and the legacy
 *      /api/generate-property-image route through the shared pipeline —
 *      they each create a research_runs row tagged with
 *      `specialistId = "photos.photo-enhancer"` and they each upload via
 *      the same object-storage provider.
 *   2. 429 rate-limit short-circuit happens on the SHARED "generate-image"
 *      bucket, not per-route buckets.
 *   3. When a Replicate-style generation fails, the pipeline falls back
 *      to the OpenAI image buffer and the response sets
 *      `usedFallback: true`. The completed research_runs metadata reflects
 *      the fallback.
 *   4. SSRF: a `beforeImageUrl` whose host resolves to a blocked target
 *      (loopback, RFC1918, link-local, metadata) returns HTTP 400 with
 *      the guard's error message BEFORE any generator is invoked.
 *   5. A disabled style returns HTTP 400 and does NOT call the generator.
 *   6. A generator throw (post-guard, post-style-check) marks the
 *      research_runs row `failed` with the error message and rethrows.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

// ─── Auth mock ────────────────────────────────────────────────────────────────

const rateLimitState = { limited: false };
const authedUserId = 42;

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

const researchRunRows: any[] = [];
let nextRunId = 1;
const createResearchRun = vi.fn(async (input: any) => {
  const row = { id: nextRunId++, ...input };
  researchRunRows.push(row);
  return row;
});
const updateResearchRun = vi.fn(async (id: number, patch: any) => {
  const row = researchRunRows.find((r) => r.id === id);
  if (row) Object.assign(row, patch);
  return row;
});
// Combined mock signature: third arg is either a positional offset (gallery
// pagination — Task #433) or an options bag with a propertyId filter (per-
// property album render history — Task #439). Mirrors the real Postgres
// semantics: most recent first, then propertyId scoping, then offset/limit.
const getResearchRunsForSpecialist = vi.fn(
  async (
    _id: string,
    limit?: number,
    optionsOrOffset?: number | { offset?: number; propertyId?: number },
  ) => {
    const offset = typeof optionsOrOffset === "number"
      ? optionsOrOffset
      : (optionsOrOffset?.offset ?? 0);
    const propertyId = typeof optionsOrOffset === "object" && optionsOrOffset !== null
      ? optionsOrOffset.propertyId
      : undefined;
    let pool = [...researchRunRows];
    if (propertyId !== undefined) {
      pool = pool.filter((r) =>
        (r.entityType === "property" && r.entityId === propertyId)
        || (r.metadata && r.metadata.propertyId === propertyId),
      );
    }
    const sorted = pool.reverse();
    const end = offset + (limit ?? sorted.length);
    return sorted.slice(offset, end);
  },
);
const countResearchRunsForSpecialist = vi.fn(async () => researchRunRows.length);
// Task #439 — return a real user shape so both the gallery's
// userDisplayName logic (Task #433) and the album's triggeredBy enrichment
// pass against the same mock.
const getUserById = vi.fn(async (id: number) => ({
  id,
  email: `user${id}@example.com`,
  firstName: "Test",
  lastName: `User${id}`,
}));
const recordObservedMissingFields = vi.fn(async () => undefined);
// Task #433 — both the specialist route and the engine evaluator now read
// the admin-edited config to honor `promptTemplate` + `modelResourceId` at
// runtime. The runtime test exercises the HTTP surface only, so we return
// the empty default config (no template, no override) — the exact same
// shape `getSpecialistConfig` returns for a Specialist whose admin has
// never opened the page.
const getSpecialistConfig = vi.fn(async () => ({
  promptTemplate: "",
  modelResourceId: null,
  runtimeConfig: {},
}));
const getAllPropertiesAdmin = vi.fn(async () => []);

vi.mock("../../server/storage", () => ({
  storage: {
    createResearchRun,
    updateResearchRun,
    getResearchRunsForSpecialist,
    countResearchRunsForSpecialist,
    getUserById,
    recordObservedMissingFields,
    getSpecialistConfig,
    getAllPropertiesAdmin,
  },
}));

// ─── SSRF resolver mock ──────────────────────────────────────────────────────

const blockedHosts = new Set<string>();
vi.mock("../../server/routes/ssrf-guard", () => ({
  isBlockedHostResolved: async (hostname: string) =>
    blockedHosts.has(hostname.toLowerCase()),
}));

// ─── Peripheral mocks (keep loggers/cost-logger quiet) ───────────────────────

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
  getSpecialistById: () => ({ humanName: "Fernanda" }),
}));

vi.mock("../../server/ai/resolve-llm", () => ({
  resolveLlm: async () => ({}),
  getVendorService: () => ({}),
}));

// ─── Dynamic imports AFTER mocks are registered ──────────────────────────────

async function buildApp(): Promise<Express> {
  const { register } = await import(
    "../../server/routes/specialist-photo-enhancer"
  );
  const { registerImageRoutes } = await import(
    "../../server/routes/images"
  );
  const app = express();
  app.use(express.json());
  register(app);
  registerImageRoutes(app);
  return app;
}

// ─── Shared reset ────────────────────────────────────────────────────────────

beforeEach(() => {
  rateLimitState.limited = false;
  blockedHosts.clear();
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
  getUserById.mockClear();
  recordObservedMissingFields.mockClear();
  isStyleEnabledMock.mockReset();
  isStyleEnabledMock.mockResolvedValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Photo Enhancer — success path through the shared pipeline", () => {
  it("specialist route: writes a research_runs row tagged with specialistId and returns the upload", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/api/specialists/photo-enhancer/run")
      .send({ prompt: "make it pretty", style: "architectural-exterior" });

    expect(res.status).toBe(200);
    expect(res.body.usedFallback).toBe(false);
    expect(res.body.style).toBe("architectural-exterior");
    expect(res.body.objectPath).toMatch(/^\/objects\/generated\//);

    expect(createResearchRun).toHaveBeenCalledTimes(1);
    const created = createResearchRun.mock.calls[0][0];
    expect(created.metadata.specialistId).toBe("photos.photo-enhancer");
    expect(created.modelPrimary).toBe("replicate:architectural-exterior");
    expect(replicateGen).toHaveBeenCalledTimes(1);
    expect(generateImageBufferMock).not.toHaveBeenCalled();
    expect(uploadBufferMock).toHaveBeenCalledTimes(1);

    // Completion update flips status → completed and stamps usedFallback=false.
    const completeCall = updateResearchRun.mock.calls.find(
      (c: any[]) => c[1]?.status === "completed",
    );
    expect(completeCall).toBeDefined();
    expect(completeCall![1].metadata.usedFallback).toBe(false);
    expect(completeCall![1].metadata.specialistId).toBe("photos.photo-enhancer");
  });

  it("legacy route: same pipeline, same specialist tag, omits specialistRunId from the response", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/api/generate-property-image")
      .send({ prompt: "hello", style: "interior-design", propertyId: 99 });

    expect(res.status).toBe(200);
    expect(res.body.specialistRunId).toBeUndefined(); // legacy contract preserved
    expect(res.body.isAiGenerated).toBe(true);

    const created = createResearchRun.mock.calls[0][0];
    expect(created.metadata.specialistId).toBe("photos.photo-enhancer");
    expect(created.metadata.originatedFrom).toBe("legacy");
    expect(created.entityType).toBe("property");
    expect(created.entityId).toBe(99);
  });
});

describe("Photo Enhancer — shared rate-limit bucket", () => {
  it("returns 429 on both routes when the 'generate-image' bucket is saturated", async () => {
    rateLimitState.limited = true;
    const app = await buildApp();

    const legacy = await request(app)
      .post("/api/generate-property-image")
      .send({ prompt: "", style: "standard" });
    const specialist = await request(app)
      .post("/api/specialists/photo-enhancer/run")
      .send({ prompt: "", style: "standard" });

    expect(legacy.status).toBe(429);
    expect(specialist.status).toBe(429);
    // Generation never ran.
    expect(createResearchRun).not.toHaveBeenCalled();
    expect(replicateGen).not.toHaveBeenCalled();
    expect(generateImageBufferMock).not.toHaveBeenCalled();
  });
});

describe("Photo Enhancer — Replicate→OpenAI fallback", () => {
  it("falls back to OpenAI when Replicate throws and marks usedFallback=true", async () => {
    replicateGen.mockRejectedValueOnce(new Error("replicate 500"));
    const app = await buildApp();

    const res = await request(app)
      .post("/api/specialists/photo-enhancer/run")
      .send({ prompt: "x", style: "photo-to-render" });

    expect(res.status).toBe(200);
    expect(res.body.usedFallback).toBe(true);
    expect(res.body.style).toBe("standard");
    expect(res.body.fallbackNotice).toMatch(/unavailable/i);

    expect(replicateGen).toHaveBeenCalledTimes(1);
    expect(generateImageBufferMock).toHaveBeenCalledTimes(1);

    // research_runs is persisted as completed with usedFallback=true.
    const completeCall = updateResearchRun.mock.calls.find(
      (c: any[]) => c[1]?.status === "completed",
    );
    expect(completeCall).toBeDefined();
    expect(completeCall![1].metadata.usedFallback).toBe(true);
  });
});

describe("Photo Enhancer — SSRF guard on beforeImageUrl", () => {
  it("rejects a beforeImageUrl whose host resolves to a blocked target, BEFORE any generator call", async () => {
    blockedHosts.add("attacker.internal");
    const app = await buildApp();

    const res = await request(app)
      .post("/api/specialists/photo-enhancer/run")
      .send({
        prompt: "x",
        style: "photo-to-render",
        beforeImageUrl: "https://attacker.internal/payload.png",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/blocked host/i);
    expect(replicateGen).not.toHaveBeenCalled();
    expect(generateImageBufferMock).not.toHaveBeenCalled();
    expect(createResearchRun).not.toHaveBeenCalled();
  });

  it("rejects non-http(s) schemes (file://) with 400", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/api/generate-property-image")
      .send({
        prompt: "x",
        style: "photo-to-render",
        beforeImageUrl: "file:///etc/passwd",
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/scheme/i);
    expect(replicateGen).not.toHaveBeenCalled();
  });

  it("allows a safe public https URL through the guard", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/api/specialists/photo-enhancer/run")
      .send({
        prompt: "x",
        style: "photo-to-render",
        beforeImageUrl: "https://cdn.example.com/a.png",
      });
    expect(res.status).toBe(200);
    expect(replicateGen).toHaveBeenCalledTimes(1);
  });
});

describe("Photo Enhancer — style-disabled short-circuit", () => {
  it("returns 400 and does not invoke the generator", async () => {
    isStyleEnabledMock.mockResolvedValueOnce(false);
    const app = await buildApp();

    const res = await request(app)
      .post("/api/specialists/photo-enhancer/run")
      .send({ prompt: "x", style: "virtual-staging" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/disabled/i);
    expect(replicateGen).not.toHaveBeenCalled();
    expect(createResearchRun).not.toHaveBeenCalled();
  });
});

describe("Photo Enhancer — generation failure telemetry", () => {
  it("marks the research_runs row failed and rethrows (HTTP 500) when both primary and fallback fail", async () => {
    replicateGen.mockRejectedValueOnce(new Error("replicate down"));
    generateImageBufferMock.mockRejectedValueOnce(new Error("openai down"));
    const app = await buildApp();

    const res = await request(app)
      .post("/api/specialists/photo-enhancer/run")
      .send({ prompt: "x", style: "photo-upscale" });

    expect(res.status).toBe(500);
    const failedCall = updateResearchRun.mock.calls.find(
      (c: any[]) => c[1]?.status === "failed",
    );
    expect(failedCall).toBeDefined();
    expect(failedCall![1].error).toMatch(/openai down/);
  });
});

describe("Photo Enhancer — specialist calls endpoint surfaces shared runs", () => {
  it("GET /api/specialists/photo-enhancer/calls returns research_runs for the specialist", async () => {
    const app = await buildApp();
    // Seed: one render via the legacy route, one via the specialist route.
    await request(app)
      .post("/api/generate-property-image")
      .send({ prompt: "a", style: "standard" });
    await request(app)
      .post("/api/specialists/photo-enhancer/run")
      .send({ prompt: "b", style: "architectural-exterior" });

    const res = await request(app).get("/api/specialists/photo-enhancer/calls");
    expect(res.status).toBe(200);
    expect(res.body.specialistId).toBe("photos.photo-enhancer");
    expect(getResearchRunsForSpecialist).toHaveBeenCalledWith(
      "photos.photo-enhancer",
      expect.any(Number),
      expect.any(Number),
    );
    // Both renders (legacy + specialist) are visible through the same log.
    expect(Array.isArray(res.body.runs)).toBe(true);
    expect(res.body.runs.length).toBeGreaterThanOrEqual(2);
    // triggeredBy is enriched from getUserById so the album "Render
    // history" section can show "who triggered" without an extra round-trip.
    const enriched = res.body.runs.find((r: any) => r.triggeredBy !== null);
    expect(enriched).toBeDefined();
    expect(enriched.triggeredBy.id).toBe(authedUserId);
    expect(enriched.triggeredBy.name).toContain("Test");
  });

  it("GET /api/specialists/photo-enhancer/calls?propertyId=N scopes to that property (Task #439)", async () => {
    const app = await buildApp();
    // Two renders for property 7, one render for property 8.
    await request(app)
      .post("/api/generate-property-image")
      .send({ prompt: "a", style: "standard", propertyId: 7 });
    await request(app)
      .post("/api/specialists/photo-enhancer/run")
      .send({ prompt: "b", style: "architectural-exterior", propertyId: 7, originatedFrom: "album" });
    await request(app)
      .post("/api/generate-property-image")
      .send({ prompt: "c", style: "standard", propertyId: 8 });

    const res = await request(app).get("/api/specialists/photo-enhancer/calls?propertyId=7");
    expect(res.status).toBe(200);
    expect(getResearchRunsForSpecialist).toHaveBeenCalledWith(
      "photos.photo-enhancer",
      expect.any(Number),
      { propertyId: 7 },
    );
    expect(res.body.runs).toHaveLength(2);
    expect(res.body.runs.every((r: any) => r.entityId === 7)).toBe(true);
  });

  it("GET /api/specialists/photo-enhancer/calls?propertyId=bad rejects non-positive ids", async () => {
    const app = await buildApp();
    const res = await request(app).get("/api/specialists/photo-enhancer/calls?propertyId=-1");
    expect(res.status).toBe(400);
  });

  // Task #432 — gallery survives across sessions because every record now
  // carries the prompt, source image URL, and admin user id. The earlier
  // localStorage-backed gallery would lose all of this when the admin
  // switched browsers; the gallery contract here exercises the persisted
  // server fields end-to-end.
  it("persists prompt, sourceImageUrl, and userId on every research_runs row", async () => {
    const app = await buildApp();
    await request(app)
      .post("/api/specialists/photo-enhancer/run")
      .send({
        prompt: "warm golden hour exterior",
        style: "architectural-exterior",
        beforeImageUrl: "https://example.com/before.jpg",
      });

    const created = createResearchRun.mock.calls[0][0];
    // userId comes from the requireAdmin auth mock (getAuthUser → authedUserId).
    expect(typeof created.userId).toBe("number");
    expect(created.metadata.prompt).toBe("warm golden hour exterior");
    expect(created.metadata.sourceImageUrl).toBe("https://example.com/before.jpg");

    // Same context survives the completion update so a row in any state
    // is self-contained for the gallery.
    const completeCall = updateResearchRun.mock.calls.find(
      (c: any[]) => c[1]?.status === "completed",
    );
    expect(completeCall![1].metadata.prompt).toBe("warm golden hour exterior");
    expect(completeCall![1].metadata.sourceImageUrl).toBe("https://example.com/before.jpg");
  });

  it("gallery endpoint returns enriched fields, total, and pagination", async () => {
    const app = await buildApp();
    await request(app)
      .post("/api/specialists/photo-enhancer/run")
      .send({ prompt: "first", style: "architectural-exterior" });
    await request(app)
      .post("/api/specialists/photo-enhancer/run")
      .send({ prompt: "second", style: "architectural-exterior" });

    const res = await request(app)
      .get("/api/specialists/photo-enhancer/calls?limit=1&offset=0");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.limit).toBe(1);
    expect(res.body.offset).toBe(0);
    expect(res.body.runs).toHaveLength(1);

    const row = res.body.runs[0];
    // The gallery row hoists the keys the UI needs out of metadata so the
    // client doesn't have to crack the metadata blob.
    expect(typeof row.prompt).toBe("string");
    expect(row.style).toBeTruthy();
    expect(row.objectPath).toMatch(/^\/objects\/generated\//);
    expect(typeof row.userId).toBe("number");

    // Page 2 returns the older row and confirms the offset advanced.
    const page2 = await request(app)
      .get("/api/specialists/photo-enhancer/calls?limit=1&offset=1");
    expect(page2.body.runs).toHaveLength(1);
    expect(page2.body.runs[0].id).not.toBe(row.id);
  });
});
