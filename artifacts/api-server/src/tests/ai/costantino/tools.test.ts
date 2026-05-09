/**
 * Unit tests for Costantino's SSRF guard in probe_integration_endpoint.
 *
 * These tests verify that `toolProbeIntegrationEndpoint` (reached via
 * `dispatchCostantinoTool`) calls `validateIngestUrl()` before any outbound
 * fetch and returns { status: "fail", errorCode: "BLOCKED_URL" } for every
 * private/internal/non-http URL the function under test guards against.
 *
 * The database is fully stubbed so no live DB connection is required.
 * The fetch override seam (`setCostantinoFetchOverride`) is set to a spy so
 * that tests can assert fetch was never called when a URL is blocked.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mock handles — vi.hoisted() runs before vi.mock() factories,
// so these variables are safely usable inside the factory closures below
// without any `any` cast or module re-import tricks.
// ---------------------------------------------------------------------------

const { limitMock } = vi.hoisted(() => ({
  limitMock: vi.fn(async (): Promise<unknown[]> => []),
}));

// ---------------------------------------------------------------------------
// Module mocks — hoisted before any imports that load the mocked modules.
// ---------------------------------------------------------------------------

vi.mock("../../../db", () => {
  const whereMock = vi.fn(() => ({ limit: limitMock }));
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));
  const poolStub = { query: vi.fn(), connect: vi.fn(), end: vi.fn() };

  return {
    db: { select: selectMock },
    pool: poolStub,
  };
});

vi.mock("@workspace/db", () => ({
  adminResources: {},
  costantinoFindings: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: unknown, _val: unknown) => ({ type: "eq" })),
  and: vi.fn((...args: unknown[]) => ({ type: "and", args })),
  isNull: vi.fn((_col: unknown) => ({ type: "isNull" })),
  desc: vi.fn((_col: unknown) => ({ type: "desc" })),
  inArray: vi.fn((_col: unknown, _vals: unknown) => ({ type: "inArray" })),
  sql: Object.assign(vi.fn((_s: unknown) => ({ type: "sql" })), {
    raw: vi.fn((_s: unknown) => ({ type: "sql.raw" })),
  }),
}));

vi.mock("../../../storage", () => ({
  storage: {
    recordProbeResult: vi.fn(async () => ({ id: "fake-probe-id" })),
  },
}));

vi.mock("../../../ai/costantino/workspace", () => ({
  writeCostantinoHealth: vi.fn(async () => undefined),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  dispatchCostantinoTool,
  makeEmptyMetrics,
  setCostantinoFetchOverride,
} from "../../../ai/costantino/tools";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAdminResourceRow(probeUrl: string) {
  return {
    id: 1,
    slug: "test-resource",
    kind: "api",
    displayName: "Test Resource",
    lastHealthStatus: null,
    lastCheckedAt: null,
    config: {
      healthProbe: {
        method: "GET",
        url: probeUrl,
        expectStatus: 200,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// SSRF guard tests — probe_integration_endpoint
// ---------------------------------------------------------------------------

describe("probe_integration_endpoint — SSRF guard via dispatchCostantinoTool", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn(async () => new Response("ok", { status: 200 }));
    setCostantinoFetchOverride(fetchSpy);
  });

  afterEach(() => {
    setCostantinoFetchOverride(null);
    vi.clearAllMocks();
  });

  // ── link-local (IMDS / AWS metadata endpoint) ───────────────────────────

  it("blocks link-local SSRF target (169.254.169.254) and does NOT call fetch", async () => {
    const blockedUrl = "http://169.254.169.254/latest/meta-data";
    limitMock.mockResolvedValueOnce([makeAdminResourceRow(blockedUrl)]);

    const metrics = makeEmptyMetrics();
    const result = await dispatchCostantinoTool(
      "probe_integration_endpoint",
      { slug: "test-resource" },
      metrics,
    ) as Record<string, unknown>;

    expect(result.status).toBe("fail");
    expect(result.errorCode).toBe("BLOCKED_URL");
    expect(typeof result.errorMessage).toBe("string");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(metrics.probesFailed).toBe(1);
    expect(metrics.probesOk).toBe(0);
  });

  // ── RFC-1918 private range (10.x.x.x) ───────────────────────────────────

  it("blocks RFC-1918 address (10.0.0.1) and does NOT call fetch", async () => {
    const blockedUrl = "http://10.0.0.1/internal/api";
    limitMock.mockResolvedValueOnce([makeAdminResourceRow(blockedUrl)]);

    const metrics = makeEmptyMetrics();
    const result = await dispatchCostantinoTool(
      "probe_integration_endpoint",
      { slug: "test-resource" },
      metrics,
    ) as Record<string, unknown>;

    expect(result.status).toBe("fail");
    expect(result.errorCode).toBe("BLOCKED_URL");
    expect(typeof result.errorMessage).toBe("string");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(metrics.probesFailed).toBe(1);
  });

  // ── RFC-1918 private range (192.168.x.x) ────────────────────────────────

  it("blocks RFC-1918 address (192.168.1.1) and does NOT call fetch", async () => {
    const blockedUrl = "http://192.168.1.1/admin";
    limitMock.mockResolvedValueOnce([makeAdminResourceRow(blockedUrl)]);

    const metrics = makeEmptyMetrics();
    const result = await dispatchCostantinoTool(
      "probe_integration_endpoint",
      { slug: "test-resource" },
      metrics,
    ) as Record<string, unknown>;

    expect(result.status).toBe("fail");
    expect(result.errorCode).toBe("BLOCKED_URL");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // ── RFC-1918 private range (172.16.x.x – 172.31.x.x) ───────────────────

  it("blocks RFC-1918 address (172.16.0.1) and does NOT call fetch", async () => {
    const blockedUrl = "http://172.16.0.1/secret";
    limitMock.mockResolvedValueOnce([makeAdminResourceRow(blockedUrl)]);

    const metrics = makeEmptyMetrics();
    const result = await dispatchCostantinoTool(
      "probe_integration_endpoint",
      { slug: "test-resource" },
      metrics,
    ) as Record<string, unknown>;

    expect(result.status).toBe("fail");
    expect(result.errorCode).toBe("BLOCKED_URL");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // ── loopback ─────────────────────────────────────────────────────────────

  it("blocks loopback address (127.0.0.1) and does NOT call fetch", async () => {
    const blockedUrl = "http://127.0.0.1:8080/internal";
    limitMock.mockResolvedValueOnce([makeAdminResourceRow(blockedUrl)]);

    const metrics = makeEmptyMetrics();
    const result = await dispatchCostantinoTool(
      "probe_integration_endpoint",
      { slug: "test-resource" },
      metrics,
    ) as Record<string, unknown>;

    expect(result.status).toBe("fail");
    expect(result.errorCode).toBe("BLOCKED_URL");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks localhost and does NOT call fetch", async () => {
    const blockedUrl = "http://localhost/api/health";
    limitMock.mockResolvedValueOnce([makeAdminResourceRow(blockedUrl)]);

    const metrics = makeEmptyMetrics();
    const result = await dispatchCostantinoTool(
      "probe_integration_endpoint",
      { slug: "test-resource" },
      metrics,
    ) as Record<string, unknown>;

    expect(result.status).toBe("fail");
    expect(result.errorCode).toBe("BLOCKED_URL");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // ── non-http scheme ──────────────────────────────────────────────────────

  it("blocks non-http scheme (ftp://) and does NOT call fetch", async () => {
    const blockedUrl = "ftp://evil.example.com/payload";
    limitMock.mockResolvedValueOnce([makeAdminResourceRow(blockedUrl)]);

    const metrics = makeEmptyMetrics();
    const result = await dispatchCostantinoTool(
      "probe_integration_endpoint",
      { slug: "test-resource" },
      metrics,
    ) as Record<string, unknown>;

    expect(result.status).toBe("fail");
    expect(result.errorCode).toBe("BLOCKED_URL");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks non-http scheme (file://) and does NOT call fetch", async () => {
    const blockedUrl = "file:///etc/passwd";
    limitMock.mockResolvedValueOnce([makeAdminResourceRow(blockedUrl)]);

    const metrics = makeEmptyMetrics();
    const result = await dispatchCostantinoTool(
      "probe_integration_endpoint",
      { slug: "test-resource" },
      metrics,
    ) as Record<string, unknown>;

    expect(result.status).toBe("fail");
    expect(result.errorCode).toBe("BLOCKED_URL");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // ── sanity check: valid public URL is NOT blocked ────────────────────────

  it("allows a legitimate public https URL and calls fetch", async () => {
    const publicUrl = "https://api.example.com/health";
    limitMock.mockResolvedValueOnce([makeAdminResourceRow(publicUrl)]);

    const metrics = makeEmptyMetrics();
    const result = await dispatchCostantinoTool(
      "probe_integration_endpoint",
      { slug: "test-resource" },
      metrics,
    ) as Record<string, unknown>;

    expect(result.status).toBe("ok");
    expect(result.errorCode).toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(metrics.probesOk).toBe(1);
    expect(metrics.probesFailed).toBe(0);
  });

  // ── missing resource guard (should not reach SSRF check) ────────────────

  it("returns error object when slug is not found in DB", async () => {
    limitMock.mockResolvedValueOnce([]);

    const metrics = makeEmptyMetrics();
    const result = await dispatchCostantinoTool(
      "probe_integration_endpoint",
      { slug: "nonexistent-slug" },
      metrics,
    ) as Record<string, unknown>;

    expect(result).toHaveProperty("error");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
