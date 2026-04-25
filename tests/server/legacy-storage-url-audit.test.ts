/**
 * Tests for the nightly legacy-storage-URL audit scheduler
 * (server/jobs/legacy-storage-url-audit.ts).
 *
 * Coverage:
 *   - clean state: no email, fingerprint reset
 *   - hits found: notifies every admin via processNotificationEvent
 *   - same-state next cycle: suppressed by fingerprint
 *   - changed state: re-notifies with the new fingerprint
 *   - admin kill switch (`legacy_storage_url_audit_disabled`): mutes the email
 *     but does NOT advance the fingerprint, so re-enabling the next cycle still fires
 *   - recovery → regression: clean run resets fingerprint, next regression notifies again
 *   - cycle summary is recorded into scheduler_runs (`recordSchedulerCycle`)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AuditReport } from "../../script/lib/legacy-storage-url-audit";

const runAudit = vi.fn();
vi.mock("../../script/lib/legacy-storage-url-audit", async () => {
  const actual = await vi.importActual<
    typeof import("../../script/lib/legacy-storage-url-audit")
  >("../../script/lib/legacy-storage-url-audit");
  return {
    ...actual,
    runLegacyStorageUrlAudit: (...args: unknown[]) => runAudit(...args),
  };
});

const getNotificationSetting = vi.fn();
const getAllUsers = vi.fn();
vi.mock("../../server/storage", () => ({
  storage: {
    getNotificationSetting: (k: string) => getNotificationSetting(k),
    getAllUsers: () => getAllUsers(),
  },
}));

vi.mock("../../server/db", () => ({
  pool: { __mock: true },
}));

const recordSchedulerCycle = vi.fn();
vi.mock("../../server/jobs/scheduler-run-tracker", async () => {
  const actual = await vi.importActual<
    typeof import("../../server/jobs/scheduler-run-tracker")
  >("../../server/jobs/scheduler-run-tracker");
  return {
    ...actual,
    recordSchedulerCycle: (...args: unknown[]) => recordSchedulerCycle(...args),
  };
});

const processNotificationEvent = vi.fn();
vi.mock("../../server/notifications/engine", () => ({
  processNotificationEvent: (e: unknown) => processNotificationEvent(e),
}));

vi.mock("../../server/providers/config", () => ({
  getAppUrl: () => "https://example.test",
}));

vi.mock("../../server/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
  log: vi.fn(),
}));

import {
  runLegacyStorageUrlAuditCycle,
  fingerprintReport,
  _resetLegacyStorageAuditStateForTest,
} from "../../server/jobs/legacy-storage-url-audit";

function makeReport(byColumn: Record<string, number>): AuditReport {
  const hits: AuditReport["hits"] = [];
  for (const [k, n] of Object.entries(byColumn)) {
    const [table, column] = k.split(".");
    for (let i = 0; i < n; i++) {
      hits.push({
        table,
        column,
        dataType: "text",
        pk: i + 1,
        pattern: "objectstorage\\.replit\\.com",
        value: `https://objectstorage.replit.com/objects/uploads/x-${i}`,
      });
    }
  }
  return {
    patterns: ["objectstorage\\.replit\\.com"],
    totalHits: hits.length,
    byPattern: { "objectstorage\\.replit\\.com": hits.length },
    byColumn: new Map(Object.entries(byColumn)),
    hits,
    skippedColumns: [],
  };
}

beforeEach(() => {
  runAudit.mockReset();
  getNotificationSetting.mockReset();
  getAllUsers.mockReset();
  recordSchedulerCycle.mockReset();
  processNotificationEvent.mockReset();

  getNotificationSetting.mockResolvedValue(null);
  getAllUsers.mockResolvedValue([
    { id: 1, email: "admin@example.com", role: "super_admin" },
    { id: 2, email: "u@example.com", role: "user" },
    { id: 3, email: "admin2@example.com", role: "admin" },
  ]);
  processNotificationEvent.mockResolvedValue(undefined);

  _resetLegacyStorageAuditStateForTest();
});

describe("runLegacyStorageUrlAuditCycle", () => {
  it("clean state: emails no admin, records ok summary", async () => {
    runAudit.mockResolvedValue(makeReport({}));
    const summary = await runLegacyStorageUrlAuditCycle();
    expect(summary.totalHits).toBe(0);
    expect(summary.notification.status).toBe("clean");
    expect(processNotificationEvent).not.toHaveBeenCalled();
    expect(recordSchedulerCycle).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "legacy-storage-url-audit",
        status: "ok",
        failed: 0,
      }),
    );
  });

  it("hits found: notifies every admin (filtered to admin role) via processNotificationEvent", async () => {
    runAudit.mockResolvedValue(makeReport({ "users.avatar_url": 3, "properties.cover_image": 1 }));
    const summary = await runLegacyStorageUrlAuditCycle();
    expect(summary.totalHits).toBe(4);
    expect(summary.notification.status).toBe("sent");
    if (summary.notification.status === "sent") {
      expect(summary.notification.recipients).toBe(2);
      expect(summary.notification.sent).toBe(2);
    }
    expect(processNotificationEvent).toHaveBeenCalledTimes(2);
    const recipients = processNotificationEvent.mock.calls.map(
      (c) => (c[0] as { metadata?: { recipientEmail?: string } }).metadata?.recipientEmail,
    );
    expect(new Set(recipients)).toEqual(
      new Set(["admin@example.com", "admin2@example.com"]),
    );
    // Cycle summary is `warn` (audit ran fine, but data is dirty).
    expect(recordSchedulerCycle).toHaveBeenCalledWith(
      expect.objectContaining({ status: "warn" }),
    );
  });

  it("notification carries row-level (table.column.pk) samples in metadata and email body", async () => {
    runAudit.mockResolvedValue(
      makeReport({ "users.avatar_url": 2, "properties.cover_image": 1 }),
    );
    await runLegacyStorageUrlAuditCycle();

    const event = processNotificationEvent.mock.calls[0][0] as {
      message: string;
      metadata: {
        affectedRows: Array<{ table: string; column: string; pk: number | string; pattern: string }>;
        affectedRowsTruncated: boolean;
        totalHits: number;
        columnsAffected: number;
      };
    };

    expect(event.metadata.affectedRows).toHaveLength(3);
    expect(event.metadata.affectedRowsTruncated).toBe(false);
    // Sorted by table → column → pk for stability.
    expect(event.metadata.affectedRows[0]).toMatchObject({
      table: "properties",
      column: "cover_image",
      pk: 1,
    });
    expect(event.metadata.affectedRows[1]).toMatchObject({
      table: "users",
      column: "avatar_url",
      pk: 1,
    });
    expect(event.metadata.affectedRows.every((r) => typeof r.pattern === "string")).toBe(true);

    // Email body must name the affected rows so an admin who only reads
    // the email can act without re-running the CLI.
    expect(event.message).toContain("properties.cover_image pk=1");
    expect(event.message).toContain("users.avatar_url pk=1");
    expect(event.message).toContain("users.avatar_url pk=2");
  });

  it("notification truncates row samples and flags the truncation when over the cap", async () => {
    runAudit.mockResolvedValue(makeReport({ "users.avatar_url": 50 }));
    await runLegacyStorageUrlAuditCycle();

    const event = processNotificationEvent.mock.calls[0][0] as {
      message: string;
      metadata: {
        affectedRows: Array<{ table: string; column: string; pk: number | string }>;
        affectedRowsTruncated: boolean;
        totalHits: number;
      };
    };

    expect(event.metadata.totalHits).toBe(50);
    expect(event.metadata.affectedRows.length).toBeLessThanOrEqual(25);
    expect(event.metadata.affectedRowsTruncated).toBe(true);
    expect(event.message).toMatch(/and \d+ more row/);
  });

  it("identical state on the next cycle is suppressed by fingerprint", async () => {
    runAudit.mockResolvedValue(makeReport({ "users.avatar_url": 3 }));
    await runLegacyStorageUrlAuditCycle();
    expect(processNotificationEvent).toHaveBeenCalledTimes(2);

    processNotificationEvent.mockClear();
    runAudit.mockResolvedValue(makeReport({ "users.avatar_url": 3 }));
    const summary = await runLegacyStorageUrlAuditCycle();
    expect(summary.notification.status).toBe("suppressed");
    expect(processNotificationEvent).not.toHaveBeenCalled();
  });

  it("changed state on the next cycle re-notifies with the new fingerprint", async () => {
    runAudit.mockResolvedValue(makeReport({ "users.avatar_url": 3 }));
    await runLegacyStorageUrlAuditCycle();
    processNotificationEvent.mockClear();

    runAudit.mockResolvedValue(makeReport({ "users.avatar_url": 5 }));
    const summary = await runLegacyStorageUrlAuditCycle();
    expect(summary.notification.status).toBe("sent");
    expect(processNotificationEvent).toHaveBeenCalledTimes(2);
  });

  it("admin kill switch mutes the email but does NOT advance the fingerprint", async () => {
    getNotificationSetting.mockImplementation((k: string) =>
      Promise.resolve(k === "legacy_storage_url_audit_disabled" ? "true" : null),
    );
    runAudit.mockResolvedValue(makeReport({ "users.avatar_url": 3 }));
    const first = await runLegacyStorageUrlAuditCycle();
    expect(first.notification.status).toBe("disabled");
    expect(processNotificationEvent).not.toHaveBeenCalled();

    // Re-enable: same hits, same fingerprint — but since the kill switch
    // suppressed the prior advance, this cycle MUST still notify.
    getNotificationSetting.mockResolvedValue(null);
    const second = await runLegacyStorageUrlAuditCycle();
    expect(second.notification.status).toBe("sent");
    expect(processNotificationEvent).toHaveBeenCalledTimes(2);
  });

  it("recovery → regression: clean cycle resets fingerprint so next regression re-notifies", async () => {
    runAudit.mockResolvedValue(makeReport({ "users.avatar_url": 3 }));
    await runLegacyStorageUrlAuditCycle();
    processNotificationEvent.mockClear();

    runAudit.mockResolvedValue(makeReport({}));
    const cleanSummary = await runLegacyStorageUrlAuditCycle();
    expect(cleanSummary.notification.status).toBe("clean");

    runAudit.mockResolvedValue(makeReport({ "users.avatar_url": 3 }));
    const regression = await runLegacyStorageUrlAuditCycle();
    expect(regression.notification.status).toBe("sent");
    expect(processNotificationEvent).toHaveBeenCalledTimes(2);
  });

  it("no-admins: leaves fingerprint un-advanced so the next cycle (with admins) still fires", async () => {
    getAllUsers.mockResolvedValue([{ id: 7, email: "u@example.com", role: "user" }]);
    runAudit.mockResolvedValue(makeReport({ "users.avatar_url": 3 }));
    const first = await runLegacyStorageUrlAuditCycle();
    expect(first.notification.status).toBe("no-admins");
    expect(processNotificationEvent).not.toHaveBeenCalled();

    getAllUsers.mockResolvedValue([
      { id: 1, email: "admin@example.com", role: "super_admin" },
    ]);
    const second = await runLegacyStorageUrlAuditCycle();
    expect(second.notification.status).toBe("sent");
    expect(processNotificationEvent).toHaveBeenCalledTimes(1);
  });

  it("scanner throw: records error summary and re-throws", async () => {
    runAudit.mockRejectedValue(new Error("pg connection lost"));
    await expect(runLegacyStorageUrlAuditCycle()).rejects.toThrow("pg connection lost");
    expect(recordSchedulerCycle).toHaveBeenCalledWith(
      expect.objectContaining({ status: "error", failed: 1 }),
    );
  });

  it("skipped columns are surfaced as warn even when totalHits is 0", async () => {
    const report = makeReport({});
    report.skippedColumns.push({
      table: "weird_view",
      column: "computed",
      reason: "permission denied",
    });
    runAudit.mockResolvedValue(report);
    const summary = await runLegacyStorageUrlAuditCycle();
    expect(summary.skippedColumns).toBe(1);
    expect(recordSchedulerCycle).toHaveBeenCalledWith(
      expect.objectContaining({ status: "warn" }),
    );
  });
});

describe("fingerprintReport", () => {
  it("returns 'clean' for an empty audit", () => {
    expect(fingerprintReport(makeReport({}))).toBe("clean");
  });

  it("is stable regardless of column iteration order", () => {
    const a = makeReport({ "a.x": 1, "b.y": 2 });
    const b = makeReport({ "b.y": 2, "a.x": 1 });
    expect(fingerprintReport(a)).toBe(fingerprintReport(b));
  });

  it("changes when hit-counts shift even on the same column", () => {
    expect(fingerprintReport(makeReport({ "a.x": 1 }))).not.toBe(
      fingerprintReport(makeReport({ "a.x": 2 })),
    );
  });

  it("changes when a new column appears", () => {
    expect(fingerprintReport(makeReport({ "a.x": 1 }))).not.toBe(
      fingerprintReport(makeReport({ "a.x": 1, "b.y": 1 })),
    );
  });
});
