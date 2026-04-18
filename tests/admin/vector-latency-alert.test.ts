import { describe, it, expect, beforeEach, vi } from "vitest";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const sentEmails: Array<{ to: string; subject: string }> = [];
const createdLogs: Array<Record<string, unknown>> = [];
const recentLogs: Array<{ metadata: Record<string, unknown> | null; status: string }> = [];
let users: Array<{ id: number; email: string; role: string }> = [];
let disabledSetting: string | null = null;
let resendEnabledSetting: string | null = "true";
let overrideSettings: Record<string, string | null> = {};

vi.mock("../../server/integrations/resend", () => ({
  sendNotificationEmail: vi.fn(async (params: { to: string; subject: string }) => {
    sentEmails.push({ to: params.to, subject: params.subject });
  }),
}));

vi.mock("../../server/storage", () => ({
  storage: {
    getNotificationSetting: vi.fn(async (key: string) => {
      if (key === "vector_latency_alerts_disabled") return disabledSetting;
      if (key === "resend_enabled") return resendEnabledSetting;
      if (key in overrideSettings) return overrideSettings[key];
      return null;
    }),
    getAllUsers: vi.fn(async () => users),
    createNotificationLog: vi.fn(async (data: Record<string, unknown>) => {
      createdLogs.push(data);
      return { id: createdLogs.length, ...data };
    }),
  },
}));

vi.mock("../../server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => recentLogs,
          }),
        }),
      }),
    }),
  },
}));

vi.mock("../../server/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../server/providers/config", () => ({
  getAppUrl: () => "https://example.com",
}));

const { evaluateVectorLatencyAlert } = await import(
  "../../server/notifications/vector-latency-alert"
);

async function writeHistory(payload: unknown): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "vec-bench-"));
  await mkdir(dir, { recursive: true });
  const path = join(dir, "vector-bench-history.json");
  await writeFile(path, JSON.stringify(payload));
  return path;
}

const baseHistory = {
  thresholds: { singleP95Ms: 50, singleP50Ms: 25, multiP95Ms: 600, multiP50Ms: 300 },
  namespaces: 7,
  updatedAt: "2026-04-18T00:00:00.000Z",
  runs: [
    {
      timestamp: "2026-04-17T00:00:00.000Z",
      queries: 50,
      topK: 8,
      sizes: [1000],
      results: [
        {
          size: 1000,
          totalRowsAtRun: 1000,
          single: { count: 50, meanMs: 10, p50Ms: 8, p95Ms: 20, maxMs: 30 },
          multi: { count: 50, meanMs: 100, p50Ms: 90, p95Ms: 200, maxMs: 250 },
        },
      ],
    },
  ],
};

describe("evaluateVectorLatencyAlert", () => {
  beforeEach(() => {
    sentEmails.length = 0;
    createdLogs.length = 0;
    recentLogs.length = 0;
    users = [
      { id: 1, email: "admin@example.com", role: "admin" },
      { id: 2, email: "super@example.com", role: "super_admin" },
      { id: 3, email: "user@example.com", role: "user" },
    ];
    disabledSetting = null;
    resendEnabledSetting = "true";
    overrideSettings = {};
  });

  it("returns disabled when resend_enabled is not true", async () => {
    resendEnabledSetting = null;
    const breaching = JSON.parse(JSON.stringify(baseHistory));
    breaching.runs[0].results[0].single.p95Ms = 80;
    const path = await writeHistory(breaching);
    const result = await evaluateVectorLatencyAlert({ historyPath: path });
    expect(result.status).toBe("disabled");
    expect(sentEmails).toHaveLength(0);
  });

  it("returns no-history when the file is missing", async () => {
    const result = await evaluateVectorLatencyAlert({ historyPath: "does/not/exist.json" });
    expect(result.status).toBe("no-history");
    expect(sentEmails).toHaveLength(0);
  });

  it("returns no-breach when latest run is under thresholds", async () => {
    const path = await writeHistory(baseHistory);
    const result = await evaluateVectorLatencyAlert({ historyPath: path });
    expect(result.status).toBe("no-breach");
    expect(sentEmails).toHaveLength(0);
  });

  it("returns disabled when the setting is true", async () => {
    disabledSetting = "true";
    const path = await writeHistory(baseHistory);
    const result = await evaluateVectorLatencyAlert({ historyPath: path });
    expect(result.status).toBe("disabled");
    expect(sentEmails).toHaveLength(0);
  });

  it("emails admins on single-namespace p95 breach and dedupes on the second run", async () => {
    const breaching = JSON.parse(JSON.stringify(baseHistory));
    breaching.runs[0].results[0].single.p95Ms = 80; // > 50ms threshold
    breaching.runs[0].results[0].single.p50Ms = 40;
    const path = await writeHistory(breaching);

    const first = await evaluateVectorLatencyAlert({ historyPath: path });
    expect(first.status).toBe("ok");
    expect(first.recipients).toBe(2); // admin + super_admin
    expect(first.sent).toBe(2);
    expect(first.failed).toBe(0);
    expect(sentEmails).toHaveLength(2);
    expect(first.breaches?.[0]).toMatchObject({
      size: 1000,
      scope: "single",
      metric: "p95",
      valueMs: 80,
      thresholdMs: 50,
      p95Ms: 80,
      thresholdP95Ms: 50,
    });

    // Simulate the row being persisted so dedupe sees it on the second tick.
    recentLogs.push({ metadata: { runId: first.runId }, status: "sent" });
    sentEmails.length = 0;

    const second = await evaluateVectorLatencyAlert({ historyPath: path });
    expect(second.status).toBe("already-alerted");
    expect(sentEmails).toHaveLength(0);
  });

  it("alerts on multi-namespace p95 breach", async () => {
    const breaching = JSON.parse(JSON.stringify(baseHistory));
    breaching.runs[0].results[0].multi.p95Ms = 900; // > 600ms threshold
    breaching.runs[0].results[0].multi.p50Ms = 500;
    const path = await writeHistory(breaching);

    const result = await evaluateVectorLatencyAlert({ historyPath: path });
    expect(result.status).toBe("ok");
    expect(result.breaches?.some((b) => b.scope === "multi" && b.p95Ms === 900)).toBe(true);
  });

  it("uses single p95 override to trigger a breach where the file threshold would not", async () => {
    // File threshold is 50ms; the run measured 30ms so without override there is no breach.
    const passing = JSON.parse(JSON.stringify(baseHistory));
    passing.runs[0].results[0].single.p95Ms = 30;
    const path = await writeHistory(passing);

    // Sanity check: no breach without override.
    expect((await evaluateVectorLatencyAlert({ historyPath: path })).status).toBe("no-breach");

    // With a stricter override (20ms), the same run should breach.
    overrideSettings["vector_latency_single_p95_override"] = "20";
    const result = await evaluateVectorLatencyAlert({ historyPath: path });
    expect(result.status).toBe("ok");
    expect(result.breaches?.[0]).toMatchObject({ scope: "single", p95Ms: 30, thresholdP95Ms: 20 });
  });

  it("uses multi p95 override to relax breach detection when set higher", async () => {
    // File multi threshold is 600ms; configure run to breach at 700ms.
    const breaching = JSON.parse(JSON.stringify(baseHistory));
    breaching.runs[0].results[0].multi.p95Ms = 700;
    const path = await writeHistory(breaching);

    // Without override -> breach.
    expect((await evaluateVectorLatencyAlert({ historyPath: path })).status).toBe("ok");
    sentEmails.length = 0;
    recentLogs.push({ metadata: { runId: "2026-04-17T00:00:00.000Z" }, status: "sent" });

    // Reset dedupe and raise the override so the same run is no longer a breach.
    recentLogs.length = 0;
    overrideSettings["vector_latency_multi_p95_override"] = "1000";
    const result = await evaluateVectorLatencyAlert({ historyPath: path });
    expect(result.status).toBe("no-breach");
  });

  it("ignores invalid override values and falls back to file thresholds", async () => {
    const breaching = JSON.parse(JSON.stringify(baseHistory));
    breaching.runs[0].results[0].single.p95Ms = 80; // > 50ms file threshold
    const path = await writeHistory(breaching);

    overrideSettings["vector_latency_single_p95_override"] = "not-a-number";
    overrideSettings["vector_latency_multi_p95_override"] = "-5";
    const result = await evaluateVectorLatencyAlert({ historyPath: path });
    expect(result.status).toBe("ok");
    expect(result.breaches?.[0]).toMatchObject({ scope: "single", thresholdP95Ms: 50 });
  });

  it("restricts recipients to the configured admin user ids", async () => {
    overrideSettings["vector_latency_recipient_user_ids"] = JSON.stringify([2]); // only the super admin
    const breaching = JSON.parse(JSON.stringify(baseHistory));
    breaching.runs[0].results[0].single.p95Ms = 80;
    const path = await writeHistory(breaching);

    const result = await evaluateVectorLatencyAlert({ historyPath: path });
    expect(result.status).toBe("ok");
    expect(result.recipients).toBe(1);
    expect(sentEmails.map((e) => e.to)).toEqual(["super@example.com"]);
  });

  it("never sends to non-admins even if their id is configured", async () => {
    overrideSettings["vector_latency_recipient_user_ids"] = JSON.stringify([3]); // user@example.com is not an admin
    const breaching = JSON.parse(JSON.stringify(baseHistory));
    breaching.runs[0].results[0].single.p95Ms = 80;
    const path = await writeHistory(breaching);

    const result = await evaluateVectorLatencyAlert({ historyPath: path });
    expect(result.status).toBe("no-admins");
    expect(sentEmails).toHaveLength(0);
  });

  it("falls back to all admins when the recipient setting is malformed", async () => {
    overrideSettings["vector_latency_recipient_user_ids"] = "not-json";
    const breaching = JSON.parse(JSON.stringify(baseHistory));
    breaching.runs[0].results[0].single.p95Ms = 80;
    const path = await writeHistory(breaching);

    const result = await evaluateVectorLatencyAlert({ historyPath: path });
    expect(result.status).toBe("ok");
    expect(result.recipients).toBe(2);
  });

  it("records failed send and still returns ok when one admin email throws", async () => {
    const { sendNotificationEmail } = await import("../../server/integrations/resend");
    vi.mocked(sendNotificationEmail).mockImplementationOnce(async () => {
      throw new Error("resend 503");
    });

    const breaching = JSON.parse(JSON.stringify(baseHistory));
    breaching.runs[0].results[0].single.p95Ms = 80;
    const path = await writeHistory(breaching);

    const result = await evaluateVectorLatencyAlert({ historyPath: path });
    expect(result.status).toBe("ok");
    expect(result.recipients).toBe(2);
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
    const statuses = createdLogs.map((l) => l.status);
    expect(statuses).toContain("failed");
    expect(statuses).toContain("sent");
    const failedLog = createdLogs.find((l) => l.status === "failed");
    expect(failedLog?.errorMessage).toContain("resend 503");
  });

  it("picks the latest run when history has multiple out-of-order runs", async () => {
    const multi = JSON.parse(JSON.stringify(baseHistory));
    const olderBreaching = JSON.parse(JSON.stringify(multi.runs[0]));
    olderBreaching.timestamp = "2026-04-15T00:00:00.000Z";
    olderBreaching.results[0].single.p95Ms = 999;
    multi.runs = [multi.runs[0], olderBreaching]; // newest first; older breaches but is older
    const path = await writeHistory(multi);

    const result = await evaluateVectorLatencyAlert({ historyPath: path });
    expect(result.status).toBe("no-breach");
    expect(sentEmails).toHaveLength(0);
  });

  it("alerts on single-namespace p50 breach when file thresholds.singleP50Ms is set", async () => {
    const breaching = JSON.parse(JSON.stringify(baseHistory));
    // p95 (20) is well under 50; p50 (30) breaches the 25ms file threshold.
    breaching.runs[0].results[0].single.p50Ms = 30;
    const path = await writeHistory(breaching);

    const result = await evaluateVectorLatencyAlert({ historyPath: path });
    expect(result.status).toBe("ok");
    expect(result.breaches).toEqual([
      expect.objectContaining({
        size: 1000,
        scope: "single",
        metric: "p50",
        valueMs: 30,
        thresholdMs: 25,
      }),
    ]);
  });

  it("alerts on multi-namespace p50 breach", async () => {
    const breaching = JSON.parse(JSON.stringify(baseHistory));
    breaching.runs[0].results[0].multi.p50Ms = 400; // > 300ms file threshold
    const path = await writeHistory(breaching);

    const result = await evaluateVectorLatencyAlert({ historyPath: path });
    expect(result.status).toBe("ok");
    expect(result.breaches).toEqual([
      expect.objectContaining({ scope: "multi", metric: "p50", valueMs: 400, thresholdMs: 300 }),
    ]);
  });

  it("admin override for single p50 takes precedence over the file threshold", async () => {
    // File thresholds.singleP50Ms = 25; p50 = 22 would normally pass.
    overrideSettings["vector_latency_single_p50_override"] = "20";
    const path = await writeHistory(baseHistory); // p50=8, p95=20, both under
    // Bump p50 to 22 so it breaches the 20ms override but not the 25ms file value.
    const tweaked = JSON.parse(JSON.stringify(baseHistory));
    tweaked.runs[0].results[0].single.p50Ms = 22;
    const path2 = await writeHistory(tweaked);

    const noOverride = await evaluateVectorLatencyAlert({ historyPath: path });
    expect(noOverride.status).toBe("no-breach");

    const result = await evaluateVectorLatencyAlert({ historyPath: path2 });
    expect(result.status).toBe("ok");
    expect(result.breaches).toEqual([
      expect.objectContaining({ scope: "single", metric: "p50", valueMs: 22, thresholdMs: 20 }),
    ]);
  });

  it("admin override for multi p50 enables p50 alerting even if file omits the threshold", async () => {
    const noFileP50 = JSON.parse(JSON.stringify(baseHistory));
    delete noFileP50.thresholds.multiP50Ms;
    delete noFileP50.thresholds.singleP50Ms;
    noFileP50.runs[0].results[0].multi.p50Ms = 150;
    overrideSettings["vector_latency_multi_p50_override"] = "100";
    const path = await writeHistory(noFileP50);

    const result = await evaluateVectorLatencyAlert({ historyPath: path });
    expect(result.status).toBe("ok");
    expect(result.breaches).toEqual([
      expect.objectContaining({ scope: "multi", metric: "p50", valueMs: 150, thresholdMs: 100 }),
    ]);
  });

  it("admin override for single p95 also takes precedence", async () => {
    overrideSettings["vector_latency_single_p95_override"] = "15";
    const path = await writeHistory(baseHistory); // p95 = 20

    const result = await evaluateVectorLatencyAlert({ historyPath: path });
    expect(result.status).toBe("ok");
    expect(result.breaches).toEqual([
      expect.objectContaining({ scope: "single", metric: "p95", valueMs: 20, thresholdMs: 15 }),
    ]);
  });

  it("blank or non-positive override strings fall back to file thresholds", async () => {
    overrideSettings["vector_latency_single_p50_override"] = "";
    overrideSettings["vector_latency_multi_p50_override"] = "0";
    const path = await writeHistory(baseHistory);
    const result = await evaluateVectorLatencyAlert({ historyPath: path });
    expect(result.status).toBe("no-breach");
  });

  it("returns no-admins when no admin users exist", async () => {
    users = [{ id: 1, email: "user@example.com", role: "user" }];
    const breaching = JSON.parse(JSON.stringify(baseHistory));
    breaching.runs[0].results[0].single.p95Ms = 80;
    const path = await writeHistory(breaching);

    const result = await evaluateVectorLatencyAlert({ historyPath: path });
    expect(result.status).toBe("no-admins");
    expect(sentEmails).toHaveLength(0);
  });
});
