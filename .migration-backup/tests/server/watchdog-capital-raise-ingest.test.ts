/**
 * Tests for the Capital-Raise Watchdog → Analyst benchmarks pipeline.
 *
 * Mocks the storage layer so we exercise the orchestration in isolation:
 *   - audit row opened → finalized success
 *   - empty snapshot → finalized aborted, no upserts
 *   - storage failure → finalized failure, error rethrown
 *   - skipped dimensions surface in the result and audit diff
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/storage", () => ({
  storage: {
    createAnalystRefreshAuditLog: vi.fn(),
    finalizeAnalystRefreshAuditLog: vi.fn(),
    applyWatchdogCapitalRaiseObservations: vi.fn(),
  },
}));

import { storage } from "../../server/storage";
import { applyWatchdogCapitalRaiseSnapshot } from "../../server/ai/analyst-table-refresh";

const mockedStorage = storage as unknown as {
  createAnalystRefreshAuditLog: ReturnType<typeof vi.fn>;
  finalizeAnalystRefreshAuditLog: ReturnType<typeof vi.fn>;
  applyWatchdogCapitalRaiseObservations: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedStorage.createAnalystRefreshAuditLog.mockResolvedValue({ id: 99 });
  mockedStorage.finalizeAnalystRefreshAuditLog.mockResolvedValue(undefined);
});

describe("applyWatchdogCapitalRaiseSnapshot", () => {
  it("upserts observations and finalizes audit row as success", async () => {
    mockedStorage.applyWatchdogCapitalRaiseObservations.mockResolvedValue({
      applied: [
        { dimensionKey: "valuationCap", label: "Valuation Cap", unit: "usd",
          valueLow: 5_000_000, valueMid: 12_000_000, valueHigh: 25_000_000 },
        { dimensionKey: "discountRate", label: "Discount Rate", unit: "percent",
          valueLow: 0.1, valueMid: 0.2, valueHigh: 0.3 },
      ],
      skipped: [],
    });

    const recordedAt = new Date("2026-01-01T00:00:00Z");
    const result = await applyWatchdogCapitalRaiseSnapshot({
      observations: [
        { dimensionKey: "valuationCap", valueLow: 5_000_000, valueMid: 12_000_000, valueHigh: 25_000_000 },
        { dimensionKey: "discountRate", valueLow: 0.1, valueMid: 0.2, valueHigh: 0.3 },
      ],
      sourceCount: 4,
      recordedAt,
      notes: "weekly Carta scrape",
    });

    expect(result.tableId).toBe("capital_raise_benchmarks");
    expect(result.auditId).toBe(99);
    expect(result.appliedDimensions).toEqual(["valuationCap", "discountRate"]);
    expect(result.skippedDimensions).toEqual([]);
    expect(result.recordedAt).toBe(recordedAt);

    expect(mockedStorage.createAnalystRefreshAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: "capital_raise_benchmarks",
        adminId: null,
        status: "pending",
        userAgent: "capital-raise-watchdog",
      }),
    );
    expect(mockedStorage.applyWatchdogCapitalRaiseObservations).toHaveBeenCalledWith(
      expect.any(Array),
      { sourceCount: 4, recordedAt },
    );
    expect(mockedStorage.finalizeAnalystRefreshAuditLog).toHaveBeenCalledWith(
      99,
      expect.objectContaining({
        status: "success",
        sourceCount: 4,
        diffSummary: expect.objectContaining({
          source: "capital-raise-watchdog",
          notes: "weekly Carta scrape",
        }),
      }),
    );
  });

  it("aborts with no upserts when the snapshot is empty", async () => {
    const result = await applyWatchdogCapitalRaiseSnapshot({
      observations: [],
      sourceCount: 0,
    });

    expect(result.appliedDimensions).toEqual([]);
    expect(mockedStorage.applyWatchdogCapitalRaiseObservations).not.toHaveBeenCalled();
    expect(mockedStorage.finalizeAnalystRefreshAuditLog).toHaveBeenCalledWith(
      99,
      expect.objectContaining({ status: "aborted" }),
    );
  });

  it("surfaces skipped dimensions and still finalizes success when others applied", async () => {
    mockedStorage.applyWatchdogCapitalRaiseObservations.mockResolvedValue({
      applied: [
        { dimensionKey: "valuationCap", label: "Valuation Cap", unit: "usd",
          valueLow: 1, valueMid: 2, valueHigh: 3 },
      ],
      skipped: ["mysteryDimension"],
    });

    const result = await applyWatchdogCapitalRaiseSnapshot({
      observations: [
        { dimensionKey: "valuationCap", valueLow: 1, valueMid: 2, valueHigh: 3 },
        { dimensionKey: "mysteryDimension", valueLow: 0, valueMid: 0, valueHigh: 0 },
      ],
      sourceCount: 3,
    });

    expect(result.appliedDimensions).toEqual(["valuationCap"]);
    expect(result.skippedDimensions).toEqual(["mysteryDimension"]);
    expect(mockedStorage.finalizeAnalystRefreshAuditLog).toHaveBeenCalledWith(
      99,
      expect.objectContaining({
        status: "success",
        diffSummary: expect.objectContaining({ skipped: ["mysteryDimension"] }),
      }),
    );
  });

  it("aborts when every observation is skipped (nothing applied)", async () => {
    mockedStorage.applyWatchdogCapitalRaiseObservations.mockResolvedValue({
      applied: [],
      skipped: ["mysteryDimension"],
    });

    const result = await applyWatchdogCapitalRaiseSnapshot({
      observations: [
        { dimensionKey: "mysteryDimension", valueLow: 0, valueMid: 0, valueHigh: 0 },
      ],
      sourceCount: 1,
    });

    expect(result.appliedDimensions).toEqual([]);
    expect(result.skippedDimensions).toEqual(["mysteryDimension"]);
    expect(mockedStorage.finalizeAnalystRefreshAuditLog).toHaveBeenCalledWith(
      99,
      expect.objectContaining({ status: "aborted" }),
    );
  });

  it("finalizes failure and rethrows when storage upsert throws", async () => {
    mockedStorage.applyWatchdogCapitalRaiseObservations.mockRejectedValue(new Error("db down"));

    await expect(
      applyWatchdogCapitalRaiseSnapshot({
        observations: [
          { dimensionKey: "valuationCap", valueLow: 1, valueMid: 2, valueHigh: 3 },
        ],
        sourceCount: 2,
      }),
    ).rejects.toThrow("db down");

    expect(mockedStorage.finalizeAnalystRefreshAuditLog).toHaveBeenCalledWith(
      99,
      expect.objectContaining({ status: "failure", errorMessage: "db down" }),
    );
  });

  it("still applies observations when audit-log open fails (best-effort)", async () => {
    mockedStorage.createAnalystRefreshAuditLog.mockRejectedValue(new Error("audit table missing"));
    mockedStorage.applyWatchdogCapitalRaiseObservations.mockResolvedValue({
      applied: [
        { dimensionKey: "valuationCap", label: "Valuation Cap", unit: "usd",
          valueLow: 1, valueMid: 2, valueHigh: 3 },
      ],
      skipped: [],
    });

    const result = await applyWatchdogCapitalRaiseSnapshot({
      observations: [
        { dimensionKey: "valuationCap", valueLow: 1, valueMid: 2, valueHigh: 3 },
      ],
      sourceCount: 2,
    });

    expect(result.auditId).toBeNull();
    expect(result.appliedDimensions).toEqual(["valuationCap"]);
    expect(mockedStorage.finalizeAnalystRefreshAuditLog).not.toHaveBeenCalled();
  });
});
