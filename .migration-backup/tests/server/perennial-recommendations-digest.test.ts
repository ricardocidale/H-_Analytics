/**
 * Tests for the rolled-up "Perennial Specialist recommendations never
 * promoted" notifier
 * (server/notifications/perennial-recommendations-digest.ts).
 *
 * Locks the user-facing contract:
 *   1. Resend kill-switch off → no work, status "disabled".
 *   2. No offenders (or only catalog-orphan rows) → no email, no
 *      recipient lookup.
 *   3. Non-empty input → one email per admin via sendNotificationEmail
 *      directly (so per-recipient sent/failed accounting reflects the
 *      actual SMTP outcome) + one notification_logs row per admin
 *      tagged with today's UTC digestKey.
 *   4. Per-UTC-day dedupe is *status-aware*: if a `status = "sent"` log
 *      with today's digestKey already exists, the next call short-
 *      circuits. A previously-failed delivery does NOT block a retry.
 *   5. A failed send for one admin does NOT block the next admin and
 *      is reported on the result + persisted as a `status = "failed"`
 *      log row.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const getNotificationSetting = vi.fn();
const getTopPerennialRecommendationOffenders = vi.fn();
const getAllUsers = vi.fn();
const createNotificationLog = vi.fn();
vi.mock("../../server/storage", () => ({
  storage: {
    getNotificationSetting: (key: string) => getNotificationSetting(key),
    getTopPerennialRecommendationOffenders: (limit: number) =>
      getTopPerennialRecommendationOffenders(limit),
    getAllUsers: () => getAllUsers(),
    createNotificationLog: (data: unknown) => createNotificationLog(data),
  },
}));

// Stub the db query chain used by `alreadySentForDigest`. The function
// reads at most 100 most-recent logs for this event type and the test
// drives that result set directly.
const recentLogs: Array<{ status: string; metadata: unknown }> = [];
vi.mock("../../server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () => Promise.resolve(recentLogs.slice()),
          }),
        }),
      }),
    }),
  },
}));

const sendNotificationEmail = vi.fn();
vi.mock("../../server/integrations/resend", () => ({
  sendNotificationEmail: (args: unknown) => sendNotificationEmail(args),
}));

vi.mock("../../server/providers/config", () => ({
  getAppUrl: () => "https://app.example.test",
}));

vi.mock("../../server/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  log: vi.fn(),
}));

import { evaluatePerennialRecommendationsDigest } from "../../server/notifications/perennial-recommendations-digest";

const FIXED_DAY = new Date("2026-04-25T12:00:00Z");

beforeEach(() => {
  getNotificationSetting.mockReset();
  getTopPerennialRecommendationOffenders.mockReset();
  getAllUsers.mockReset();
  createNotificationLog.mockReset();
  sendNotificationEmail.mockReset();
  recentLogs.length = 0;
  // Default: feature on, no prior digest sent, two recipients (one admin, one user).
  getNotificationSetting.mockImplementation((k: string) =>
    k === "resend_enabled" ? Promise.resolve("true") : Promise.resolve(null),
  );
  getAllUsers.mockResolvedValue([
    { id: 1, email: "admin@example.test", role: "super_admin" },
    { id: 2, email: "user@example.test", role: "user" },
  ]);
  sendNotificationEmail.mockResolvedValue(undefined);
  createNotificationLog.mockResolvedValue(undefined);
});

describe("evaluatePerennialRecommendationsDigest", () => {
  it("short-circuits to 'disabled' when the resend kill-switch is off", async () => {
    getNotificationSetting.mockImplementation(() => Promise.resolve("false"));
    const r = await evaluatePerennialRecommendationsDigest(FIXED_DAY);
    expect(r.status).toBe("disabled");
    expect(getTopPerennialRecommendationOffenders).not.toHaveBeenCalled();
    expect(sendNotificationEmail).not.toHaveBeenCalled();
  });

  it("is a no-op when storage returns no offenders", async () => {
    getTopPerennialRecommendationOffenders.mockResolvedValue([]);
    const r = await evaluatePerennialRecommendationsDigest(FIXED_DAY);
    expect(r.status).toBe("no-offenders");
    expect(sendNotificationEmail).not.toHaveBeenCalled();
    expect(getAllUsers).not.toHaveBeenCalled();
  });

  it("filters catalog-orphan rows before deciding whether to send", async () => {
    getTopPerennialRecommendationOffenders.mockResolvedValue([
      // Specialist no longer in the catalog.
      {
        specialistId: "ghost-specialist",
        fieldKey: "anything",
        appearances: 9,
        firstObservedAt: FIXED_DAY,
        lastObservedAt: FIXED_DAY,
      },
      // Specialist exists, field key was removed from the catalog.
      {
        specialistId: "mgmt-co.funding",
        fieldKey: "this-key-was-removed",
        appearances: 7,
        firstObservedAt: FIXED_DAY,
        lastObservedAt: FIXED_DAY,
      },
    ]);
    const r = await evaluatePerennialRecommendationsDigest(FIXED_DAY);
    expect(r.status).toBe("no-offenders");
    expect(sendNotificationEmail).not.toHaveBeenCalled();
    expect(getAllUsers).not.toHaveBeenCalled();
  });

  it("emails one admin per recipient with today's digestKey + a Required Fields deep link, persisting a 'sent' log per admin", async () => {
    getTopPerennialRecommendationOffenders.mockResolvedValue([
      {
        specialistId: "mgmt-co.funding",
        fieldKey: "runwayBufferMonths",
        appearances: 7,
        firstObservedAt: FIXED_DAY,
        lastObservedAt: FIXED_DAY,
      },
    ]);
    const r = await evaluatePerennialRecommendationsDigest(FIXED_DAY);
    expect(r.status).toBe("ok");
    expect(r.digestKey).toBe("2026-04-25");
    expect(r.offenders).toBe(1);
    expect(r.recipients).toBe(1);
    expect(r.sent).toBe(1);
    expect(r.failed).toBe(0);

    expect(sendNotificationEmail).toHaveBeenCalledTimes(1);
    expect(sendNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "admin@example.test",
        actionUrl: "https://app.example.test/admin?section=required-fields",
      }),
    );
    expect(createNotificationLog).toHaveBeenCalledTimes(1);
    expect(createNotificationLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "PERENNIAL_RECOMMENDATIONS_DIGEST",
        recipient: "admin@example.test",
        status: "sent",
        metadata: expect.objectContaining({
          digestKey: "2026-04-25",
          offenderCount: 1,
          rows: [
            expect.objectContaining({
              specialistId: "mgmt-co.funding",
              specialistLetter: "A",
              fieldKey: "runwayBufferMonths",
              fieldLabel: "Runway buffer (months)",
              fieldSurface: "company-assumptions",
              appearances: 7,
            }),
          ],
        }),
      }),
    );
  });

  it("dedupes per UTC day on status='sent' logs only — a failed prior send still allows a retry", async () => {
    getTopPerennialRecommendationOffenders.mockResolvedValue([
      {
        specialistId: "mgmt-co.funding",
        fieldKey: "runwayBufferMonths",
        appearances: 5,
        firstObservedAt: FIXED_DAY,
        lastObservedAt: FIXED_DAY,
      },
    ]);
    // Two existing log rows for today's digestKey, but neither is 'sent'.
    // Dedupe must NOT trigger — the next tick should retry.
    recentLogs.push(
      { status: "failed", metadata: { digestKey: "2026-04-25" } },
      { status: "pending", metadata: { digestKey: "2026-04-25" } },
    );

    const r = await evaluatePerennialRecommendationsDigest(FIXED_DAY);
    expect(r.status).toBe("ok");
    expect(r.sent).toBe(1);
    expect(sendNotificationEmail).toHaveBeenCalledTimes(1);

    // Now flip one of the recent logs to 'sent' for today's digestKey
    // — the next call must short-circuit.
    sendNotificationEmail.mockReset();
    createNotificationLog.mockReset();
    recentLogs.push({ status: "sent", metadata: { digestKey: "2026-04-25" } });

    const r2 = await evaluatePerennialRecommendationsDigest(FIXED_DAY);
    expect(r2.status).toBe("already-sent");
    expect(r2.digestKey).toBe("2026-04-25");
    expect(sendNotificationEmail).not.toHaveBeenCalled();
    expect(createNotificationLog).not.toHaveBeenCalled();
  });

  it("a failed SMTP send for one admin is recorded as status='failed' and does not block the next admin", async () => {
    getTopPerennialRecommendationOffenders.mockResolvedValue([
      {
        specialistId: "mgmt-co.funding",
        fieldKey: "runwayBufferMonths",
        appearances: 4,
        firstObservedAt: FIXED_DAY,
        lastObservedAt: FIXED_DAY,
      },
    ]);
    getAllUsers.mockResolvedValue([
      { id: 1, email: "ok@example.test", role: "super_admin" },
      { id: 2, email: "broken@example.test", role: "admin" },
      { id: 3, email: "alsook@example.test", role: "super_admin" },
    ]);
    sendNotificationEmail.mockImplementation((args: { to: string }) => {
      if (args.to === "broken@example.test") {
        return Promise.reject(new Error("smtp down"));
      }
      return Promise.resolve(undefined);
    });

    const r = await evaluatePerennialRecommendationsDigest(FIXED_DAY);
    expect(r.status).toBe("ok");
    expect(r.recipients).toBe(3);
    expect(r.sent).toBe(2);
    expect(r.failed).toBe(1);
    expect(sendNotificationEmail).toHaveBeenCalledTimes(3);
    // Three logs total — two 'sent' and one 'failed' for broken@.
    expect(createNotificationLog).toHaveBeenCalledTimes(3);
    expect(createNotificationLog).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: "broken@example.test",
        status: "failed",
        errorMessage: "smtp down",
      }),
    );
  });

  it("falls back to no-admins when there are zero admin recipients", async () => {
    getTopPerennialRecommendationOffenders.mockResolvedValue([
      {
        specialistId: "mgmt-co.funding",
        fieldKey: "runwayBufferMonths",
        appearances: 6,
        firstObservedAt: FIXED_DAY,
        lastObservedAt: FIXED_DAY,
      },
    ]);
    getAllUsers.mockResolvedValue([
      { id: 1, email: "user-only@example.test", role: "user" },
    ]);
    const r = await evaluatePerennialRecommendationsDigest(FIXED_DAY);
    expect(r.status).toBe("no-admins");
    expect(r.offenders).toBe(1);
    expect(sendNotificationEmail).not.toHaveBeenCalled();
  });
});
