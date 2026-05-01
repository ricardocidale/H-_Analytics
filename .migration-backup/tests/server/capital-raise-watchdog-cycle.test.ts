/**
 * Tests for the scheduled Capital-Raise Watchdog cycle.
 *
 * Mocks the LLM synthesizer (`researchCapitalRaiseBenchmarks`), the storage
 * audit-log reader, and the snapshot applier. Verifies:
 *   - cadence guard skips when a recent watchdog run exists
 *   - `force=true` overrides the cadence guard
 *   - happy path passes evidence + observations through to the applier
 *   - N+1 evidence rule (sourceCount < 3 OR evidence < 3) → aborted snapshot
 *   - LLM fallback (sourceCount=0, evidence=[]) → aborted, no rows touched
 *   - dimensions whose values are all null are dropped before apply
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/storage", () => ({
  storage: {
    getCapitalRaiseBenchmarks: vi.fn(),
    getRecentAnalystRefreshAuditLogs: vi.fn(),
  },
}));

vi.mock("../../server/ai/analyst-table-refresh", async () => {
  const actual = await vi.importActual<typeof import("../../server/ai/analyst-table-refresh")>(
    "../../server/ai/analyst-table-refresh",
  );
  return {
    ...actual,
    researchCapitalRaiseBenchmarks: vi.fn(),
    applyWatchdogCapitalRaiseSnapshot: vi.fn(),
  };
});

import { storage } from "../../server/storage";
import {
  applyWatchdogCapitalRaiseSnapshot,
  researchCapitalRaiseBenchmarks,
} from "../../server/ai/analyst-table-refresh";
import { runCapitalRaiseWatchdogCycle } from "../../server/ai/ambient/capital-raise-watchdog";

const mockedStorage = storage as unknown as {
  getCapitalRaiseBenchmarks: ReturnType<typeof vi.fn>;
  getRecentAnalystRefreshAuditLogs: ReturnType<typeof vi.fn>;
};
const mockedResearch = researchCapitalRaiseBenchmarks as unknown as ReturnType<typeof vi.fn>;
const mockedApply = applyWatchdogCapitalRaiseSnapshot as unknown as ReturnType<typeof vi.fn>;

const SAMPLE_RANGES = [
  { dimensionKey: "valuationCap",  label: "Valuation Cap (SAFE)",      unit: "usd",     valueLow: 5_000_000, valueMid: 12_000_000, valueHigh: 25_000_000 },
  { dimensionKey: "discountRate",  label: "Discount Rate (SAFE)",      unit: "percent", valueLow: 0.10,      valueMid: 0.20,        valueHigh: 0.30 },
  { dimensionKey: "trancheSize",   label: "Average Tranche Size",      unit: "usd",     valueLow: 250_000,   valueMid: 1_000_000,   valueHigh: 3_000_000 },
];

const SAMPLE_EVIDENCE = [
  { source: "Carta SAFE Report 2024",   url: "https://carta.com/x",     finding: "Median cap $12M" },
  { source: "AngelList H1 2024 Brief",  url: "https://angellist.com/y", finding: "Median discount 20%" },
  { source: "Crunchbase Insights 2024", url: "https://crunchbase.com/z",finding: "Median tranche $1M" },
];

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.CAPITAL_RAISE_WATCHDOG_CADENCE_HOURS;
  mockedStorage.getCapitalRaiseBenchmarks.mockResolvedValue([]);
  mockedStorage.getRecentAnalystRefreshAuditLogs.mockResolvedValue([]);
  mockedApply.mockResolvedValue({
    tableId: "capital_raise_benchmarks",
    auditId: 42,
    appliedDimensions: ["valuationCap", "discountRate", "trancheSize"],
    skippedDimensions: [],
    recordedAt: new Date(),
  });
});

describe("runCapitalRaiseWatchdogCycle", () => {
  it("applies the snapshot when the LLM returns enough sources (happy path)", async () => {
    mockedResearch.mockResolvedValue({
      proposedRanges: SAMPLE_RANGES,
      narration: ["…"],
      sourceCount: 4,
      tokensUsed: 1234,
      evidence: SAMPLE_EVIDENCE,
    });

    const outcome = await runCapitalRaiseWatchdogCycle();

    expect(outcome.ran).toBe(true);
    if (!outcome.ran) return;
    expect(outcome.reason).toBe("applied");
    expect(outcome.sourceCount).toBe(4);
    expect(outcome.tokensUsed).toBe(1234);
    expect(mockedApply).toHaveBeenCalledTimes(1);
    const arg = mockedApply.mock.calls[0][0];
    expect(arg.observations).toHaveLength(3);
    expect(arg.observations[0]).toMatchObject({
      dimensionKey: "valuationCap",
      label: "Valuation Cap (SAFE)",
      unit: "usd",
      valueLow: 5_000_000,
    });
    expect(arg.sourceCount).toBe(4);
    expect(arg.evidence).toEqual(SAMPLE_EVIDENCE);
    expect(arg.notes).toMatch(/scheduled watchdog refresh/i);
  });

  it("skips work when a successful run is within the cadence window", async () => {
    mockedStorage.getRecentAnalystRefreshAuditLogs.mockResolvedValue([
      {
        id: 7,
        tableId: "capital_raise_benchmarks",
        userAgent: "capital-raise-watchdog",
        status: "success",
        startedAt: new Date(Date.now() - 60 * 60 * 1000), // 1h ago
      },
    ]);

    const outcome = await runCapitalRaiseWatchdogCycle();

    expect(outcome.ran).toBe(false);
    if (outcome.ran) return;
    expect(outcome.reason).toBe("cadence_skipped");
    expect(outcome.nextEligibleAt).toBeInstanceOf(Date);
    expect(mockedResearch).not.toHaveBeenCalled();
    expect(mockedApply).not.toHaveBeenCalled();
  });

  it("ignores cadence when force=true", async () => {
    mockedStorage.getRecentAnalystRefreshAuditLogs.mockResolvedValue([
      {
        id: 7,
        tableId: "capital_raise_benchmarks",
        userAgent: "capital-raise-watchdog",
        status: "success",
        startedAt: new Date(),
      },
    ]);
    mockedResearch.mockResolvedValue({
      proposedRanges: SAMPLE_RANGES,
      narration: ["…"],
      sourceCount: 3,
      tokensUsed: 100,
      evidence: SAMPLE_EVIDENCE,
    });

    const outcome = await runCapitalRaiseWatchdogCycle({ force: true });

    expect(outcome.ran).toBe(true);
    if (!outcome.ran) return;
    expect(outcome.reason).toBe("applied");
    expect(mockedResearch).toHaveBeenCalledTimes(1);
    expect(mockedApply).toHaveBeenCalledTimes(1);
  });

  it("ignores prior 'failure' rows when computing cadence", async () => {
    mockedStorage.getRecentAnalystRefreshAuditLogs.mockResolvedValue([
      {
        id: 8,
        tableId: "capital_raise_benchmarks",
        userAgent: "capital-raise-watchdog",
        status: "failure",
        startedAt: new Date(Date.now() - 60 * 1000), // 1 minute ago — but ignored
      },
    ]);
    mockedResearch.mockResolvedValue({
      proposedRanges: SAMPLE_RANGES,
      narration: ["…"],
      sourceCount: 3,
      tokensUsed: 50,
      evidence: SAMPLE_EVIDENCE,
    });

    const outcome = await runCapitalRaiseWatchdogCycle();

    expect(outcome.ran).toBe(true);
    if (!outcome.ran) return;
    expect(outcome.reason).toBe("applied");
  });

  it("ignores stale 'pending' rows so a crashed run doesn't block the next cycle", async () => {
    mockedStorage.getRecentAnalystRefreshAuditLogs.mockResolvedValue([
      {
        id: 11,
        tableId: "capital_raise_benchmarks",
        userAgent: "capital-raise-watchdog",
        status: "pending",
        startedAt: new Date(Date.now() - 60 * 60 * 1000), // 1h ago, stale
      },
    ]);
    mockedResearch.mockResolvedValue({
      proposedRanges: SAMPLE_RANGES,
      narration: ["…"],
      sourceCount: 3,
      tokensUsed: 50,
      evidence: SAMPLE_EVIDENCE,
    });

    const outcome = await runCapitalRaiseWatchdogCycle();

    expect(outcome.ran).toBe(true);
    if (!outcome.ran) return;
    expect(outcome.reason).toBe("applied");
  });

  it("widens the audit lookup window when a very long cadence is configured", async () => {
    process.env.CAPITAL_RAISE_WATCHDOG_CADENCE_HOURS = String(24 * 60); // 60 days
    mockedResearch.mockResolvedValue({
      proposedRanges: SAMPLE_RANGES,
      narration: ["…"],
      sourceCount: 3,
      tokensUsed: 50,
      evidence: SAMPLE_EVIDENCE,
    });

    await runCapitalRaiseWatchdogCycle();

    const call = mockedStorage.getRecentAnalystRefreshAuditLogs.mock.calls[0]?.[0];
    expect(call?.sinceMs).toBeGreaterThanOrEqual(60 * 24 * 60 * 60 * 1000 * 2);
  });

  it("respects fresh 'pending' rows (in-flight call) and skips the cycle", async () => {
    mockedStorage.getRecentAnalystRefreshAuditLogs.mockResolvedValue([
      {
        id: 12,
        tableId: "capital_raise_benchmarks",
        userAgent: "capital-raise-watchdog",
        status: "pending",
        startedAt: new Date(Date.now() - 30 * 1000), // 30s ago, fresh
      },
    ]);

    const outcome = await runCapitalRaiseWatchdogCycle();

    expect(outcome.ran).toBe(false);
    if (outcome.ran) return;
    expect(outcome.reason).toBe("cadence_skipped");
    expect(mockedResearch).not.toHaveBeenCalled();
  });

  it("filters audit-log lookup to watchdog rows so manual refreshes don't gate the cadence", async () => {
    mockedResearch.mockResolvedValue({
      proposedRanges: SAMPLE_RANGES,
      narration: ["…"],
      sourceCount: 3,
      tokensUsed: 50,
      evidence: SAMPLE_EVIDENCE,
    });

    await runCapitalRaiseWatchdogCycle();

    expect(mockedStorage.getRecentAnalystRefreshAuditLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: "capital_raise_benchmarks",
        userAgent: "capital-raise-watchdog",
      }),
    );
  });

  it("aborts and writes an audit row when the LLM returns < 3 sources (N+1)", async () => {
    mockedResearch.mockResolvedValue({
      proposedRanges: SAMPLE_RANGES,
      narration: ["…"],
      sourceCount: 2,
      tokensUsed: 99,
      evidence: SAMPLE_EVIDENCE.slice(0, 2),
    });
    mockedApply.mockResolvedValueOnce({
      tableId: "capital_raise_benchmarks",
      auditId: 50,
      appliedDimensions: [],
      skippedDimensions: [],
      recordedAt: new Date(),
    });

    const outcome = await runCapitalRaiseWatchdogCycle();

    expect(outcome.ran).toBe(true);
    if (!outcome.ran) return;
    expect(outcome.reason).toBe("insufficient_evidence");
    expect(mockedApply).toHaveBeenCalledWith(
      expect.objectContaining({
        observations: [],
        sourceCount: 2,
        notes: expect.stringMatching(/aborted.*2 source/i),
      }),
    );
  });

  it("aborts when the LLM fallback path was used (sourceCount=0, evidence=[])", async () => {
    mockedResearch.mockResolvedValue({
      proposedRanges: SAMPLE_RANGES,
      narration: ["fallback…"],
      sourceCount: 0,
      tokensUsed: 0,
      evidence: [],
    });
    mockedApply.mockResolvedValueOnce({
      tableId: "capital_raise_benchmarks",
      auditId: 51,
      appliedDimensions: [],
      skippedDimensions: [],
      recordedAt: new Date(),
    });

    const outcome = await runCapitalRaiseWatchdogCycle();

    expect(outcome.ran).toBe(true);
    if (!outcome.ran) return;
    expect(outcome.reason).toBe("insufficient_evidence");
    expect(mockedApply).toHaveBeenCalledWith(
      expect.objectContaining({ observations: [] }),
    );
  });

  it("drops dimensions whose three values are all null before applying", async () => {
    mockedResearch.mockResolvedValue({
      proposedRanges: [
        ...SAMPLE_RANGES,
        { dimensionKey: "phantom", label: "Phantom", unit: "usd",
          valueLow: null, valueMid: null, valueHigh: null },
      ],
      narration: ["…"],
      sourceCount: 3,
      tokensUsed: 200,
      evidence: SAMPLE_EVIDENCE,
    });

    const outcome = await runCapitalRaiseWatchdogCycle();

    expect(outcome.ran).toBe(true);
    if (!outcome.ran) return;
    expect(outcome.reason).toBe("applied");
    const arg = mockedApply.mock.calls[0][0];
    expect(arg.observations).toHaveLength(3);
    expect(arg.observations.map((o: { dimensionKey: string }) => o.dimensionKey)).not.toContain("phantom");
  });

  it("respects CAPITAL_RAISE_WATCHDOG_CADENCE_HOURS override", async () => {
    process.env.CAPITAL_RAISE_WATCHDOG_CADENCE_HOURS = "1"; // 1h cadence
    mockedStorage.getRecentAnalystRefreshAuditLogs.mockResolvedValue([
      {
        id: 11,
        tableId: "capital_raise_benchmarks",
        userAgent: "capital-raise-watchdog",
        status: "success",
        startedAt: new Date(Date.now() - 90 * 60 * 1000), // 90 min ago
      },
    ]);
    mockedResearch.mockResolvedValue({
      proposedRanges: SAMPLE_RANGES,
      narration: ["…"],
      sourceCount: 3,
      tokensUsed: 50,
      evidence: SAMPLE_EVIDENCE,
    });

    // 1h cadence + 90min ago → eligible, should run
    const outcome = await runCapitalRaiseWatchdogCycle();

    expect(outcome.ran).toBe(true);
    if (!outcome.ran) return;
    expect(outcome.reason).toBe("applied");
  });

  it("proceeds when the audit-log read throws (cadence guard is best-effort)", async () => {
    mockedStorage.getRecentAnalystRefreshAuditLogs.mockRejectedValue(new Error("audit table down"));
    mockedResearch.mockResolvedValue({
      proposedRanges: SAMPLE_RANGES,
      narration: ["…"],
      sourceCount: 3,
      tokensUsed: 100,
      evidence: SAMPLE_EVIDENCE,
    });

    const outcome = await runCapitalRaiseWatchdogCycle();

    expect(outcome.ran).toBe(true);
    if (!outcome.ran) return;
    expect(outcome.reason).toBe("applied");
  });
});
