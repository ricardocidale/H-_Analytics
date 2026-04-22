/**
 * Tests for the scheduled Constants research refresher
 * (server/jobs/specialist-constants-refresh.ts).
 *
 * We mock the storage layer and proposeConstantRegeneration so this is a
 * pure logic test of: cadence-gating, locality fan-out, and per-row failure
 * isolation. Wall-clock interactions go through the Specialist catalog.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const listOverrides = vi.fn();
const getLatestSuccessful = vi.fn();
const createRun = vi.fn();
const propose = vi.fn();
const createActivityLog = vi.fn();

vi.mock("../../server/storage", () => ({
  storage: {
    listModelConstantOverrides: () => listOverrides(),
    getLatestSuccessfulRunForConstant: (
      key: string,
      country: string | null,
      sub: string | null,
    ) => getLatestSuccessful(key, country, sub),
    createResearchRun: (data: unknown) => createRun(data),
    createActivityLog: (data: unknown) => createActivityLog(data),
  },
}));

// db lookup for the system actor (first super_admin) — return a fixed id
// so the activity-log code path in recordFailure() runs.
vi.mock("../../server/db", () => {
  const limit = () => Promise.resolve([{ id: 1 }]);
  const orderBy = () => ({ limit });
  const where = () => ({ orderBy });
  const from = () => ({ where });
  return {
    db: {
      select: () => ({ from }),
    },
  };
});

vi.mock("../../server/ai/regenerate-constants", () => ({
  proposeConstantRegeneration: (args: unknown) => propose(args),
}));

vi.mock("../../server/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
  log: vi.fn(),
}));

import { runConstantsRefreshCycle } from "../../server/jobs/specialist-constants-refresh";

beforeEach(() => {
  listOverrides.mockReset();
  getLatestSuccessful.mockReset();
  createRun.mockReset();
  propose.mockReset();
  createActivityLog.mockReset();
  listOverrides.mockResolvedValue([]);
  createRun.mockResolvedValue({ id: 1 });
  propose.mockResolvedValue({ ok: true });
  createActivityLog.mockResolvedValue({ id: 1 });
});

describe("runConstantsRefreshCycle", () => {
  it("refreshes rows that have never been researched", async () => {
    getLatestSuccessful.mockResolvedValue(undefined);
    const summary = await runConstantsRefreshCycle();
    expect(summary.refreshed).toBeGreaterThan(0);
    expect(summary.skipped).toBe(0);
    expect(propose).toHaveBeenCalled();
  });

  it("skips rows refreshed inside the cadence window", async () => {
    // Latest *successful* run a day ago — under every cadence we declare today.
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    getLatestSuccessful.mockResolvedValue({
      startedAt: yesterday,
      completedAt: yesterday,
      status: "completed",
    });
    const summary = await runConstantsRefreshCycle();
    expect(summary.refreshed).toBe(0);
    expect(summary.skipped).toBeGreaterThan(0);
    expect(propose).not.toHaveBeenCalled();
  });

  it("isolates per-row failures and persists a failed-run marker", async () => {
    getLatestSuccessful.mockResolvedValue(undefined);
    propose.mockRejectedValueOnce(new Error("grounded search 503"));
    const summary = await runConstantsRefreshCycle();
    expect(summary.failed).toBe(1);
    expect(summary.errors[0].message).toMatch(/503/);
    // Other rows still got processed after the failure.
    expect(summary.refreshed + summary.skipped).toBeGreaterThan(0);
    // Failure was persisted as a research_runs row.
    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "model-constant",
        status: "failed",
        metadata: expect.objectContaining({ scheduledRefresh: true }),
      }),
    );
    // …and surfaced in the admin activity log so it shows up in the
    // operator-facing audit trail (not just per-row research history).
    expect(createActivityLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        action: "scheduled_constants_refresh_failed",
        entityType: "model-constant",
        metadata: expect.objectContaining({
          constantKey: expect.any(String),
          error: expect.stringMatching(/503/),
        }),
      }),
    );
  });

  it("fans out country-scoped keys to opted-in countries (US baseline + overrides)", async () => {
    listOverrides.mockResolvedValue([
      {
        id: 1,
        constantKey: "taxRate",
        country: "Spain",
        countrySubdivision: null,
        createdAt: new Date(),
      },
    ]);
    getLatestSuccessful.mockResolvedValue(undefined);
    await runConstantsRefreshCycle();
    const taxRateCalls = propose.mock.calls.filter(
      ([a]) => (a as { key: string }).key === "taxRate",
    );
    const countries = new Set(
      taxRateCalls.map(([a]) => (a as { country: string | null }).country),
    );
    expect(countries.has("United States")).toBe(true);
    expect(countries.has("Spain")).toBe(true);
  });

  it("fans out country+state keys to per-state subdivision overrides (Task #396)", async () => {
    // taxRate is a country+state key. An admin has been editing California
    // at the per-state level; the scheduler must refresh that (US,
    // California) tuple on the same cadence as the US baseline so the
    // Constants tab Stale badge stays meaningful for the per-state row.
    listOverrides.mockResolvedValue([
      {
        id: 1,
        constantKey: "taxRate",
        country: "United States",
        countrySubdivision: "California",
        createdAt: new Date(),
      },
    ]);
    getLatestSuccessful.mockResolvedValue(undefined);
    await runConstantsRefreshCycle();
    const taxRateCalls = propose.mock.calls.filter(
      ([a]) => (a as { key: string }).key === "taxRate",
    );
    const tuples = new Set(
      taxRateCalls.map(
        ([a]) =>
          `${(a as { country: string | null }).country}::${(a as { subdivision: string | null }).subdivision ?? ""}`,
      ),
    );
    // US baseline still refreshed.
    expect(tuples.has("United States::")).toBe(true);
    // Per-state row gets its own refresh — this is the new behaviour.
    expect(tuples.has("United States::California")).toBe(true);
  });
});

describe("failed-refresh isolation", () => {
  it("does not advance freshness — a failed run leaves the row due on the next cycle", async () => {
    // Simulate: scheduler has only ever recorded failures for this row.
    // getLatestSuccessfulRunForConstant returns undefined (failures are
    // filtered out at the storage layer), so the row stays due.
    getLatestSuccessful.mockResolvedValue(undefined);
    propose.mockResolvedValue({ ok: true });

    const cycle1 = await runConstantsRefreshCycle();
    expect(cycle1.refreshed).toBeGreaterThan(0);

    // Second cycle: still no *successful* run on disk → still due, still
    // refreshed. The failed marker from cycle 1 must not gate cycle 2.
    propose.mockClear();
    const cycle2 = await runConstantsRefreshCycle();
    expect(cycle2.refreshed).toBeGreaterThan(0);
    expect(propose).toHaveBeenCalled();
  });

  it("uses the older successful run when the most recent attempt failed", async () => {
    // The newest research_runs row is a failure; the storage helper
    // returns the older successful run (a week ago, well inside cadence
    // for monthly tax but past it for weekly macro).
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    getLatestSuccessful.mockResolvedValue({
      startedAt: oneWeekAgo,
      completedAt: oneWeekAgo,
      status: "completed",
    });
    const summary = await runConstantsRefreshCycle();
    // Macro (cadence=7d) → due. Tax (30d) → not due. Both fanned out
    // across multiple keys/locations, so we just assert mixed outcome.
    expect(summary.refreshed).toBeGreaterThan(0);
    expect(summary.skipped).toBeGreaterThan(0);
  });
});

describe("getRefreshCadenceDaysForConstant", () => {
  it("returns the owning Specialist's declared cadence", async () => {
    const { getRefreshCadenceDaysForConstant } = await import(
      "../../engine/analyst/registry/specialist-catalog"
    );
    expect(getRefreshCadenceDaysForConstant("taxRate")).toBe(30);
    expect(getRefreshCadenceDaysForConstant("inflationRate")).toBe(7);
    expect(getRefreshCadenceDaysForConstant("depreciationYears")).toBe(90);
    expect(getRefreshCadenceDaysForConstant("daysPerMonth")).toBe(365);
  });
});
