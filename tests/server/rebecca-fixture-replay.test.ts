/**
 * Tests for the scheduled Rebecca preview-fixture replayer
 * (server/jobs/rebecca-fixture-replay.ts).
 *
 * Mocks storage, the replay runner, and the notification engine so this
 * is a pure logic test of: per-turn classification, drift fingerprint
 * suppression, recovery clearing, kill-switch behavior, per-fixture
 * try/catch isolation, and scheduler-cycle bookkeeping.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const listFixtures = vi.fn();
const getNotificationSetting = vi.fn();
const getAllUsers = vi.fn();
const recordResult = vi.fn();
const getGlobalAssumptions = vi.fn();

vi.mock("../../server/storage", () => ({
  storage: {
    listRebeccaPreviewFixtures: () => listFixtures(),
    getNotificationSetting: (k: string) => getNotificationSetting(k),
    getAllUsers: () => getAllUsers(),
    recordRebeccaFixtureReplayResult: (id: number, r: unknown) => recordResult(id, r),
    getGlobalAssumptions: (id: number) => getGlobalAssumptions(id),
  },
}));

const recordSchedulerCycle = vi.fn();
vi.mock("../../server/jobs/scheduler-run-tracker", () => ({
  recordSchedulerCycle: (...a: unknown[]) => recordSchedulerCycle(...a),
  truncateNotes: (s: string | null) => s,
}));

const runFixtureReplayTurn = vi.fn();
vi.mock("../../server/ai/rebecca-preview-runner", () => ({
  runFixtureReplayTurn: (...a: unknown[]) => runFixtureReplayTurn(...a),
}));

const processEvent = vi.fn();
vi.mock("../../server/notifications/engine", () => ({
  processNotificationEvent: (e: unknown) => processEvent(e),
}));

vi.mock("../../server/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
  log: vi.fn(),
}));

vi.mock("../../server/providers/config", () => ({
  getAppUrl: () => "https://example.test",
}));

// db / users mock — only used by resolveSystemActorId. The chain has to
// be defined inside the factory since vi.mock is hoisted above any
// module-scope variable initialization.
vi.mock("../../server/db", () => {
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => Promise.resolve([{ id: 1 }]),
  };
  return { db: chain };
});

import {
  runRebeccaFixtureReplayCycle,
  __resetFixtureReplayStateForTest,
} from "../../server/jobs/rebecca-fixture-replay";

function fixture(id: number, name: string, baseline: string[]) {
  // Build alternating user/assistant turns using the baseline replies.
  const turns: Array<{ role: "user" | "assistant"; content: string; ts: number }> = [];
  for (let i = 0; i < baseline.length; i += 1) {
    turns.push({ role: "user", content: `prompt-${i}`, ts: i * 2 });
    turns.push({ role: "assistant", content: baseline[i], ts: i * 2 + 1 });
  }
  return {
    id,
    name,
    description: null,
    settings: { llm: { provider: "openai", model: "gpt-4o" } },
    turns,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastReplayAt: null,
    lastReplayStatus: null,
    lastReplaySummary: null,
    lastReplayFingerprint: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetFixtureReplayStateForTest();
  getAllUsers.mockResolvedValue([
    { id: 1, email: "admin@example.com", role: "super_admin" },
  ]);
  getNotificationSetting.mockResolvedValue(null);
  recordResult.mockResolvedValue(undefined);
  getGlobalAssumptions.mockResolvedValue({ rebeccaSystemPrompt: "sys" });
});

describe("runRebeccaFixtureReplayCycle", () => {
  it("classifies an unchanged fixture as 'pass' and does not notify", async () => {
    listFixtures.mockResolvedValue([fixture(10, "stable", ["A", "B"])]);
    runFixtureReplayTurn
      .mockResolvedValueOnce({ response: "A", provider: "openai", model: "x", usedFallback: false })
      .mockResolvedValueOnce({ response: "B", provider: "openai", model: "x", usedFallback: false });

    const result = await runRebeccaFixtureReplayCycle();

    expect(result.passed).toBe(1);
    expect(result.drifted).toBe(0);
    expect(result.notified).toBe(0);
    expect(processEvent).not.toHaveBeenCalled();
    expect(recordResult).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        lastReplayStatus: "pass",
        lastReplayFingerprint: null,
      }),
    );
    expect(recordSchedulerCycle).toHaveBeenCalledWith(
      expect.objectContaining({ key: "rebecca-fixture-replay", status: "ok" }),
    );
  });

  it("flags drifted turns, notifies admins, and suppresses repeat with same fingerprint", async () => {
    listFixtures.mockResolvedValue([fixture(20, "drifty", ["A", "B"])]);
    // First cycle: turn 0 differs ("Z" instead of "A"), turn 1 matches.
    runFixtureReplayTurn
      .mockResolvedValueOnce({ response: "Z", provider: "openai", model: "x", usedFallback: false })
      .mockResolvedValueOnce({ response: "B", provider: "openai", model: "x", usedFallback: false });

    const cycle1 = await runRebeccaFixtureReplayCycle();
    expect(cycle1.drifted).toBe(1);
    expect(cycle1.notified).toBe(1);
    expect(processEvent).toHaveBeenCalledTimes(1);

    // Second cycle: identical drift shape (same per-turn statuses).
    runFixtureReplayTurn
      .mockResolvedValueOnce({ response: "Y", provider: "openai", model: "x", usedFallback: false })
      .mockResolvedValueOnce({ response: "B", provider: "openai", model: "x", usedFallback: false });

    const cycle2 = await runRebeccaFixtureReplayCycle();
    expect(cycle2.drifted).toBe(1);
    expect(cycle2.notified).toBe(0);
    expect(cycle2.suppressed).toBe(1);
    expect(processEvent).toHaveBeenCalledTimes(1);
  });

  it("clears the fingerprint on recovery so a future drift re-notifies", async () => {
    listFixtures.mockResolvedValue([fixture(30, "recoverer", ["A"])]);

    runFixtureReplayTurn.mockResolvedValueOnce({ response: "Z", provider: "openai", model: "x", usedFallback: false });
    await runRebeccaFixtureReplayCycle();
    expect(processEvent).toHaveBeenCalledTimes(1);

    runFixtureReplayTurn.mockResolvedValueOnce({ response: "A", provider: "openai", model: "x", usedFallback: false });
    await runRebeccaFixtureReplayCycle();
    expect(processEvent).toHaveBeenCalledTimes(1); // pass, no extra notify

    runFixtureReplayTurn.mockResolvedValueOnce({ response: "Z", provider: "openai", model: "x", usedFallback: false });
    await runRebeccaFixtureReplayCycle();
    expect(processEvent).toHaveBeenCalledTimes(2); // recovered then re-drifted → re-notify
  });

  it("kill switch suppresses notifications but still records the row", async () => {
    listFixtures.mockResolvedValue([fixture(40, "killed", ["A"])]);
    getNotificationSetting.mockImplementation((k: string) =>
      Promise.resolve(k === "rebecca_fixture_drift_disabled" ? "true" : null),
    );
    runFixtureReplayTurn.mockResolvedValueOnce({ response: "Z", provider: "openai", model: "x", usedFallback: false });

    const r = await runRebeccaFixtureReplayCycle();
    expect(r.drifted).toBe(1);
    expect(r.notified).toBe(0);
    expect(r.suppressed).toBe(1);
    expect(processEvent).not.toHaveBeenCalled();
    expect(recordResult).toHaveBeenCalledWith(
      40,
      expect.objectContaining({ lastReplayStatus: "drifted" }),
    );
  });

  it("an errored turn marks the fixture errored and notifies admins", async () => {
    listFixtures.mockResolvedValue([fixture(50, "broken", ["A", "B"])]);
    runFixtureReplayTurn.mockRejectedValueOnce(new Error("provider down"));

    const r = await runRebeccaFixtureReplayCycle();
    expect(r.errored).toBe(1);
    expect(r.notified).toBe(1);
    expect(recordResult).toHaveBeenCalledWith(
      50,
      expect.objectContaining({ lastReplayStatus: "errored" }),
    );
    expect(processEvent).toHaveBeenCalledTimes(1);
  });

  it("survives process restart: hydrates suppression from the persisted fingerprint", async () => {
    // Simulate a restart by clearing the in-memory map between
    // arranging the prior fingerprint and running the next cycle. The
    // fixture row carries the fingerprint we'd have remembered if the
    // process had stayed up.
    const f = fixture(70, "post-restart", ["A"]);

    // First cycle in this "process": drift detected, admins notified.
    listFixtures.mockResolvedValue([f]);
    runFixtureReplayTurn.mockResolvedValueOnce({ response: "Z", provider: "openai", model: "x", usedFallback: false });
    await runRebeccaFixtureReplayCycle();
    expect(processEvent).toHaveBeenCalledTimes(1);
    const fingerprint = recordResult.mock.calls[0][1].lastReplayFingerprint as string;
    expect(fingerprint).toBeTruthy();

    // "Restart" the process: reset module state so the in-memory map
    // is empty, but persist the fingerprint on the fixture row so the
    // hydration path picks it up.
    __resetFixtureReplayStateForTest();
    processEvent.mockClear();
    recordResult.mockClear();
    listFixtures.mockResolvedValue([{ ...f, lastReplayFingerprint: fingerprint }]);
    runFixtureReplayTurn.mockResolvedValueOnce({ response: "Y", provider: "openai", model: "x", usedFallback: false });

    const r = await runRebeccaFixtureReplayCycle();
    expect(r.drifted).toBe(1);
    expect(r.suppressed).toBe(1);
    expect(processEvent).not.toHaveBeenCalled();
  });

  it("isolates a per-fixture failure from the rest of the cycle", async () => {
    listFixtures.mockResolvedValue([
      fixture(60, "first-bad", ["A"]),
      fixture(61, "second-good", ["B"]),
    ]);
    // First fixture errors, second passes.
    runFixtureReplayTurn
      .mockRejectedValueOnce(new Error("first failed"))
      .mockResolvedValueOnce({ response: "B", provider: "openai", model: "x", usedFallback: false });

    const r = await runRebeccaFixtureReplayCycle();
    expect(r.considered).toBe(2);
    expect(r.errored).toBe(1);
    expect(r.passed).toBe(1);
    expect(recordResult).toHaveBeenCalledTimes(2);
  });
});
