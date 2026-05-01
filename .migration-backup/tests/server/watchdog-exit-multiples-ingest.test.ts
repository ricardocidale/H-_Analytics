/**
 * Tests for the Exit-Multiples Watchdog → Analyst exit-multiples pipeline.
 *
 * Mirror of `watchdog-capital-raise-ingest.test.ts`. Mocks the storage
 * layer so we exercise the orchestration in isolation:
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
    applyWatchdogExitMultiplesObservations: vi.fn(),
  },
}));

import { storage } from "../../server/storage";
import { applyWatchdogExitMultiplesSnapshot } from "../../server/ai/analyst-table-refresh";

const mockedStorage = storage as unknown as {
  createAnalystRefreshAuditLog: ReturnType<typeof vi.fn>;
  finalizeAnalystRefreshAuditLog: ReturnType<typeof vi.fn>;
  applyWatchdogExitMultiplesObservations: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedStorage.createAnalystRefreshAuditLog.mockResolvedValue({ id: 99 });
  mockedStorage.finalizeAnalystRefreshAuditLog.mockResolvedValue(undefined);
});

describe("applyWatchdogExitMultiplesSnapshot", () => {
  it("upserts observations and finalizes audit row as success", async () => {
    mockedStorage.applyWatchdogExitMultiplesObservations.mockResolvedValue({
      applied: [
        { dimensionKey: "saas",      label: "SaaS (revenue multiple)",      unit: "x_revenue",
          valueLow: 3, valueMid: 6, valueHigh: 12 },
        { dimensionKey: "ecommerce", label: "E-commerce (revenue multiple)", unit: "x_revenue",
          valueLow: 1, valueMid: 2, valueHigh: 4 },
      ],
      skipped: [],
    });

    const recordedAt = new Date("2026-01-01T00:00:00Z");
    const result = await applyWatchdogExitMultiplesSnapshot({
      observations: [
        { dimensionKey: "saas",      valueLow: 3, valueMid: 6, valueHigh: 12 },
        { dimensionKey: "ecommerce", valueLow: 1, valueMid: 2, valueHigh: 4 },
      ],
      sourceCount: 4,
      recordedAt,
      notes: "weekly SaaS Capital scrape",
    });

    expect(result.tableId).toBe("exit_multiples");
    expect(result.auditId).toBe(99);
    expect(result.appliedDimensions).toEqual(["saas", "ecommerce"]);
    expect(result.skippedDimensions).toEqual([]);
    expect(result.recordedAt).toBe(recordedAt);

    expect(mockedStorage.createAnalystRefreshAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: "exit_multiples",
        adminId: null,
        status: "pending",
        userAgent: "exit-multiples-watchdog",
      }),
    );
    expect(mockedStorage.applyWatchdogExitMultiplesObservations).toHaveBeenCalledWith(
      expect.any(Array),
      { sourceCount: 4, recordedAt },
    );
    expect(mockedStorage.finalizeAnalystRefreshAuditLog).toHaveBeenCalledWith(
      99,
      expect.objectContaining({
        status: "success",
        sourceCount: 4,
        diffSummary: expect.objectContaining({
          source: "exit-multiples-watchdog",
          notes: "weekly SaaS Capital scrape",
        }),
      }),
    );
  });

  it("aborts with no upserts when the snapshot is empty", async () => {
    const result = await applyWatchdogExitMultiplesSnapshot({
      observations: [],
      sourceCount: 0,
    });

    expect(result.appliedDimensions).toEqual([]);
    expect(mockedStorage.applyWatchdogExitMultiplesObservations).not.toHaveBeenCalled();
    expect(mockedStorage.finalizeAnalystRefreshAuditLog).toHaveBeenCalledWith(
      99,
      expect.objectContaining({ status: "aborted" }),
    );
  });

  it("surfaces skipped dimensions and still finalizes success when others applied", async () => {
    mockedStorage.applyWatchdogExitMultiplesObservations.mockResolvedValue({
      applied: [
        { dimensionKey: "saas", label: "SaaS (revenue multiple)", unit: "x_revenue",
          valueLow: 1, valueMid: 2, valueHigh: 3 },
      ],
      skipped: ["mysteryVertical"],
    });

    const result = await applyWatchdogExitMultiplesSnapshot({
      observations: [
        { dimensionKey: "saas",            valueLow: 1, valueMid: 2, valueHigh: 3 },
        { dimensionKey: "mysteryVertical", valueLow: 0, valueMid: 0, valueHigh: 0 },
      ],
      sourceCount: 3,
    });

    expect(result.appliedDimensions).toEqual(["saas"]);
    expect(result.skippedDimensions).toEqual(["mysteryVertical"]);
    expect(mockedStorage.finalizeAnalystRefreshAuditLog).toHaveBeenCalledWith(
      99,
      expect.objectContaining({
        status: "success",
        diffSummary: expect.objectContaining({ skipped: ["mysteryVertical"] }),
      }),
    );
  });

  it("aborts when every observation is skipped (nothing applied)", async () => {
    mockedStorage.applyWatchdogExitMultiplesObservations.mockResolvedValue({
      applied: [],
      skipped: ["mysteryVertical"],
    });

    const result = await applyWatchdogExitMultiplesSnapshot({
      observations: [
        { dimensionKey: "mysteryVertical", valueLow: 0, valueMid: 0, valueHigh: 0 },
      ],
      sourceCount: 1,
    });

    expect(result.appliedDimensions).toEqual([]);
    expect(result.skippedDimensions).toEqual(["mysteryVertical"]);
    expect(mockedStorage.finalizeAnalystRefreshAuditLog).toHaveBeenCalledWith(
      99,
      expect.objectContaining({ status: "aborted" }),
    );
  });

  it("finalizes failure and rethrows when storage upsert throws", async () => {
    mockedStorage.applyWatchdogExitMultiplesObservations.mockRejectedValue(new Error("db down"));

    await expect(
      applyWatchdogExitMultiplesSnapshot({
        observations: [
          { dimensionKey: "saas", valueLow: 1, valueMid: 2, valueHigh: 3 },
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
    mockedStorage.applyWatchdogExitMultiplesObservations.mockResolvedValue({
      applied: [
        { dimensionKey: "saas", label: "SaaS (revenue multiple)", unit: "x_revenue",
          valueLow: 1, valueMid: 2, valueHigh: 3 },
      ],
      skipped: [],
    });

    const result = await applyWatchdogExitMultiplesSnapshot({
      observations: [
        { dimensionKey: "saas", valueLow: 1, valueMid: 2, valueHigh: 3 },
      ],
      sourceCount: 2,
    });

    expect(result.auditId).toBeNull();
    expect(result.appliedDimensions).toEqual(["saas"]);
    expect(mockedStorage.finalizeAnalystRefreshAuditLog).not.toHaveBeenCalled();
  });
});
