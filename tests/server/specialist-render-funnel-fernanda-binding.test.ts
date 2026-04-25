/**
 * Task #460 — Lock the render pipeline to Fernanda with a regression test.
 *
 * Phase 2a folded the standalone "Photos & Renders" Specialist into
 * Fernanda. The render route handler at
 * `server/routes/specialist-photo-enhancer.ts` is now bound to
 * `SPECIALIST_ID = "photos.photo-enhancer"` (Fernanda's catalog id), and
 * every render — both the per-album button and the standalone console —
 * is stamped into `research_runs.metadata.specialistId` with that value
 * so the call log routes to the right Specialist page.
 *
 * If `PHOTO_ENHANCER_SPECIALIST_ID` ever drifts away from Fernanda's
 * catalog id (rename, typo, accidental copy/paste from a sibling
 * Specialist), the route would silently start writing rows that no
 * Specialist surface displays — corrupting Fernanda's audit trail.
 *
 * The existing `specialist-render-funnel-routes.test.ts` mocks the
 * catalog module to keep that suite hermetic, so it cannot detect
 * drift between the constant and the real catalog. This file
 * deliberately leaves the catalog UN-mocked and pins the binding
 * end-to-end:
 *
 *   1. The catalog still has an entry whose id is exactly
 *      `PHOTO_ENHANCER_SPECIALIST_ID` and whose humanName is "Fernanda".
 *   2. Hitting POST /api/specialists/photo-enhancer/run persists a
 *      research_runs row whose metadata.specialistId equals the
 *      catalog's Fernanda id.
 *   3. GET /api/specialists/photo-enhancer/calls returns
 *      `specialistId` equal to the catalog's Fernanda id and only
 *      includes runs tagged with that id.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
// NOTE: `PHOTO_ENHANCER_SPECIALIST_ID` and the catalog are imported
// dynamically inside the test cases. The pipeline module pulls in
// `../../server/storage`, and importing it at the top level would
// trigger the storage `vi.mock` factory before the mock helpers
// declared below have been initialized (vi.mock is hoisted).

// ─── Auth + rate-limit mock ──────────────────────────────────────────────────

const rateLimitState = { limited: false };
const authedUserId = 11;

vi.mock("../../server/auth", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
  requireAdmin: (_req: any, _res: any, next: any) => next(),
  getAuthUser: (_req: any) => ({ id: authedUserId, role: "admin" }),
  isApiRateLimited: (_userId: number, _key: string, _limit: number) =>
    rateLimitState.limited,
}));

// ─── Replicate + OpenAI mocks (no network) ───────────────────────────────────

const replicateGen = vi.fn(async () => Buffer.from("replicate-img"));
vi.mock("../../server/integrations/replicate", () => ({
  replicateService: { generateImage: (...args: any[]) => replicateGen(...args) },
  isStyleEnabled: async () => true,
  getDefaultImageSize: async () => "1024x1024",
  getAdminRateLimit: async () => 10,
  getAvailableStylesFromDb: async () => [],
}));

const generateImageBufferMock = vi.fn(async () => Buffer.from("openai-img"));
vi.mock("../../server/image/client", () => ({
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
  userId?: number | null;
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
    userId: input.userId ?? null,
  };
  researchRunRows.push(row);
  return row;
});

const updateResearchRun = vi.fn(async (id: number, patch: any) => {
  const row = researchRunRows.find((r) => r.id === id);
  if (row) Object.assign(row, patch);
  return row;
});

// Mirror the production filter: research_runs are filtered by
// `metadata->>'specialistId'`. Replicating that contract here means
// the test verifies the route delegates with the right id AND the
// returned rows actually carry it.
const getResearchRunsForSpecialist = vi.fn(
  async (specialistId: string, limit = 50, offset = 0): Promise<FakeRun[]> => {
    return researchRunRows
      .filter((r) => r.metadata?.specialistId === specialistId)
      .slice()
      .reverse()
      .slice(offset, offset + limit);
  },
);

const countResearchRunsForSpecialist = vi.fn(
  async (specialistId: string): Promise<number> => {
    return researchRunRows.filter(
      (r) => r.metadata?.specialistId === specialistId,
    ).length;
  },
);

const getSpecialistConfig = vi.fn(async () => null);
const getUserById = vi.fn(async (_id: number) => null);
const recordObservedMissingFields = vi.fn(async () => undefined);

vi.mock("../../server/storage", () => ({
  storage: {
    createResearchRun,
    updateResearchRun,
    getResearchRunsForSpecialist,
    countResearchRunsForSpecialist,
    getSpecialistConfig,
    getUserById,
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

vi.mock("../../server/ai/resolve-llm", () => ({
  resolveLlm: async () => ({}),
  getVendorService: () => ({}),
}));

// NOTE: We deliberately do NOT mock
// `../../engine/analyst/registry/specialist-catalog`. The whole point
// of this regression test is to assert the route's SPECIALIST_ID still
// resolves to a real Fernanda entry in the catalog.

async function buildApp(): Promise<Express> {
  const { register } = await import(
    "../../server/routes/specialist-photo-enhancer"
  );
  const app = express();
  app.use(express.json());
  register(app);
  return app;
}

beforeEach(() => {
  rateLimitState.limited = false;
  researchRunRows.length = 0;
  nextRunId = 1;
  replicateGen.mockClear();
  generateImageBufferMock.mockClear();
  uploadBufferMock.mockClear();
  createResearchRun.mockClear();
  updateResearchRun.mockClear();
  getResearchRunsForSpecialist.mockClear();
  countResearchRunsForSpecialist.mockClear();
  getSpecialistConfig.mockClear();
  getUserById.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("Render funnel ↔ Fernanda binding (regression test for Task #460)", () => {
  it("the catalog still has a Fernanda entry whose id matches PHOTO_ENHANCER_SPECIALIST_ID", async () => {
    const { SPECIALIST_CATALOG, getSpecialistById } = await import(
      "../../engine/analyst/registry/specialist-catalog"
    );
    const { PHOTO_ENHANCER_SPECIALIST_ID } = await import(
      "../../server/services/photo-enhancer-pipeline"
    );

    // Catalog lookup by the constant the route uses — if the constant
    // drifts from the catalog id, this returns undefined and the
    // assertion fails loudly.
    const fernanda = getSpecialistById(PHOTO_ENHANCER_SPECIALIST_ID);
    expect(fernanda).toBeDefined();
    expect(fernanda!.humanName).toBe("Fernanda");
    expect(fernanda!.subject).toBe("photos");

    // And the catalog entry whose humanName is "Fernanda" is the same
    // one the constant points at — so the doctrine "Fernanda owns the
    // render pipeline" can't be satisfied by accidentally creating a
    // second Fernanda entry under a different id.
    const fernandaByName = SPECIALIST_CATALOG.filter(
      (d) => d.humanName === "Fernanda",
    );
    expect(fernandaByName).toHaveLength(1);
    expect(fernandaByName[0]!.id).toBe(PHOTO_ENHANCER_SPECIALIST_ID);
  });

  it("POST /api/specialists/photo-enhancer/run persists rows under Fernanda's catalog id", async () => {
    const app = await buildApp();
    const { getSpecialistById } = await import(
      "../../engine/analyst/registry/specialist-catalog"
    );
    const { PHOTO_ENHANCER_SPECIALIST_ID } = await import(
      "../../server/services/photo-enhancer-pipeline"
    );
    const propertyId = 314;

    const res = await request(app)
      .post("/api/specialists/photo-enhancer/run")
      .send({
        prompt: "twilight exterior",
        style: "architectural-exterior",
        propertyId,
        originatedFrom: "album",
      });

    expect(res.status).toBe(200);
    expect(createResearchRun).toHaveBeenCalledTimes(1);

    const created = createResearchRun.mock.calls[0][0];
    const fernandaId = getSpecialistById(PHOTO_ENHANCER_SPECIALIST_ID)!.id;

    // The persisted specialistId is exactly Fernanda's catalog id —
    // not a stale literal, not a different Specialist's id.
    expect(created.metadata.specialistId).toBe(fernandaId);
    expect(created.metadata.specialistId).toBe("photos.photo-enhancer");

    // The completion patch carries the same id, so a row read mid-run
    // and a row read after-run both route to Fernanda's surfaces.
    const completed = updateResearchRun.mock.calls.find(
      (c: any[]) => c[1]?.status === "completed",
    );
    expect(completed).toBeDefined();
    expect(completed![1].metadata.specialistId).toBe(fernandaId);
  });

  it("GET /api/specialists/photo-enhancer/calls reports Fernanda's catalog id and only her runs", async () => {
    const app = await buildApp();
    const { getSpecialistById } = await import(
      "../../engine/analyst/registry/specialist-catalog"
    );
    const { PHOTO_ENHANCER_SPECIALIST_ID } = await import(
      "../../server/services/photo-enhancer-pipeline"
    );

    // Seed a foreign run that another Specialist would have produced —
    // the calls endpoint must not leak it.
    researchRunRows.push({
      id: nextRunId++,
      entityType: "property",
      entityId: 1,
      status: "completed",
      modelPrimary: "openai:gpt-5",
      startedAt: new Date(),
      completedAt: new Date(),
      durationMs: 50,
      error: null,
      metadata: { specialistId: "macro.industry-analyst" },
    });

    // Drive a real render through the funnel — that one belongs to
    // Fernanda and should be the only row returned.
    const runRes = await request(app)
      .post("/api/specialists/photo-enhancer/run")
      .send({ prompt: "x", style: "architectural-exterior", propertyId: 9 });
    expect(runRes.status).toBe(200);

    const callsRes = await request(app).get(
      "/api/specialists/photo-enhancer/calls",
    );
    expect(callsRes.status).toBe(200);

    const fernandaId = getSpecialistById(PHOTO_ENHANCER_SPECIALIST_ID)!.id;

    // The endpoint advertises Fernanda's id back to the client.
    expect(callsRes.body.specialistId).toBe(fernandaId);
    expect(callsRes.body.specialistId).toBe("photos.photo-enhancer");

    // Storage was queried with Fernanda's id — not a stale or
    // hard-coded sibling id.
    expect(getResearchRunsForSpecialist).toHaveBeenCalledWith(
      fernandaId,
      expect.any(Number),
      expect.any(Number),
    );
    expect(countResearchRunsForSpecialist).toHaveBeenCalledWith(fernandaId);

    // And the foreign run did not bleed through.
    expect(callsRes.body.runs.length).toBe(1);
    expect(callsRes.body.runs[0].metadata.specialistId).toBe(fernandaId);
    expect(callsRes.body.runs[0].entityId).toBe(9);
  });
});
