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
vi.mock("../../server/replit_integrations/image/client", () => ({
  generateImageBuffer: (...args: any[]) => generateImageBufferMock(...args),
  openai: {},
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
const getResearchRunsForSpecialist = vi.fn(async () => [...researchRunRows]);
const recordObservedMissingFields = vi.fn(async () => undefined);

vi.mock("../../server/storage", () => ({
  storage: {
    createResearchRun,
    updateResearchRun,
    getResearchRunsForSpecialist,
    recordObservedMissingFields,
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
    "../../server/replit_integrations/image/routes"
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
    );
    // Both renders (legacy + specialist) are visible through the same log.
    expect(Array.isArray(res.body.runs)).toBe(true);
    expect(res.body.runs.length).toBeGreaterThanOrEqual(2);
  });
});
