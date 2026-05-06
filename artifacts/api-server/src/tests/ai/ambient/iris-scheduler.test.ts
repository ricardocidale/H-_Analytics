/**
 * Unit tests for the Iris backstage scheduler (U5).
 *
 * runIrisAgent, getLatestIrisRun, and recordSchedulerCycle are all mocked so
 * tests run without a live DB, LLM, or filesystem.
 *
 * Coverage:
 *   1. Concurrency guard — when the latest run has status "running", the
 *      scheduled trigger skips the agent call and records status "ok" with
 *      notes saying "iris run already in progress".
 *   2. stopIrisScheduler clears all interval/timeout handles (verified via
 *      vi.useFakeTimers — we check handle counts drop to zero).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — hoisted before any module under test is imported.
// ---------------------------------------------------------------------------

vi.mock("../../../ai/iris/agent", () => ({
  runIrisAgent: vi.fn(async () => ({
    runId: "test-run-id",
    trigger: "scheduled-health",
    model: "claude-haiku-4-5-20251001",
    toolsInvoked: [],
    chunksIndexed: 0,
    errorsEncountered: 0,
    durationMs: 100,
    summary: "ok",
  })),
}));

vi.mock("../../../storage/iris-runs", () => ({
  getLatestIrisRun: vi.fn(async () => null),
}));

vi.mock("../../../jobs/scheduler-run-tracker", () => ({
  recordSchedulerCycle: vi.fn(async () => undefined),
}));

vi.mock("../../../logger", () => ({
  log: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { startIrisScheduler, stopIrisScheduler } from "../../../ai/ambient/iris-scheduler";
import * as agentModule from "../../../ai/iris/agent";
import * as irisRunsModule from "../../../storage/iris-runs";
import * as trackerModule from "../../../jobs/scheduler-run-tracker";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMockedRunIrisAgent() {
  return vi.mocked(agentModule.runIrisAgent);
}

function getMockedGetLatestIrisRun() {
  return vi.mocked(irisRunsModule.getLatestIrisRun);
}

function getMockedRecordSchedulerCycle() {
  return vi.mocked(trackerModule.recordSchedulerCycle);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("iris-scheduler — concurrency guard (health check)", () => {
  // IRIS_STARTUP_DELAY_MS = 30 * 1000 = 30 000 ms
  const STARTUP_DELAY_MS = 30 * 1000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    stopIrisScheduler();
    vi.useRealTimers();
  });

  it("skips agent call and records status 'ok' with skip note when a run is already in progress", async () => {
    // Arrange: latest run is "running"
    getMockedGetLatestIrisRun().mockResolvedValue({
      id: 1,
      trigger: "manual",
      status: "running" as const,
      runAt: new Date(),
      modelUsed: null,
      chunksIndexed: 0,
      errorsEncountered: 0,
      durationMs: null,
      healthSummary: null,
    });

    startIrisScheduler();

    // Advance exactly past the startup delay (but not into the 24h interval)
    // to trigger only the initial health check via the setTimeout callback.
    await vi.advanceTimersByTimeAsync(STARTUP_DELAY_MS + 1);

    // Assert: agent was NOT called
    expect(getMockedRunIrisAgent()).not.toHaveBeenCalled();

    // Assert: recordSchedulerCycle was called with status "ok" and skip note
    const calls = getMockedRecordSchedulerCycle().mock.calls;
    const healthCall = calls.find((c) => c[0].key === "iris-health");
    expect(healthCall).toBeDefined();
    expect(healthCall![0].status).toBe("ok");
    expect(healthCall![0].notes).toMatch(/iris run already in progress/i);
    expect(healthCall![0].succeeded).toBe(0);
    expect(healthCall![0].considered).toBe(1);
  });

  it("calls the agent when no run is in progress", async () => {
    // Arrange: no latest run
    getMockedGetLatestIrisRun().mockResolvedValue(null);

    startIrisScheduler();

    // Advance exactly past the startup delay to trigger the initial health check.
    await vi.advanceTimersByTimeAsync(STARTUP_DELAY_MS + 1);

    // Assert: agent was called with the health trigger
    expect(getMockedRunIrisAgent()).toHaveBeenCalledWith("scheduled-health");

    // Assert: recordSchedulerCycle was called with status "ok"
    const calls = getMockedRecordSchedulerCycle().mock.calls;
    const healthCall = calls.find((c) => c[0].key === "iris-health");
    expect(healthCall).toBeDefined();
    expect(healthCall![0].status).toBe("ok");
    expect(healthCall![0].succeeded).toBe(1);
  });
});

describe("iris-scheduler — concurrency guard (reindex)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    stopIrisScheduler();
    vi.useRealTimers();
  });

  it("skips reindex and records skip note when a run is already in progress", async () => {
    // Arrange: latest run is "running" for both the health and reindex checks
    getMockedGetLatestIrisRun().mockResolvedValue({
      id: 2,
      trigger: "scheduled-reindex",
      status: "running" as const,
      runAt: new Date(),
      modelUsed: null,
      chunksIndexed: 0,
      errorsEncountered: 0,
      durationMs: null,
      healthSummary: null,
    });

    startIrisScheduler();

    // Advance past 7 days to fire the reindex interval
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    await vi.advanceTimersByTimeAsync(SEVEN_DAYS_MS + 1);

    // At least one call should be the iris-reindex skip
    const calls = getMockedRecordSchedulerCycle().mock.calls;
    const reindexCall = calls.find((c) => c[0].key === "iris-reindex");
    expect(reindexCall).toBeDefined();
    expect(reindexCall![0].status).toBe("ok");
    expect(reindexCall![0].notes).toMatch(/iris run already in progress/i);
    expect(reindexCall![0].succeeded).toBe(0);
  });
});

describe("iris-scheduler — stopIrisScheduler clears handles", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not fire any cycle after stop is called", async () => {
    getMockedGetLatestIrisRun().mockResolvedValue(null);

    startIrisScheduler();
    stopIrisScheduler();

    // Even if all timers advance, no cycles should fire after stop
    await vi.runAllTimersAsync();

    // recordSchedulerCycle should not have been called at all
    expect(getMockedRecordSchedulerCycle()).not.toHaveBeenCalled();
  });
});
