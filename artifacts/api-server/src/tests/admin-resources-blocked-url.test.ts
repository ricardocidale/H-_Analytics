/**
 * Task #1238 — Route integration tests: blocked-URL guard on Create and Update
 *
 * The POST /api/admin/resources (Create) and PUT /api/admin/resources/:id
 * (Update) handlers both call validateIngestUrl on config.healthProbe.url.
 * These tests verify that submitting a private/internal/non-http probe URL
 * returns HTTP 400, protecting against SSRF via the admin Resources surface.
 *
 * validateIngestUrl is intentionally NOT mocked — it is the function under
 * test, exercised end-to-end through the real route handler.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import supertest from "supertest";

// ── Hoisted helpers (available inside vi.mock factory functions) ───────────────
const { makeResourceRow } = vi.hoisted(() => {
  function makeResourceRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 1,
      kind: "api",
      slug: "test-resource",
      displayName: "Test Resource",
      description: null,
      config: {},
      secretRef: null,
      version: 1,
      lastHealthStatus: "gray",
      lastCheckedAt: null,
      dailyRequestBudget: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      ...overrides,
    };
  }
  return { makeResourceRow };
});

// ── Module mocks (declared before any imports from those modules) ─────────────

vi.mock("../logger", () => ({
  loggerFor: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../auth", () => ({
  requireAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
  requireSuperAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock("../routes/helpers", () => ({
  logAndSendError: (_res: Response, _msg: string, err: unknown) => {
    (_res as Response).status(500).json({ error: String(err) });
  },
  logActivity: vi.fn(),
  zodErrorMessage: (err: { issues?: Array<{ message: string }> }) =>
    err?.issues?.map((i) => i.message).join("; ") ?? "Validation error",
}));

vi.mock("../storage", () => ({
  storage: {
    listAdminResources: vi.fn().mockResolvedValue([]),
    getAdminResourceById: vi.fn().mockResolvedValue(null),
    getAdminResourceBySlug: vi.fn().mockResolvedValue(null),
    createAdminResource: vi.fn().mockImplementation(() =>
      Promise.resolve(makeResourceRow()),
    ),
    updateAdminResource: vi.fn().mockImplementation(() =>
      Promise.resolve(makeResourceRow({ version: 2 })),
    ),
    rollbackAdminResource: vi.fn().mockImplementation(() =>
      Promise.resolve(makeResourceRow({ version: 3 })),
    ),
    deleteAdminResource: vi.fn().mockResolvedValue(true),
    listAdminResourceVersions: vi.fn().mockResolvedValue([]),
    listResourceImpact: vi.fn().mockResolvedValue([]),
    getResourceHealthView: vi.fn().mockResolvedValue(null),
    listHealthChecksForResource: vi.fn().mockResolvedValue([]),
    isAdminTestRateLimited: vi.fn().mockResolvedValue(false),
    recordProbeResult: vi.fn().mockResolvedValue({ checkedAt: new Date() }),
    listBreakGlassOverrides: vi.fn().mockResolvedValue([]),
    createBreakGlassOverride: vi.fn().mockResolvedValue({}),
    revokeBreakGlassOverride: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock("../jobs/catalog-sync", () => ({
  backfillCatalogConnections: vi.fn().mockResolvedValue(undefined),
  syncSpecialistCatalog: vi.fn().mockResolvedValue({ inserted: 0, updated: 0, removed: 0 }),
}));

vi.mock("../jobs/probes", () => ({
  runProbe: vi.fn().mockResolvedValue({ status: "green", latencyMs: 42 }),
}));

// ── Import route registration (after all mocks) ───────────────────────────────
import { registerAdminResourceRoutes } from "../routes/admin/resources";

// ── Shared test app ───────────────────────────────────────────────────────────
let agent: ReturnType<typeof supertest>;

beforeAll(() => {
  const app = express();
  app.use(express.json());
  // Attach a minimal req.user so handler code that reads req.user!.id doesn't crash.
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (_req as any).user = { id: 99 };
    next();
  });
  registerAdminResourceRoutes(app);
  agent = supertest(app);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Valid base body for POST /api/admin/resources. */
function createBody(overrides: Record<string, unknown> = {}) {
  return {
    kind: "api",
    slug: "test-resource",
    displayName: "Test Resource",
    config: {},
    ...overrides,
  };
}

// ── CREATE: blocked probe URLs ────────────────────────────────────────────────

describe("POST /api/admin/resources — blocked healthProbe.url → 400", () => {
  it("rejects a loopback IPv4 probe URL (127.0.0.1)", async () => {
    const res = await agent
      .post("/api/admin/resources")
      .send(createBody({ config: { healthProbe: { url: "http://127.0.0.1/probe" } } }));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/healthProbe\.url is invalid/i);
    expect(res.body.error).toMatch(/private or internal/i);
  });

  it("rejects a localhost probe URL", async () => {
    const res = await agent
      .post("/api/admin/resources")
      .send(createBody({ config: { healthProbe: { url: "http://localhost/check" } } }));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/healthProbe\.url is invalid/i);
  });

  it("rejects a private Class-C subnet probe URL (192.168.x.x)", async () => {
    const res = await agent
      .post("/api/admin/resources")
      .send(createBody({ config: { healthProbe: { url: "http://192.168.1.1/check" } } }));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/healthProbe\.url is invalid/i);
    expect(res.body.error).toMatch(/private or internal/i);
  });

  it("rejects a private Class-A subnet probe URL (10.x.x.x)", async () => {
    const res = await agent
      .post("/api/admin/resources")
      .send(createBody({ config: { healthProbe: { url: "http://10.0.0.1/internal" } } }));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/healthProbe\.url is invalid/i);
  });

  it("rejects a private Class-B subnet probe URL (172.16.x.x)", async () => {
    const res = await agent
      .post("/api/admin/resources")
      .send(createBody({ config: { healthProbe: { url: "http://172.16.0.1/meta" } } }));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/healthProbe\.url is invalid/i);
  });

  it("rejects a link-local probe URL (169.254.x.x — AWS metadata endpoint)", async () => {
    const res = await agent
      .post("/api/admin/resources")
      .send(createBody({ config: { healthProbe: { url: "http://169.254.169.254/latest/meta-data/" } } }));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/healthProbe\.url is invalid/i);
  });

  it("rejects a non-http scheme probe URL (file://)", async () => {
    const res = await agent
      .post("/api/admin/resources")
      .send(createBody({ config: { healthProbe: { url: "file:///etc/passwd" } } }));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/healthProbe\.url is invalid/i);
  });

  it("rejects a non-http scheme probe URL (ftp://)", async () => {
    const res = await agent
      .post("/api/admin/resources")
      .send(createBody({ config: { healthProbe: { url: "ftp://example.com/data" } } }));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/healthProbe\.url is invalid/i);
    expect(res.body.error).toMatch(/Unsupported URL scheme/i);
  });

  it("allows a legitimate public HTTPS probe URL", async () => {
    const res = await agent
      .post("/api/admin/resources")
      .send(createBody({ config: { healthProbe: { url: "https://api.example.com/health" } } }));

    // The route proceeds past the URL check; storage mock returns a created row.
    expect(res.status).toBe(201);
  });

  it("allows no healthProbe in config (probe URL is optional)", async () => {
    const res = await agent
      .post("/api/admin/resources")
      .send(createBody({ config: { someOtherKey: "value" } }));

    expect(res.status).toBe(201);
  });
});

// ── UPDATE: blocked probe URLs ────────────────────────────────────────────────

describe("PUT /api/admin/resources/:id — blocked healthProbe.url → 400", () => {
  it("rejects a loopback IPv4 probe URL (127.0.0.1)", async () => {
    const res = await agent
      .put("/api/admin/resources/1")
      .send({ config: { healthProbe: { url: "http://127.0.0.1/probe" } } });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/healthProbe\.url is invalid/i);
    expect(res.body.error).toMatch(/private or internal/i);
  });

  it("rejects a localhost probe URL", async () => {
    const res = await agent
      .put("/api/admin/resources/1")
      .send({ config: { healthProbe: { url: "http://localhost/check" } } });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/healthProbe\.url is invalid/i);
  });

  it("rejects a private Class-C subnet probe URL (192.168.x.x)", async () => {
    const res = await agent
      .put("/api/admin/resources/1")
      .send({ config: { healthProbe: { url: "http://192.168.1.1/check" } } });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/healthProbe\.url is invalid/i);
  });

  it("rejects a link-local probe URL (169.254.x.x — AWS metadata endpoint)", async () => {
    const res = await agent
      .put("/api/admin/resources/1")
      .send({ config: { healthProbe: { url: "http://169.254.169.254/latest/meta-data/" } } });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/healthProbe\.url is invalid/i);
  });

  it("rejects a non-http scheme probe URL (file://)", async () => {
    const res = await agent
      .put("/api/admin/resources/1")
      .send({ config: { healthProbe: { url: "file:///etc/hosts" } } });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/healthProbe\.url is invalid/i);
  });

  it("allows a legitimate public HTTPS probe URL", async () => {
    const res = await agent
      .put("/api/admin/resources/1")
      .send({ config: { healthProbe: { url: "https://api.example.com/health" } } });

    // Storage mock returns an updated row + empty impact list.
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("resource");
    expect(res.body).toHaveProperty("impact");
  });

  it("allows an update with no config (no URL to validate)", async () => {
    const res = await agent
      .put("/api/admin/resources/1")
      .send({ displayName: "Renamed Resource" });

    expect(res.status).toBe(200);
  });
});

// ── ROLLBACK: schema validation → 400 ────────────────────────────────────────
// The rollback handler restores a past version snapshot and does not accept
// fresh config input, so there is no healthProbe.url to validate. These tests
// confirm the handler's own 400 path (malformed body) is exercised.

describe("POST /api/admin/resources/:id/rollback — schema validation → 400", () => {
  it("returns 400 when targetVersion is missing", async () => {
    const res = await agent
      .post("/api/admin/resources/1/rollback")
      .send({});

    expect(res.status).toBe(400);
  });

  it("returns 400 when targetVersion is not a positive integer (0)", async () => {
    const res = await agent
      .post("/api/admin/resources/1/rollback")
      .send({ targetVersion: 0 });

    expect(res.status).toBe(400);
  });

  it("returns 400 when targetVersion is a float", async () => {
    const res = await agent
      .post("/api/admin/resources/1/rollback")
      .send({ targetVersion: 1.5 });

    expect(res.status).toBe(400);
  });

  it("returns 200 when targetVersion is a valid positive integer", async () => {
    const res = await agent
      .post("/api/admin/resources/1/rollback")
      .send({ targetVersion: 2 });

    expect(res.status).toBe(200);
  });
});
