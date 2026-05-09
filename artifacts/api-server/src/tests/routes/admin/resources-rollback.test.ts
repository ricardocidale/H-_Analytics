/**
 * Unit tests for the rollback route health-probe URL validation.
 *
 * POST /api/admin/resources/:id/rollback
 *
 * These tests guard against regressions where someone removes the
 * `validateIngestUrl` check from the rollback handler, allowing a stored
 * historical version that contains a private/internal health-probe URL to be
 * re-applied without any guard.
 *
 * All DB, auth, and logger dependencies are mocked — no live connection
 * required.
 */

import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import supertest from "supertest";

// ---------------------------------------------------------------------------
// Hoisted mock handles
// ---------------------------------------------------------------------------

const {
  mockGetAdminResourceVersion,
  mockRollbackAdminResource,
  mockLogActivity,
} = vi.hoisted(() => ({
  mockGetAdminResourceVersion: vi.fn(),
  mockRollbackAdminResource: vi.fn(),
  mockLogActivity: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("../../../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../../auth", () => ({
  requireAdmin: (req: Request, _res: Response, next: NextFunction) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any).user = { id: 99 };
    next();
  },
  requireSuperAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock("../../../routes/helpers", () => ({
  logAndSendError: (_res: Response, _msg: string, err: unknown) => {
    (_res as Response).status(500).json({ error: String(err) });
  },
  logActivity: (...args: unknown[]) => mockLogActivity(...args),
  zodErrorMessage: (err: unknown) => String(err),
}));

vi.mock("../../../storage", () => ({
  storage: {
    getAdminResourceVersion: (...args: unknown[]) => mockGetAdminResourceVersion(...args),
    rollbackAdminResource: (...args: unknown[]) => mockRollbackAdminResource(...args),
    listBreakGlassOverrides: vi.fn().mockResolvedValue([]),
    createBreakGlassOverride: vi.fn(),
    revokeBreakGlassOverride: vi.fn(),
  },
}));

vi.mock("@workspace/db", () => ({
  ResourceKindSchema: { optional: vi.fn() },
  ResourceSlugSchema: {},
  insertAdminResourceSchema: { safeParse: vi.fn() },
  toResourcePublicView: (row: unknown) => row,
}));

vi.mock("../../../jobs/catalog-sync", () => ({
  backfillCatalogConnections: vi.fn().mockResolvedValue(undefined),
  syncSpecialistCatalog: vi.fn().mockResolvedValue({ inserted: 0, updated: 0, removed: 0 }),
}));

vi.mock("../../../jobs/probes", () => ({
  runProbe: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Build test app — register only the rollback route
// ---------------------------------------------------------------------------

import { registerAdminResourceRoutes } from "../../../routes/admin/resources";

let agent: ReturnType<typeof supertest>;

beforeAll(() => {
  const app = express();
  app.use(express.json());
  registerAdminResourceRoutes(app);
  agent = supertest(app);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVersionSnapshot(probeUrl?: string) {
  return {
    id: 1,
    resourceId: 42,
    version: 2,
    displayName: "Test Resource",
    description: null,
    config: probeUrl
      ? { healthProbe: { method: "GET", url: probeUrl, expectStatus: 200 } }
      : {},
    secretRef: null,
    changeSummary: "initial",
    changedByUserId: 1,
    changedAt: new Date("2024-01-01T00:00:00Z"),
  };
}

function makeResourceRow() {
  return {
    id: 42,
    kind: "api",
    slug: "some-resource",
    displayName: "Test Resource",
    description: null,
    config: {},
    secretRef: null,
    version: 3,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-02T00:00:00Z"),
    createdByUserId: 1,
    updatedByUserId: 99,
    lastHealthStatus: null,
    lastCheckedAt: null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/admin/resources/:id/rollback — health-probe URL blocking", () => {
  // ── Blocked: private/internal health-probe URL ───────────────────────────

  it("returns 400 when the target version has a loopback health-probe URL", async () => {
    mockGetAdminResourceVersion.mockResolvedValueOnce(
      makeVersionSnapshot("http://127.0.0.1:8080/internal"),
    );

    const res = await agent
      .post("/api/admin/resources/42/rollback")
      .send({ targetVersion: 2 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/blocked/i);
    expect(res.body.error).toMatch(/v2/);
    expect(mockRollbackAdminResource).not.toHaveBeenCalled();
  });

  it("returns 400 when the target version has a localhost health-probe URL", async () => {
    mockGetAdminResourceVersion.mockResolvedValueOnce(
      makeVersionSnapshot("http://localhost/api/health"),
    );

    const res = await agent
      .post("/api/admin/resources/42/rollback")
      .send({ targetVersion: 2 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/blocked/i);
    expect(mockRollbackAdminResource).not.toHaveBeenCalled();
  });

  it("returns 400 when the target version has an RFC-1918 (10.x) health-probe URL", async () => {
    mockGetAdminResourceVersion.mockResolvedValueOnce(
      makeVersionSnapshot("http://10.0.0.1/admin"),
    );

    const res = await agent
      .post("/api/admin/resources/42/rollback")
      .send({ targetVersion: 2 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/blocked/i);
    expect(mockRollbackAdminResource).not.toHaveBeenCalled();
  });

  it("returns 400 when the target version has a link-local (169.254.x) health-probe URL", async () => {
    mockGetAdminResourceVersion.mockResolvedValueOnce(
      makeVersionSnapshot("http://169.254.169.254/latest/meta-data"),
    );

    const res = await agent
      .post("/api/admin/resources/42/rollback")
      .send({ targetVersion: 2 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/blocked/i);
    expect(mockRollbackAdminResource).not.toHaveBeenCalled();
  });

  it("returns 400 when the target version has a non-http scheme (ftp://) in the health-probe URL", async () => {
    mockGetAdminResourceVersion.mockResolvedValueOnce(
      makeVersionSnapshot("ftp://evil.example.com/payload"),
    );

    const res = await agent
      .post("/api/admin/resources/42/rollback")
      .send({ targetVersion: 2 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/blocked/i);
    expect(mockRollbackAdminResource).not.toHaveBeenCalled();
  });

  // ── Allowed: valid public URL proceeds normally ──────────────────────────

  it("returns 200 and calls rollback when the target version has a valid public https URL", async () => {
    mockGetAdminResourceVersion.mockResolvedValueOnce(
      makeVersionSnapshot("https://api.example.com/health"),
    );
    mockRollbackAdminResource.mockResolvedValueOnce(makeResourceRow());

    const res = await agent
      .post("/api/admin/resources/42/rollback")
      .send({ targetVersion: 2 });

    expect(res.status).toBe(200);
    expect(mockRollbackAdminResource).toHaveBeenCalledOnce();
    expect(mockRollbackAdminResource).toHaveBeenCalledWith(42, 2, 99);
    expect(mockLogActivity).toHaveBeenCalledOnce();
  });

  it("returns 200 and calls rollback when the target version has no health-probe config", async () => {
    mockGetAdminResourceVersion.mockResolvedValueOnce(makeVersionSnapshot());
    mockRollbackAdminResource.mockResolvedValueOnce(makeResourceRow());

    const res = await agent
      .post("/api/admin/resources/42/rollback")
      .send({ targetVersion: 2 });

    expect(res.status).toBe(200);
    expect(mockRollbackAdminResource).toHaveBeenCalledOnce();
  });

  // ── Not found: non-existent version ─────────────────────────────────────

  it("returns 404 when the target version does not exist", async () => {
    mockGetAdminResourceVersion.mockResolvedValueOnce(undefined);

    const res = await agent
      .post("/api/admin/resources/42/rollback")
      .send({ targetVersion: 99 });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
    expect(mockRollbackAdminResource).not.toHaveBeenCalled();
  });

  // ── Validation: malformed request body ──────────────────────────────────

  it("returns 400 for a missing targetVersion in the request body", async () => {
    const res = await agent
      .post("/api/admin/resources/42/rollback")
      .send({});

    expect(res.status).toBe(400);
    expect(mockGetAdminResourceVersion).not.toHaveBeenCalled();
    expect(mockRollbackAdminResource).not.toHaveBeenCalled();
  });
});
