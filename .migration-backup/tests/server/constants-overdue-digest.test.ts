/**
 * Tests for the rolled-up "Constants source silent past 2× cadence"
 * notifier (server/notifications/constants-overdue-digest.ts).
 *
 * Locks the user-facing contract:
 *  1. Empty input → no email.
 *  2. Non-empty input → one event per admin recipient, routed through
 *     processNotificationEvent (same path llm-registry issues use).
 *  3. EVERY cycle with overdue rows fires — there is no cross-cycle
 *     dedupe. The spec is "one rolled-up notification per cycle"; the
 *     scheduler's cadence is what controls how often admins are pinged.
 *  4. A failed send for one admin does NOT prevent the next admin from
 *     getting their event, and `failed` is reported on the result so
 *     the scheduler can log it.
 *  5. No admin recipients → no events emitted; subsequent calls are
 *     also no-ops (handled by the empty-admin branch).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const getAllUsers = vi.fn();
vi.mock("../../server/storage", () => ({
  storage: {
    getAllUsers: () => getAllUsers(),
  },
}));

const processEvent = vi.fn();
vi.mock("../../server/notifications/engine", () => ({
  processNotificationEvent: (event: unknown) => processEvent(event),
}));

vi.mock("../../server/providers/config", () => ({
  getAppUrl: () => "https://app.example.test",
}));

vi.mock("../../server/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  log: vi.fn(),
}));

import {
  notifyAdminsOfOverdueConstants,
  type OverdueConstantRow,
} from "../../server/notifications/constants-overdue-digest";

const sampleRow = (overrides: Partial<OverdueConstantRow> = {}): OverdueConstantRow => ({
  specialistId: "constants.tax-research",
  specialistLetter: "H",
  specialistName: "Tax Research",
  key: "taxRate",
  country: "United States",
  subdivision: "California",
  cadenceDays: 30,
  ageDays: 90,
  ...overrides,
});

beforeEach(() => {
  getAllUsers.mockReset();
  processEvent.mockReset();
  getAllUsers.mockResolvedValue([
    { id: 1, email: "admin@example.test", role: "super_admin" },
    { id: 2, email: "user@example.test", role: "user" },
  ]);
  processEvent.mockResolvedValue(undefined);
});

describe("notifyAdminsOfOverdueConstants", () => {
  it("is a no-op when there are no overdue rows", async () => {
    const r = await notifyAdminsOfOverdueConstants([]);
    expect(r.status).toBe("no-overdue");
    expect(processEvent).not.toHaveBeenCalled();
    expect(getAllUsers).not.toHaveBeenCalled();
  });

  it("emits one event per admin recipient via processNotificationEvent", async () => {
    const rows = [sampleRow(), sampleRow({ key: "inflationRate", country: null, subdivision: null })];
    const r = await notifyAdminsOfOverdueConstants(rows);
    expect(r.status).toBe("ok");
    expect(r.recipients).toBe(1);
    expect(r.sent).toBe(1);
    expect(r.failed).toBe(0);
    // Filtered out the non-admin user, so exactly one event was emitted.
    expect(processEvent).toHaveBeenCalledTimes(1);
    expect(processEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "CONSTANTS_REFRESH_OVERDUE",
        link: expect.stringContaining("/admin"),
        metadata: expect.objectContaining({
          recipientEmail: "admin@example.test",
          overdueCount: 2,
          rows: expect.arrayContaining([
            expect.objectContaining({ key: "taxRate", country: "United States" }),
            expect.objectContaining({ key: "inflationRate", country: null }),
          ]),
        }),
      }),
    );
  });

  it("attaches a signed per-row action URL to every metadata row (Task #602)", async () => {
    const rows = [
      sampleRow(),
      sampleRow({ key: "inflationRate", country: null, subdivision: null }),
    ];
    await notifyAdminsOfOverdueConstants(rows);
    expect(processEvent).toHaveBeenCalledTimes(1);
    const evt = processEvent.mock.calls[0][0] as {
      metadata: { rows: Array<{ key: string; actionUrl: string | null }> };
    };
    // Every row carries a non-null action URL — admins clicking any
    // line in the email must reach the refresh endpoint.
    expect(evt.metadata.rows).toHaveLength(2);
    for (const r of evt.metadata.rows) {
      expect(r.actionUrl).toEqual(expect.stringContaining(
        "/api/admin/model-constants/refresh-from-email",
      ));
      expect(r.actionUrl).toEqual(expect.stringContaining("k="));
      expect(r.actionUrl).toEqual(expect.stringContaining("t="));
    }
    // The two rows must produce distinct URLs (different key payloads).
    const urls = evt.metadata.rows.map((r) => r.actionUrl);
    expect(new Set(urls).size).toBe(2);
  });

  it("fires every cycle with overdue rows — no cross-cycle dedupe", async () => {
    const rows = [sampleRow()];
    await notifyAdminsOfOverdueConstants(rows);
    await notifyAdminsOfOverdueConstants(rows);
    await notifyAdminsOfOverdueConstants(rows);
    // Three cycles → three rolled-up notifications. The spec is
    // "one notification PER CYCLE", and the scheduler's interval
    // controls how often admins are reminded.
    expect(processEvent).toHaveBeenCalledTimes(3);
  });

  it("a failed send for one admin does not block the next admin", async () => {
    getAllUsers.mockResolvedValue([
      { id: 1, email: "ok@example.test", role: "super_admin" },
      { id: 2, email: "broken@example.test", role: "admin" },
      { id: 3, email: "alsook@example.test", role: "super_admin" },
    ]);
    processEvent.mockImplementation((evt: { metadata: { recipientEmail: string } }) => {
      if (evt.metadata.recipientEmail === "broken@example.test") {
        return Promise.reject(new Error("smtp down"));
      }
      return Promise.resolve(undefined);
    });

    const r = await notifyAdminsOfOverdueConstants([sampleRow()]);
    expect(r.status).toBe("ok");
    expect(r.recipients).toBe(3);
    expect(r.sent).toBe(2);
    expect(r.failed).toBe(1);
    expect(processEvent).toHaveBeenCalledTimes(3);
  });

  it("retries on the next cycle even when the previous cycle failed for everyone", async () => {
    // First cycle: every recipient send fails. Result reports failure
    // but the next cycle MUST still be allowed to fire — there is no
    // fingerprint commit gating subsequent attempts.
    processEvent.mockRejectedValueOnce(new Error("smtp down"));
    const first = await notifyAdminsOfOverdueConstants([sampleRow()]);
    expect(first.status).toBe("ok");
    expect(first.sent).toBe(0);
    expect(first.failed).toBe(1);

    // Recovery cycle: send succeeds. We expect a fresh attempt — no
    // suppression from the previous failure.
    processEvent.mockResolvedValue(undefined);
    const second = await notifyAdminsOfOverdueConstants([sampleRow()]);
    expect(second.status).toBe("ok");
    expect(second.sent).toBe(1);
    expect(second.failed).toBe(0);
    expect(processEvent).toHaveBeenCalledTimes(2);
  });

  it("returns no-admins (and does not call the engine) when no admin has an email", async () => {
    getAllUsers.mockResolvedValue([{ id: 99, email: "u@example.test", role: "user" }]);
    const r = await notifyAdminsOfOverdueConstants([sampleRow()]);
    expect(r.status).toBe("no-admins");
    expect(processEvent).not.toHaveBeenCalled();
  });

  it("treats a getAllUsers failure as no-admins rather than aborting", async () => {
    getAllUsers.mockRejectedValueOnce(new Error("db down"));
    const r = await notifyAdminsOfOverdueConstants([sampleRow()]);
    expect(r.status).toBe("no-admins");
    expect(processEvent).not.toHaveBeenCalled();
  });
});
