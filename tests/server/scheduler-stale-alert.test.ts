/**
 * Tests for the scheduler-stale alert evaluator
 * (server/notifications/scheduler-stale-alert.ts).
 *
 * The evaluator is responsible for: (a) honoring the `resend_enabled`
 * and `scheduler_stale_alerts_disabled` gates, (b) skipping when no
 * scheduler is stale, (c) emailing every admin per stale scheduler,
 * (d) throttling repeated emails for the same scheduler to one per 24h
 * while still stale.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { SCHEDULER_STALE_MULTIPLIER } from "../../server/jobs/scheduler-run-tracker";

const getNotificationSetting = vi.fn();
const listSchedulerRuns = vi.fn();
const getAllUsers = vi.fn();
const createNotificationLog = vi.fn();

vi.mock("../../server/storage", () => ({
  storage: {
    getNotificationSetting: (k: string) => getNotificationSetting(k),
    listSchedulerRuns: () => listSchedulerRuns(),
    getAllUsers: () => getAllUsers(),
    createNotificationLog: (data: unknown) => createNotificationLog(data),
  },
}));

const sendEmail = vi.fn();
vi.mock("../../server/integrations/resend", () => ({
  sendNotificationEmail: (args: unknown) => sendEmail(args),
}));

// Tests inject prior `SCHEDULER_STALE` log rows here. The mocked
// `db.select(...).from(...).where(<and(eq, gte(createdAt, cutoff))>)`
// chain extracts the cutoff from the gte() marker so the test mock
// itself enforces the createdAt>=cutoff filter the real query relies
// on — that way the "row outside the 24h window" test path actually
// proves the cutoff works (and the regression test for the >200-row
// overflow scenario is meaningful).
const priorNotificationLogRows: Array<{
  status: string;
  recipient?: string;
  metadata: unknown;
  createdAt: Date;
}> = [];
let lastQueryCutoff: Date | null = null;
vi.mock("drizzle-orm", () => ({
  eq: (_col: unknown, value: unknown) => ({ kind: "eq", value }),
  gte: (_col: unknown, value: unknown) => ({ kind: "gte", value }),
  and: (...parts: Array<{ kind: string; value: unknown }>) => ({ kind: "and", parts }),
  desc: (col: unknown) => ({ kind: "desc", col }),
}));
vi.mock("../../server/db", () => {
  const orderBy = () => Promise.resolve(
    [...priorNotificationLogRows]
      .filter((r) =>
        lastQueryCutoff ? r.createdAt.getTime() >= lastQueryCutoff.getTime() : true,
      )
      .map((r) => ({ ...r, recipient: r.recipient ?? null })),
  );
  const where = (clause: { kind: string; parts?: Array<{ kind: string; value: unknown }> }) => {
    lastQueryCutoff = null;
    if (clause?.kind === "and" && Array.isArray(clause.parts)) {
      const gteClause = clause.parts.find((p) => p.kind === "gte");
      if (gteClause && gteClause.value instanceof Date) {
        lastQueryCutoff = gteClause.value;
      }
    }
    return { orderBy };
  };
  const from = () => ({ where });
  return { db: { select: () => ({ from }) } };
});

vi.mock("../../server/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
  log: vi.fn(),
}));

vi.mock("../../server/providers/config", () => ({
  getAppUrl: () => "https://example.test",
}));

import { evaluateSchedulerStaleAlert } from "../../server/notifications/scheduler-stale-alert";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

beforeEach(() => {
  getNotificationSetting.mockReset();
  listSchedulerRuns.mockReset();
  getAllUsers.mockReset();
  createNotificationLog.mockReset();
  sendEmail.mockReset();
  priorNotificationLogRows.length = 0;

  getNotificationSetting.mockImplementation((k: string) => {
    if (k === "resend_enabled") return Promise.resolve("true");
    return Promise.resolve(null);
  });
  listSchedulerRuns.mockResolvedValue([]);
  getAllUsers.mockResolvedValue([
    { id: 1, email: "admin@example.com", role: "super_admin" },
    { id: 2, email: "u@example.com", role: "user" },
  ]);
  sendEmail.mockResolvedValue(undefined);
  createNotificationLog.mockResolvedValue({ id: 1 });
});

describe("evaluateSchedulerStaleAlert", () => {
  it("is disabled when resend_enabled is not 'true'", async () => {
    getNotificationSetting.mockImplementation(() => Promise.resolve(null));
    const r = await evaluateSchedulerStaleAlert();
    expect(r.status).toBe("disabled");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("is disabled when scheduler_stale_alerts_disabled is 'true'", async () => {
    getNotificationSetting.mockImplementation((k: string) =>
      Promise.resolve(
        k === "scheduler_stale_alerts_disabled"
          ? "true"
          : k === "resend_enabled"
            ? "true"
            : null,
      ),
    );
    const r = await evaluateSchedulerStaleAlert();
    expect(r.status).toBe("disabled");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("returns no-stale when every scheduler ran recently", async () => {
    const now = new Date("2026-04-25T12:00:00Z");
    listSchedulerRuns.mockResolvedValue([
      {
        schedulerKey: "ambient-benchmarks",
        schedulerLabel: "Ambient Benchmark Refresh",
        lastRunAt: new Date(now.getTime() - HOUR_MS),
        cycleIntervalMs: SIX_HOURS_MS,
      },
    ]);
    const r = await evaluateSchedulerStaleAlert({ now });
    expect(r.status).toBe("no-stale");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("does NOT alert on a scheduler that has never recorded a run", async () => {
    // Empty rows = no row for any registered scheduler → all "never run".
    // The Observability UI handles the "never run" case; the evaluator
    // intentionally only alerts on real regressions.
    const r = await evaluateSchedulerStaleAlert();
    expect(r.status).toBe("no-stale");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("emails each admin once for every stale scheduler and logs a 'sent' row", async () => {
    const now = new Date("2026-04-25T12:00:00Z");
    listSchedulerRuns.mockResolvedValue([
      {
        schedulerKey: "ambient-benchmarks",
        schedulerLabel: "Ambient Benchmark Refresh",
        // 13h ago = > 2 × 6h cycle → stale
        lastRunAt: new Date(now.getTime() - 13 * HOUR_MS),
        cycleIntervalMs: SIX_HOURS_MS,
      },
    ]);
    const r = await evaluateSchedulerStaleAlert({ now });
    expect(r.status).toBe("ok");
    expect(r.stale).toBe(1);
    // Only the super_admin recipient gets the email — the user role is filtered out.
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "admin@example.com" }),
    );
    expect(createNotificationLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "SCHEDULER_STALE",
        status: "sent",
        recipient: "admin@example.com",
        metadata: expect.objectContaining({
          schedulerKey: "ambient-benchmarks",
          staleMultiplier: SCHEDULER_STALE_MULTIPLIER,
        }),
      }),
    );
    expect(r.outcomes?.[0]).toEqual(
      expect.objectContaining({ schedulerKey: "ambient-benchmarks", status: "sent" }),
    );
  });

  it("includes the observability link and a duration in the email body", async () => {
    const now = new Date("2026-04-25T12:00:00Z");
    listSchedulerRuns.mockResolvedValue([
      {
        schedulerKey: "ambient-benchmarks",
        schedulerLabel: "Ambient Benchmark Refresh",
        lastRunAt: new Date(now.getTime() - 14 * HOUR_MS),
        cycleIntervalMs: SIX_HOURS_MS,
      },
    ]);
    await evaluateSchedulerStaleAlert({ now });
    const args = sendEmail.mock.calls[0][0];
    expect(args.actionUrl).toBe("https://example.test/admin?section=observability");
    expect(args.body).toContain("Ambient Benchmark Refresh");
    expect(args.body).toContain("ambient-benchmarks");
    expect(args.body).toMatch(/14\.0h|13\.\dh/);
  });

  it("throttles a stale scheduler when every eligible admin already received it inside the 24h window", async () => {
    const now = new Date("2026-04-25T12:00:00Z");
    priorNotificationLogRows.push({
      status: "sent",
      recipient: "admin@example.com",
      metadata: { schedulerKey: "ambient-benchmarks" },
      // 6h ago → inside the 24h throttle window
      createdAt: new Date(now.getTime() - 6 * HOUR_MS),
    });
    listSchedulerRuns.mockResolvedValue([
      {
        schedulerKey: "ambient-benchmarks",
        schedulerLabel: "Ambient Benchmark Refresh",
        lastRunAt: new Date(now.getTime() - 13 * HOUR_MS),
        cycleIntervalMs: SIX_HOURS_MS,
      },
    ]);
    const r = await evaluateSchedulerStaleAlert({ now });
    expect(r.status).toBe("ok");
    expect(r.outcomes?.[0]).toEqual(
      expect.objectContaining({ schedulerKey: "ambient-benchmarks", status: "throttled" }),
    );
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("retries an admin whose previous send failed even when another admin succeeded — per-recipient dedupe", async () => {
    // Two admins are eligible. A previous cycle delivered to admin-a but
    // admin-b's send threw. The next cycle must NOT re-email admin-a
    // (still inside 24h) but MUST retry admin-b (no successful row).
    const now = new Date("2026-04-25T12:00:00Z");
    getAllUsers.mockResolvedValue([
      { id: 1, email: "admin-a@example.com", role: "super_admin" },
      { id: 2, email: "admin-b@example.com", role: "super_admin" },
    ]);
    priorNotificationLogRows.push({
      status: "sent",
      recipient: "admin-a@example.com",
      metadata: { schedulerKey: "ambient-benchmarks" },
      createdAt: new Date(now.getTime() - 6 * HOUR_MS),
    });
    priorNotificationLogRows.push({
      status: "failed",
      recipient: "admin-b@example.com",
      metadata: { schedulerKey: "ambient-benchmarks" },
      createdAt: new Date(now.getTime() - 6 * HOUR_MS),
    });
    listSchedulerRuns.mockResolvedValue([
      {
        schedulerKey: "ambient-benchmarks",
        schedulerLabel: "Ambient Benchmark Refresh",
        lastRunAt: new Date(now.getTime() - 13 * HOUR_MS),
        cycleIntervalMs: SIX_HOURS_MS,
      },
    ]);
    const r = await evaluateSchedulerStaleAlert({ now });
    expect(r.outcomes?.[0]?.status).toBe("sent");
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "admin-b@example.com" }),
    );
  });

  it("does NOT throttle when the prior 'sent' row is older than 24h", async () => {
    const now = new Date("2026-04-25T12:00:00Z");
    priorNotificationLogRows.push({
      status: "sent",
      recipient: "admin@example.com",
      metadata: { schedulerKey: "ambient-benchmarks" },
      createdAt: new Date(now.getTime() - 36 * HOUR_MS),
    });
    listSchedulerRuns.mockResolvedValue([
      {
        schedulerKey: "ambient-benchmarks",
        schedulerLabel: "Ambient Benchmark Refresh",
        lastRunAt: new Date(now.getTime() - 13 * HOUR_MS),
        cycleIntervalMs: SIX_HOURS_MS,
      },
    ]);
    const r = await evaluateSchedulerStaleAlert({ now });
    expect(r.status).toBe("ok");
    expect(r.outcomes?.[0]?.status).toBe("sent");
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("throttles per-scheduler, not globally — stale scheduler A muted does not silence stale scheduler B", async () => {
    const now = new Date("2026-04-25T12:00:00Z");
    priorNotificationLogRows.push({
      status: "sent",
      recipient: "admin@example.com",
      metadata: { schedulerKey: "ambient-benchmarks" },
      createdAt: new Date(now.getTime() - 6 * HOUR_MS),
    });
    listSchedulerRuns.mockResolvedValue([
      {
        schedulerKey: "ambient-benchmarks",
        schedulerLabel: "Ambient Benchmark Refresh",
        lastRunAt: new Date(now.getTime() - 13 * HOUR_MS),
        cycleIntervalMs: SIX_HOURS_MS,
      },
      {
        schedulerKey: "research-workflows",
        schedulerLabel: "Scheduled Research Workflows",
        // 1h since lastRun, cycle = 15min → 4× cycle → stale
        lastRunAt: new Date(now.getTime() - HOUR_MS),
        cycleIntervalMs: 15 * 60 * 1000,
      },
    ]);
    const r = await evaluateSchedulerStaleAlert({ now });
    expect(r.status).toBe("ok");
    expect(r.stale).toBe(2);
    const ambient = r.outcomes?.find((o) => o.schedulerKey === "ambient-benchmarks");
    const research = r.outcomes?.find((o) => o.schedulerKey === "research-workflows");
    expect(ambient?.status).toBe("throttled");
    expect(research?.status).toBe("sent");
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "admin@example.com",
        subject: expect.stringContaining("Scheduled Research Workflows"),
      }),
    );
  });

  it("throttles correctly even with hundreds of in-window log rows (no fixed row cap)", async () => {
    // Regression for the original throttle implementation that limited
    // the lookup to the latest 200 rows. Under realistic scale (many
    // admins × multiple stale schedulers) the in-window 'sent' row for
    // a given schedulerKey could fall off the end of that window, and
    // the scheduler would be re-emailed before 24h elapsed. The fix
    // queries by `createdAt >= cutoff` with no fixed row cap.
    const now = new Date("2026-04-25T12:00:00Z");
    // 500 unrelated rows — different schedulers AND/OR different
    // recipients — all inside the 24h window.
    for (let i = 0; i < 500; i++) {
      priorNotificationLogRows.push({
        status: "sent",
        metadata: { schedulerKey: `noise-${i % 7}` },
        createdAt: new Date(now.getTime() - (i % 23) * 60 * 60 * 1000),
      });
    }
    // The relevant in-window 'sent' row for ambient-benchmarks is
    // pushed FIRST so the desc(createdAt) sort puts it past the old
    // 200-row window — proving the new query catches it regardless.
    priorNotificationLogRows.unshift({
      status: "sent",
      recipient: "admin@example.com",
      metadata: { schedulerKey: "ambient-benchmarks" },
      createdAt: new Date(now.getTime() - 23 * HOUR_MS),
    });
    listSchedulerRuns.mockResolvedValue([
      {
        schedulerKey: "ambient-benchmarks",
        schedulerLabel: "Ambient Benchmark Refresh",
        lastRunAt: new Date(now.getTime() - 13 * HOUR_MS),
        cycleIntervalMs: SIX_HOURS_MS,
      },
    ]);
    const r = await evaluateSchedulerStaleAlert({ now });
    expect(r.outcomes?.[0]?.status).toBe("throttled");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("records 'no-admins' per stale scheduler when no admin user has email", async () => {
    const now = new Date("2026-04-25T12:00:00Z");
    listSchedulerRuns.mockResolvedValue([
      {
        schedulerKey: "ambient-benchmarks",
        schedulerLabel: "Ambient Benchmark Refresh",
        lastRunAt: new Date(now.getTime() - 13 * HOUR_MS),
        cycleIntervalMs: SIX_HOURS_MS,
      },
    ]);
    getAllUsers.mockResolvedValue([{ id: 5, email: "u@example.com", role: "user" }]);
    const r = await evaluateSchedulerStaleAlert({ now });
    expect(r.status).toBe("ok");
    expect(r.outcomes?.[0]?.status).toBe("no-admins");
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
