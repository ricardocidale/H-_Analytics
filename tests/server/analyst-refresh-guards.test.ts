/**
 * Tests for the seven guard middlewares that protect the Analyst Tables
 * refresh endpoint. Each guard is unit-tested in isolation against a mocked
 * req/res so we don't need to spin up the express app.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  requireAdminGuard,
  csrfTokenGuard,
  perAdminRateLimitGuard,
  allowListGuard,
  singleFlightGuard,
  auditPrepareGuard,
  suspiciousActivityTracker,
  clearGuardState,
  acquireInFlight,
} from "../../server/middleware/analyst-refresh-guards";
import { UserRole } from "../../shared/constants";

vi.mock("../../server/storage", () => ({
  storage: {
    countAnalystRefreshAttempts: vi.fn(async () => 0),
    createAnalystRefreshAuditLog: vi.fn(async () => ({ id: 42 })),
    updateAnalystRefreshSettings: vi.fn(async () => ({})),
  },
}));

import { storage } from "../../server/storage";

function mockRes() {
  const res: any = { locals: {} };
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn().mockReturnValue(res);
  res.on = vi.fn();
  return res;
}

beforeEach(() => {
  clearGuardState();
  vi.clearAllMocks();
  (storage.countAnalystRefreshAttempts as any).mockResolvedValue(0);
  (storage.createAnalystRefreshAuditLog as any).mockResolvedValue({ id: 42 });
});

describe("Guard 1: requireAdminGuard", () => {
  it("rejects unauthenticated users with 401", () => {
    const res = mockRes();
    const next = vi.fn();
    requireAdminGuard({} as any, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
  it("rejects non-admin users with 403", () => {
    const res = mockRes();
    const next = vi.fn();
    requireAdminGuard({ user: { role: UserRole.USER } } as any, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
  it("calls next() for admin users", () => {
    const res = mockRes();
    const next = vi.fn();
    requireAdminGuard({ user: { role: UserRole.ADMIN } } as any, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe("Guard 2: csrfTokenGuard", () => {
  it("rejects missing csrf header with 403", () => {
    const res = mockRes();
    const next = vi.fn();
    csrfTokenGuard({ headers: {} } as any, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
  it("rejects mismatched header vs cookie with 403", () => {
    const res = mockRes();
    const next = vi.fn();
    csrfTokenGuard({
      headers: { "x-csrf-token": "abc", cookie: "session_id=xyz" },
    } as any, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
  it("allows matching header + cookie", () => {
    const res = mockRes();
    const next = vi.fn();
    csrfTokenGuard({
      headers: { "x-csrf-token": "match", cookie: "session_id=match" },
    } as any, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe("Guard 3: perAdminRateLimitGuard", () => {
  it("rejects after 10 attempts with 429", async () => {
    (storage.countAnalystRefreshAttempts as any).mockResolvedValue(10);
    const res = mockRes();
    const next = vi.fn();
    await perAdminRateLimitGuard({ user: { id: 1 } } as any, res, next);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.setHeader).toHaveBeenCalledWith("Retry-After", "3600");
    expect(next).not.toHaveBeenCalled();
  });
  it("passes through under the limit", async () => {
    (storage.countAnalystRefreshAttempts as any).mockResolvedValue(3);
    const res = mockRes();
    const next = vi.fn();
    await perAdminRateLimitGuard({ user: { id: 1 } } as any, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe("Guard 4: allowListGuard", () => {
  it("rejects unknown table ids with 400", () => {
    const res = mockRes();
    const next = vi.fn();
    allowListGuard({ params: { id: "drop_users" } } as any, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it("accepts capital_raise_benchmarks", () => {
    const res = mockRes();
    const next = vi.fn();
    allowListGuard({ params: { id: "capital_raise_benchmarks" } } as any, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe("Guard 5: singleFlightGuard", () => {
  it("rejects a second concurrent refresh with 409", () => {
    acquireInFlight("capital_raise_benchmarks");
    const res = mockRes();
    const next = vi.fn();
    singleFlightGuard({ params: { id: "capital_raise_benchmarks" } } as any, res, next);
    expect(res.status).toHaveBeenCalledWith(409);
  });
  it("registers a release-on-close handler when accepted", () => {
    const res = mockRes();
    const next = vi.fn();
    singleFlightGuard({ params: { id: "capital_raise_benchmarks" } } as any, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.on).toHaveBeenCalledWith("close", expect.any(Function));
  });
});

describe("Guard 6: auditPrepareGuard", () => {
  it("opens an audit-log row and stashes the id on res.locals", async () => {
    const res = mockRes();
    const next = vi.fn();
    await auditPrepareGuard({
      params: { id: "capital_raise_benchmarks" },
      user: { id: 7 },
      ip: "1.2.3.4",
      socket: { remoteAddress: "1.2.3.4" },
      headers: { "user-agent": "test" },
    } as any, res, next);
    expect(storage.createAnalystRefreshAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      tableId: "capital_raise_benchmarks",
      adminId: 7,
      status: "pending",
    }));
    expect(res.locals.analystRefreshAuditId).toBe(42);
    expect(next).toHaveBeenCalled();
  });
  it("does not block the refresh on logging failure", async () => {
    (storage.createAnalystRefreshAuditLog as any).mockRejectedValue(new Error("db down"));
    const res = mockRes();
    const next = vi.fn();
    await auditPrepareGuard({
      params: { id: "capital_raise_benchmarks" },
      user: { id: 7 },
      ip: "1.2.3.4",
      socket: {},
      headers: {},
    } as any, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe("Guard 7: suspiciousActivityTracker", () => {
  it("flags suspicious activity when >5 refreshes in 10min", async () => {
    (storage.countAnalystRefreshAttempts as any).mockResolvedValue(7);
    const res = mockRes();
    const next = vi.fn();
    await suspiciousActivityTracker({} as any, res, next);
    expect(storage.updateAnalystRefreshSettings).toHaveBeenCalledWith(
      expect.objectContaining({ lastSuspiciousAlertAt: expect.any(Date) }),
    );
    expect(next).toHaveBeenCalled();
  });
  it("does not flag when below threshold", async () => {
    (storage.countAnalystRefreshAttempts as any).mockResolvedValue(2);
    const res = mockRes();
    const next = vi.fn();
    await suspiciousActivityTracker({} as any, res, next);
    expect(storage.updateAnalystRefreshSettings).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
