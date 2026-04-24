/**
 * Tests for the daily digest evaluator that emails admins about failed
 * scheduled Constants refreshes
 * (server/notifications/constants-refresh-failure-digest.ts).
 *
 * The evaluator is responsible for: (a) honoring the resend_enabled and
 * constants_refresh_digest_disabled gates, (b) skipping when there are
 * no failures, (c) deduping by UTC day so frequent ticks don't spam.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const getNotificationSetting = vi.fn();
const getFailedScheduledRefreshes = vi.fn();
const getAllUsers = vi.fn();
const createNotificationLog = vi.fn();

vi.mock("../../server/storage", () => ({
  storage: {
    getNotificationSetting: (k: string) => getNotificationSetting(k),
    getFailedScheduledConstantsRefreshes: (since: Date, limit?: number) =>
      getFailedScheduledRefreshes(since, limit),
    getAllUsers: () => getAllUsers(),
    createNotificationLog: (data: unknown) => createNotificationLog(data),
  },
}));

const sendEmail = vi.fn();
vi.mock("../../server/integrations/resend", () => ({
  sendNotificationEmail: (args: unknown) => sendEmail(args),
}));

// Mutable rows the dedupe lookup will read; tests can push prior "sent"
// digest entries into this array to simulate a previously-sent digest.
const priorNotificationLogRows: Array<{ status: string; metadata: unknown }> = [];
vi.mock("../../server/db", () => {
  const limit = () => Promise.resolve([...priorNotificationLogRows]);
  const orderBy = () => ({ limit });
  const where = () => ({ orderBy });
  const from = () => ({ where });
  return { db: { select: () => ({ from }) } };
});

vi.mock("../../server/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
  log: vi.fn(),
}));

import { evaluateConstantsRefreshFailureDigest } from "../../server/notifications/constants-refresh-failure-digest";

beforeEach(() => {
  getNotificationSetting.mockReset();
  getFailedScheduledRefreshes.mockReset();
  getAllUsers.mockReset();
  createNotificationLog.mockReset();
  sendEmail.mockReset();
  priorNotificationLogRows.length = 0;

  getNotificationSetting.mockImplementation((k: string) => {
    if (k === "resend_enabled") return Promise.resolve("true");
    return Promise.resolve(null);
  });
  getFailedScheduledRefreshes.mockResolvedValue([]);
  getAllUsers.mockResolvedValue([
    { id: 1, email: "admin@example.com", role: "super_admin" },
    { id: 2, email: "u@example.com", role: "user" },
  ]);
  sendEmail.mockResolvedValue(undefined);
  createNotificationLog.mockResolvedValue({ id: 1 });
});

describe("evaluateConstantsRefreshFailureDigest", () => {
  it("is disabled when resend_enabled is not 'true'", async () => {
    getNotificationSetting.mockImplementation(() => Promise.resolve(null));
    const r = await evaluateConstantsRefreshFailureDigest();
    expect(r.status).toBe("disabled");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("is disabled when constants_refresh_digest_disabled is 'true'", async () => {
    getNotificationSetting.mockImplementation((k: string) =>
      Promise.resolve(
        k === "constants_refresh_digest_disabled" ? "true" : k === "resend_enabled" ? "true" : null,
      ),
    );
    const r = await evaluateConstantsRefreshFailureDigest();
    expect(r.status).toBe("disabled");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("returns no-failures when the storage layer reports an empty window", async () => {
    getFailedScheduledRefreshes.mockResolvedValue([]);
    const r = await evaluateConstantsRefreshFailureDigest();
    expect(r.status).toBe("no-failures");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("emails every admin once when failures exist and logs a 'sent' row per recipient", async () => {
    getFailedScheduledRefreshes.mockResolvedValue([
      {
        id: 10,
        completedAt: new Date(),
        error: "grounded search 503",
        metadata: { scheduledRefresh: true, constant: { key: "taxRate", country: "Spain", subdivision: null } },
      },
      {
        id: 11,
        completedAt: new Date(),
        error: "rate limit",
        metadata: { scheduledRefresh: true, constant: { key: "inflationRate", country: null, subdivision: null } },
      },
    ]);
    const r = await evaluateConstantsRefreshFailureDigest();
    expect(r.status).toBe("ok");
    expect(r.failures).toBe(2);
    // Only the super_admin recipient gets the email — the user role is filtered out.
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "admin@example.com" }));
    expect(createNotificationLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "CONSTANTS_REFRESH_FAILED",
        status: "sent",
        recipient: "admin@example.com",
        metadata: expect.objectContaining({ digestKey: expect.any(String), failureCount: 2 }),
      }),
    );
  });

  it("returns no-admins when there are no admin users with email", async () => {
    getFailedScheduledRefreshes.mockResolvedValue([
      {
        id: 12,
        completedAt: new Date(),
        error: "boom",
        metadata: { scheduledRefresh: true, constant: { key: "taxRate", country: null, subdivision: null } },
      },
    ]);
    getAllUsers.mockResolvedValue([{ id: 5, email: "u@example.com", role: "user" }]);
    const r = await evaluateConstantsRefreshFailureDigest();
    expect(r.status).toBe("no-admins");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("dedupes — returns already-sent when a 'sent' log row exists for today's UTC digestKey", async () => {
    const today = new Date().toISOString().slice(0, 10);
    priorNotificationLogRows.push({ status: "sent", metadata: { digestKey: today } });
    getFailedScheduledRefreshes.mockResolvedValue([
      {
        id: 13,
        completedAt: new Date(),
        error: "boom",
        metadata: { scheduledRefresh: true, constant: { key: "taxRate", country: null, subdivision: null } },
      },
    ]);
    const r = await evaluateConstantsRefreshFailureDigest();
    expect(r.status).toBe("already-sent");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("does NOT dedupe when prior log row exists but for a different digestKey", async () => {
    priorNotificationLogRows.push({ status: "sent", metadata: { digestKey: "1999-01-01" } });
    getFailedScheduledRefreshes.mockResolvedValue([
      {
        id: 14,
        completedAt: new Date(),
        error: "boom",
        metadata: { scheduledRefresh: true, constant: { key: "taxRate", country: null, subdivision: null } },
      },
    ]);
    const r = await evaluateConstantsRefreshFailureDigest();
    expect(r.status).toBe("ok");
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});
