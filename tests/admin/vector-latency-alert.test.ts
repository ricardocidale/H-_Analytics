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
    expect(first.breaches?.[0]).toMatchObject({ size: 1000, scope: "single", p95Ms: 80, thresholdP95Ms: 50 });

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
