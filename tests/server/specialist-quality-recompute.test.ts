/**
 * Tests for the nightly Specialist quality recomputer
 * (server/jobs/specialist-quality-recompute.ts).
 *
 * We mock the storage layer, the recompute function, and the notification
 * engine so this is a pure logic test of band detection, transition
 * counting, fingerprint suppression, and per-Specialist failure isolation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Stub the SPECIALIST_CATALOG so we control the iteration set without
// coupling the test to whatever real Specialists ship in the catalog.
vi.mock("../../engine/analyst/registry/specialist-catalog", () => ({
  SPECIALIST_CATALOG: [
    { id: "alpha" },
    { id: "bravo" },
    { id: "charlie" },
  ],
}));

const getLatestSnapshot = vi.fn();
const getAllUsers = vi.fn();
const getNotificationSetting = vi.fn();

vi.mock("../../server/storage", () => ({
  storage: {
    getLatestQualitySnapshot: (id: string) => getLatestSnapshot(id),
    getAllUsers: () => getAllUsers(),
    getNotificationSetting: (k: string) => getNotificationSetting(k),
  },
}));

const recompute = vi.fn();
vi.mock("../../server/ai/research-quality", () => ({
  recomputeAndRecordSpecialistQuality: (id: string) => recompute(id),
}));

const processEvent = vi.fn();
vi.mock("../../server/notifications/engine", () => ({
  processNotificationEvent: (e: unknown) => processEvent(e),
}));

vi.mock("../../server/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
  log: vi.fn(),
}));

import {
  runSpecialistQualityRecomputeCycle,
  qualityBandForScore,
  __resetQualityRecomputeStateForTest,
} from "../../server/jobs/specialist-quality-recompute";

beforeEach(() => {
  getLatestSnapshot.mockReset();
  getAllUsers.mockReset();
  getNotificationSetting.mockReset();
  recompute.mockReset();
  processEvent.mockReset();
  __resetQualityRecomputeStateForTest();
  getAllUsers.mockResolvedValue([
    { id: 1, email: "admin@example.com", role: "super_admin" },
  ]);
  // Default: kill switch is not set, so notifications fire normally.
  getNotificationSetting.mockResolvedValue(null);
});

describe("qualityBandForScore", () => {
  it("maps 80+ to green, 60-79 to amber, <60 to red", () => {
    expect(qualityBandForScore(95)).toBe("green");
    expect(qualityBandForScore(80)).toBe("green");
    expect(qualityBandForScore(79)).toBe("amber");
    expect(qualityBandForScore(60)).toBe("amber");
    expect(qualityBandForScore(59)).toBe("red");
    expect(qualityBandForScore(0)).toBe("red");
  });
});

describe("runSpecialistQualityRecomputeCycle", () => {
  it("recomputes every catalog Specialist exactly once", async () => {
    getLatestSnapshot.mockResolvedValue(undefined);
    recompute.mockResolvedValue({ score: 90 });
    const summary = await runSpecialistQualityRecomputeCycle();
    expect(summary.considered).toBe(3);
    expect(summary.recomputed).toBe(3);
    expect(summary.failed).toBe(0);
    expect(recompute).toHaveBeenCalledTimes(3);
  });

  it("does not count first-ever snapshots as band transitions", async () => {
    getLatestSnapshot.mockResolvedValue(undefined); // no prior history
    recompute.mockResolvedValue({ score: 50 });
    const summary = await runSpecialistQualityRecomputeCycle();
    expect(summary.bandChanges).toBe(0);
    expect(processEvent).not.toHaveBeenCalled();
  });

  it("counts band transitions and notifies admins", async () => {
    // alpha: green → red, bravo: amber → green, charlie: amber → amber (no change)
    getLatestSnapshot.mockImplementation((id: string) => {
      if (id === "alpha") return Promise.resolve({ score: 90 });
      if (id === "bravo") return Promise.resolve({ score: 65 });
      if (id === "charlie") return Promise.resolve({ score: 70 });
      return Promise.resolve(undefined);
    });
    recompute.mockImplementation((id: string) => {
      if (id === "alpha") return Promise.resolve({ score: 40 });
      if (id === "bravo") return Promise.resolve({ score: 90 });
      if (id === "charlie") return Promise.resolve({ score: 75 });
      return Promise.resolve({ score: 0 });
    });
    const summary = await runSpecialistQualityRecomputeCycle();
    expect(summary.bandChanges).toBe(2);
    expect(summary.transitions.map((t) => t.specialistId).sort()).toEqual([
      "alpha",
      "bravo",
    ]);
    expect(processEvent).toHaveBeenCalledTimes(1);
    const event = processEvent.mock.calls[0][0] as {
      type: string;
      metadata?: { recipientEmail?: string; transitionCount?: number };
    };
    expect(event.type).toBe("SPECIALIST_QUALITY_BAND_CHANGED");
    expect(event.metadata?.recipientEmail).toBe("admin@example.com");
    expect(event.metadata?.transitionCount).toBe(2);
  });

  it("suppresses duplicate notifications when transitions are identical", async () => {
    getLatestSnapshot.mockResolvedValue({ score: 90 });
    recompute.mockResolvedValue({ score: 50 });
    await runSpecialistQualityRecomputeCycle();
    // One event per admin (1 admin × 1 cycle = 1 call total).
    expect(processEvent).toHaveBeenCalledTimes(1);
    processEvent.mockClear();

    // Second cycle: prior snapshot is "still the most recent" mock
    // (we don't actually persist), so the same transitions get detected.
    // The fingerprint should suppress the second notification.
    getLatestSnapshot.mockResolvedValue({ score: 90 });
    recompute.mockResolvedValue({ score: 50 });
    await runSpecialistQualityRecomputeCycle();
    expect(processEvent).not.toHaveBeenCalled();
  });

  it("re-notifies after a stable cycle clears the fingerprint", async () => {
    getLatestSnapshot.mockResolvedValue({ score: 90 });
    recompute.mockResolvedValue({ score: 50 });
    await runSpecialistQualityRecomputeCycle();
    processEvent.mockClear();

    // Cycle 2: nothing changes band (prior=red, new=red)
    getLatestSnapshot.mockResolvedValue({ score: 50 });
    recompute.mockResolvedValue({ score: 55 });
    await runSpecialistQualityRecomputeCycle();
    expect(processEvent).not.toHaveBeenCalled();

    // Cycle 3: a fresh transition fires a notification again.
    getLatestSnapshot.mockResolvedValue({ score: 55 });
    recompute.mockResolvedValue({ score: 95 });
    await runSpecialistQualityRecomputeCycle();
    expect(processEvent).toHaveBeenCalledTimes(1);
  });

  it("isolates per-Specialist failures and keeps the cycle moving", async () => {
    getLatestSnapshot.mockResolvedValue(undefined);
    recompute.mockImplementation((id: string) => {
      if (id === "bravo") throw new Error("boom");
      return Promise.resolve({ score: 90 });
    });
    const summary = await runSpecialistQualityRecomputeCycle();
    expect(summary.considered).toBe(3);
    expect(summary.recomputed).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.errors[0]?.specialistId).toBe("bravo");
  });

  it("skips overlapping invocations", async () => {
    let resolveFirst: () => void = () => {};
    let calls = 0;
    getLatestSnapshot.mockResolvedValue(undefined);
    recompute.mockImplementation(() => {
      calls += 1;
      // Hold the very first recompute open so the cycle stays in flight
      // when we kick off the second invocation. Subsequent calls (after
      // resolveFirst()) resolve normally so the first cycle can finish.
      if (calls === 1) {
        return new Promise<{ score: number }>((resolve) => {
          resolveFirst = () => resolve({ score: 90 });
        });
      }
      return Promise.resolve({ score: 90 });
    });
    const first = runSpecialistQualityRecomputeCycle();
    const second = await runSpecialistQualityRecomputeCycle();
    expect(second.considered).toBe(0);
    expect(second.recomputed).toBe(0);
    resolveFirst();
    await first;
  });

  it("skips the notification when specialist_quality_band_change_disabled is 'true'", async () => {
    getNotificationSetting.mockImplementation((k: string) =>
      Promise.resolve(k === "specialist_quality_band_change_disabled" ? "true" : null),
    );
    getLatestSnapshot.mockResolvedValue({ score: 90 });
    recompute.mockResolvedValue({ score: 30 });
    const summary = await runSpecialistQualityRecomputeCycle();
    // Bands still get tracked in the summary — the kill switch only
    // suppresses the email, not the recompute or transition accounting.
    expect(summary.bandChanges).toBe(3);
    expect(processEvent).not.toHaveBeenCalled();
  });

  it("notifies again on the very next cycle after the admin re-enables (no fingerprint stickiness)", async () => {
    // Cycle 1: disabled → no notification, fingerprint stays null.
    getNotificationSetting.mockImplementation((k: string) =>
      Promise.resolve(k === "specialist_quality_band_change_disabled" ? "true" : null),
    );
    getLatestSnapshot.mockResolvedValue({ score: 90 });
    recompute.mockResolvedValue({ score: 30 });
    await runSpecialistQualityRecomputeCycle();
    expect(processEvent).not.toHaveBeenCalled();

    // Cycle 2: admin re-enables. The same transitions should now notify
    // because we never recorded a suppression fingerprint while disabled.
    getNotificationSetting.mockResolvedValue(null);
    await runSpecialistQualityRecomputeCycle();
    expect(processEvent).toHaveBeenCalledTimes(1);
  });

  it("does not notify when there are no admins", async () => {
    getAllUsers.mockResolvedValue([]);
    getLatestSnapshot.mockResolvedValue({ score: 90 });
    recompute.mockResolvedValue({ score: 30 });
    const summary = await runSpecialistQualityRecomputeCycle();
    expect(summary.bandChanges).toBe(3);
    expect(processEvent).not.toHaveBeenCalled();
  });
});
