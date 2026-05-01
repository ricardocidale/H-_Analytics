/**
 * Tests for the nightly Specialist quality recomputer
 * (server/jobs/specialist-quality-recompute.ts).
 *
 * We mock the storage layer, the recompute function, and the notification
 * engine so this is a pure logic test of band detection, drop classification,
 * per-Specialist fingerprint suppression, deep-link construction, and
 * per-Specialist failure isolation.
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

// Pin the deep-link host so we can assert the URL exactly.
vi.mock("../../server/providers/config", () => ({
  getAppUrl: () => "https://example.test",
}));

import {
  runSpecialistQualityRecomputeCycle,
  qualityBandForScore,
  bandTransitionDirection,
  specialistSectionForId,
  specialistDeepLink,
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

describe("bandTransitionDirection", () => {
  it("classifies drops, upgrades, and stable transitions", () => {
    expect(bandTransitionDirection("green", "amber")).toBe("down");
    expect(bandTransitionDirection("green", "red")).toBe("down");
    expect(bandTransitionDirection("amber", "red")).toBe("down");
    expect(bandTransitionDirection("amber", "green")).toBe("up");
    expect(bandTransitionDirection("red", "amber")).toBe("up");
    expect(bandTransitionDirection("red", "green")).toBe("up");
    expect(bandTransitionDirection("green", "green")).toBe(null);
  });
});

describe("specialistSectionForId / specialistDeepLink", () => {
  it("converts dotted catalog ids to sidebar section keys", () => {
    expect(specialistSectionForId("mgmt-co.funding")).toBe("specialist-mgmt-co-funding");
    expect(specialistSectionForId("constants.tax-research")).toBe("specialist-constants-tax-research");
  });

  it("builds an absolute deep link to the AI Intelligence page with ?section=…", () => {
    expect(specialistDeepLink("mgmt-co.funding")).toBe(
      "https://example.test/ai-intelligence?section=specialist-mgmt-co-funding",
    );
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
    expect(summary.bandDrops).toBe(0);
    expect(processEvent).not.toHaveBeenCalled();
  });

  it("notifies admins of downward band drops with a per-Specialist deep link", async () => {
    // alpha: green → red (drop), bravo: amber → green (upgrade), charlie: amber → amber (no change)
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
    expect(summary.bandDrops).toBe(1);

    // Only the alpha drop fires (one event per admin × 1 admin = 1 call).
    expect(processEvent).toHaveBeenCalledTimes(1);
    const event = processEvent.mock.calls[0][0] as {
      type: string;
      link?: string;
      metadata?: {
        recipientEmail?: string;
        specialistId?: string;
        priorBand?: string;
        newBand?: string;
        link?: string;
      };
    };
    expect(event.type).toBe("SPECIALIST_QUALITY_BAND_CHANGED");
    expect(event.metadata?.recipientEmail).toBe("admin@example.com");
    expect(event.metadata?.specialistId).toBe("alpha");
    expect(event.metadata?.priorBand).toBe("green");
    expect(event.metadata?.newBand).toBe("red");
    expect(event.link).toBe("https://example.test/ai-intelligence?section=specialist-alpha");
    expect(event.metadata?.link).toBe(event.link);
  });

  it("does not notify on upward band changes", async () => {
    // All three specialists improve a band.
    getLatestSnapshot.mockImplementation((id: string) => {
      if (id === "alpha") return Promise.resolve({ score: 30 });   // red
      if (id === "bravo") return Promise.resolve({ score: 65 });   // amber
      if (id === "charlie") return Promise.resolve({ score: 30 }); // red
      return Promise.resolve(undefined);
    });
    recompute.mockImplementation((id: string) => {
      if (id === "alpha") return Promise.resolve({ score: 70 });   // → amber
      if (id === "bravo") return Promise.resolve({ score: 95 });   // → green
      if (id === "charlie") return Promise.resolve({ score: 95 }); // → green
      return Promise.resolve({ score: 0 });
    });
    const summary = await runSpecialistQualityRecomputeCycle();
    expect(summary.bandChanges).toBe(3);
    expect(summary.bandDrops).toBe(0);
    expect(processEvent).not.toHaveBeenCalled();
  });

  it("sends one event per dropping Specialist per admin", async () => {
    getAllUsers.mockResolvedValue([
      { id: 1, email: "a@example.com", role: "super_admin" },
      { id: 2, email: "b@example.com", role: "admin" },
    ]);
    // alpha and charlie both drop; bravo stays put.
    getLatestSnapshot.mockResolvedValue({ score: 90 });
    recompute.mockImplementation((id: string) => {
      if (id === "bravo") return Promise.resolve({ score: 95 }); // green→green
      return Promise.resolve({ score: 50 });                       // green→red
    });
    await runSpecialistQualityRecomputeCycle();
    // 2 dropping specialists × 2 admins = 4 events.
    expect(processEvent).toHaveBeenCalledTimes(4);
    const specialists = processEvent.mock.calls.map(
      (c) => (c[0] as { metadata?: { specialistId?: string } }).metadata?.specialistId,
    );
    expect(specialists.filter((s) => s === "alpha")).toHaveLength(2);
    expect(specialists.filter((s) => s === "charlie")).toHaveLength(2);
    expect(specialists.filter((s) => s === "bravo")).toHaveLength(0);
  });

  it("suppresses duplicate drop notifications when the same drop repeats per Specialist", async () => {
    getLatestSnapshot.mockResolvedValue({ score: 90 });
    recompute.mockResolvedValue({ score: 50 });
    await runSpecialistQualityRecomputeCycle();
    // 3 specialists drop, 1 admin → 3 events.
    expect(processEvent).toHaveBeenCalledTimes(3);
    processEvent.mockClear();

    // Second cycle: prior snapshot is "still the most recent" mock (we don't
    // actually persist), so the same drops get detected. The per-Specialist
    // fingerprint should suppress every notification.
    getLatestSnapshot.mockResolvedValue({ score: 90 });
    recompute.mockResolvedValue({ score: 50 });
    await runSpecialistQualityRecomputeCycle();
    expect(processEvent).not.toHaveBeenCalled();
  });

  it("re-notifies a Specialist when it drops to a different band", async () => {
    // Cycle 1: green → amber for alpha (others stable).
    getLatestSnapshot.mockImplementation((id: string) =>
      Promise.resolve(id === "alpha" ? { score: 90 } : { score: 90 }),
    );
    recompute.mockImplementation((id: string) =>
      Promise.resolve(id === "alpha" ? { score: 70 } : { score: 90 }),
    );
    await runSpecialistQualityRecomputeCycle();
    expect(processEvent).toHaveBeenCalledTimes(1);
    const first = processEvent.mock.calls[0][0] as {
      metadata?: { specialistId?: string; priorBand?: string; newBand?: string };
    };
    expect(first.metadata?.specialistId).toBe("alpha");
    expect(first.metadata?.newBand).toBe("amber");
    processEvent.mockClear();

    // Cycle 2: alpha drops further amber → red. New fingerprint → re-notify.
    getLatestSnapshot.mockImplementation((id: string) =>
      Promise.resolve(id === "alpha" ? { score: 70 } : { score: 90 }),
    );
    recompute.mockImplementation((id: string) =>
      Promise.resolve(id === "alpha" ? { score: 40 } : { score: 90 }),
    );
    await runSpecialistQualityRecomputeCycle();
    expect(processEvent).toHaveBeenCalledTimes(1);
    const second = processEvent.mock.calls[0][0] as {
      metadata?: { specialistId?: string; priorBand?: string; newBand?: string };
    };
    expect(second.metadata?.priorBand).toBe("amber");
    expect(second.metadata?.newBand).toBe("red");
  });

  it("re-notifies when a Specialist recovers and then drops to the same band again (event-scoped suppression)", async () => {
    // The "max 1 notification per Specialist per drop event" rule from
    // Task #554: an event runs from its downward crossing until the
    // next upward recovery. Once the Specialist recovers, the next
    // drop — even to the same prior→new band pair — is a fresh event
    // and must notify admins again.

    // Cycle 1: alpha green → amber. First drop, notify.
    getLatestSnapshot.mockResolvedValue({ score: 90 });
    recompute.mockImplementation((id: string) =>
      Promise.resolve(id === "alpha" ? { score: 70 } : { score: 90 }),
    );
    await runSpecialistQualityRecomputeCycle();
    expect(processEvent).toHaveBeenCalledTimes(1);
    processEvent.mockClear();

    // Cycle 2: alpha amber → green (upgrade, no notification, but
    // recovery clears the remembered drop fingerprint).
    getLatestSnapshot.mockImplementation((id: string) =>
      Promise.resolve(id === "alpha" ? { score: 70 } : { score: 90 }),
    );
    recompute.mockImplementation(() => Promise.resolve({ score: 95 }));
    await runSpecialistQualityRecomputeCycle();
    expect(processEvent).not.toHaveBeenCalled();

    // Cycle 3: alpha green → amber again. Even though the prior→new
    // pair matches cycle 1, this is a fresh drop event (recovery in
    // cycle 2 ended the previous one), so admins must be notified.
    getLatestSnapshot.mockImplementation((id: string) =>
      Promise.resolve(id === "alpha" ? { score: 95 } : { score: 90 }),
    );
    recompute.mockImplementation((id: string) =>
      Promise.resolve(id === "alpha" ? { score: 70 } : { score: 90 }),
    );
    await runSpecialistQualityRecomputeCycle();
    expect(processEvent).toHaveBeenCalledTimes(1);
    const refired = processEvent.mock.calls[0][0] as {
      metadata?: { specialistId?: string; priorBand?: string; newBand?: string };
    };
    expect(refired.metadata?.specialistId).toBe("alpha");
    expect(refired.metadata?.priorBand).toBe("green");
    expect(refired.metadata?.newBand).toBe("amber");
  });

  it("still suppresses repeat drop detections across stable cycles (no recovery in between)", async () => {
    // Cycle 1: alpha green → amber. Notify.
    getLatestSnapshot.mockResolvedValue({ score: 90 });
    recompute.mockImplementation((id: string) =>
      Promise.resolve(id === "alpha" ? { score: 70 } : { score: 90 }),
    );
    await runSpecialistQualityRecomputeCycle();
    expect(processEvent).toHaveBeenCalledTimes(1);
    processEvent.mockClear();

    // Cycle 2: alpha stays amber (no transition at all). Fingerprint
    // must not be cleared by a stable cycle.
    getLatestSnapshot.mockImplementation((id: string) =>
      Promise.resolve(id === "alpha" ? { score: 70 } : { score: 90 }),
    );
    recompute.mockImplementation((id: string) =>
      Promise.resolve(id === "alpha" ? { score: 65 } : { score: 90 }),
    );
    await runSpecialistQualityRecomputeCycle();
    expect(processEvent).not.toHaveBeenCalled();

    // Cycle 3: snapshot tooling re-detects the green→amber drop (e.g.
    // the prior snapshot we mocked still says 90). Same fingerprint
    // from cycle 1, no recovery in between, so it stays suppressed.
    getLatestSnapshot.mockResolvedValue({ score: 90 });
    recompute.mockImplementation((id: string) =>
      Promise.resolve(id === "alpha" ? { score: 70 } : { score: 90 }),
    );
    await runSpecialistQualityRecomputeCycle();
    expect(processEvent).not.toHaveBeenCalled();
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
    expect(summary.bandDrops).toBe(3);
    expect(processEvent).not.toHaveBeenCalled();
  });

  it("notifies again on the very next cycle after the admin re-enables (no fingerprint stickiness)", async () => {
    // Cycle 1: disabled → no notification, fingerprint stays empty.
    getNotificationSetting.mockImplementation((k: string) =>
      Promise.resolve(k === "specialist_quality_band_change_disabled" ? "true" : null),
    );
    getLatestSnapshot.mockResolvedValue({ score: 90 });
    recompute.mockResolvedValue({ score: 30 });
    await runSpecialistQualityRecomputeCycle();
    expect(processEvent).not.toHaveBeenCalled();

    // Cycle 2: admin re-enables. The same drops should now notify
    // because we never recorded a suppression fingerprint while disabled.
    getNotificationSetting.mockResolvedValue(null);
    await runSpecialistQualityRecomputeCycle();
    // 3 dropping specialists × 1 admin = 3 events.
    expect(processEvent).toHaveBeenCalledTimes(3);
  });

  it("does not notify when there are no admins", async () => {
    getAllUsers.mockResolvedValue([]);
    getLatestSnapshot.mockResolvedValue({ score: 90 });
    recompute.mockResolvedValue({ score: 30 });
    const summary = await runSpecialistQualityRecomputeCycle();
    expect(summary.bandDrops).toBe(3);
    expect(processEvent).not.toHaveBeenCalled();
  });
});
