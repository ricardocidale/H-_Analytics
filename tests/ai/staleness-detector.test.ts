/**
 * Tests for server/ai/staleness-detector.ts
 *
 * All storage calls are mocked — no DB required.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock storage
// ---------------------------------------------------------------------------
const mockGetAllProperties = vi.fn();
const mockGetAssumptionGuidance = vi.fn();

vi.mock("../../server/storage", () => ({
  storage: {
    getAllProperties: (...args: unknown[]) => mockGetAllProperties(...args),
    getAssumptionGuidance: (...args: unknown[]) => mockGetAssumptionGuidance(...args),
  },
}));

vi.mock("../../server/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Import module under test
// ---------------------------------------------------------------------------
import { detectStaleness } from "../../server/ai/staleness-detector";
import type { StalenessReport } from "../../server/ai/staleness-detector";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
}

function makeProperty(id: number, name: string) {
  return { id, name, userId: 1 };
}

function makeGuidance(
  assumptionKey: string,
  updatedAt: Date | null,
) {
  return { assumptionKey, updatedAt: updatedAt ? updatedAt.toISOString() : null };
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════
// detectStaleness
// ═══════════════════════════════════════════════════════════════════════════

describe("detectStaleness", () => {
  // 1. All fresh — all guidance within 30 days
  it("counts all fields as fresh when updatedAt is within threshold", async () => {
    mockGetAllProperties.mockResolvedValue([makeProperty(1, "Fresh Hotel")]);
    mockGetAssumptionGuidance.mockResolvedValue([
      makeGuidance("adr", daysAgo(5)),
      makeGuidance("occupancy", daysAgo(10)),
      makeGuidance("cost_rate_rooms", daysAgo(20)),
    ]);

    const report = await detectStaleness(1);

    expect(report.totalFields).toBe(3);
    expect(report.freshCount).toBe(3);
    expect(report.staleCount).toBe(0);
    expect(report.missingCount).toBe(0);
    expect(report.criticallyStale).toEqual([]);
    expect(report.refreshPriority).toEqual([]);
  });

  // 2. All stale — all guidance older than 30 days
  it("counts all fields as stale when updatedAt exceeds threshold", async () => {
    mockGetAllProperties.mockResolvedValue([makeProperty(1, "Stale Hotel")]);
    mockGetAssumptionGuidance.mockResolvedValue([
      makeGuidance("adr", daysAgo(60)),
      makeGuidance("occupancy", daysAgo(45)),
      makeGuidance("cost_rate_it", daysAgo(90)),
    ]);

    const report = await detectStaleness(1);

    expect(report.totalFields).toBe(3);
    expect(report.freshCount).toBe(0);
    expect(report.staleCount).toBe(3);
    expect(report.missingCount).toBe(0);
  });

  // 3. Mixed fresh and stale
  it("correctly separates fresh and stale fields", async () => {
    mockGetAllProperties.mockResolvedValue([makeProperty(1, "Mixed Hotel")]);
    mockGetAssumptionGuidance.mockResolvedValue([
      makeGuidance("adr", daysAgo(5)),            // fresh
      makeGuidance("occupancy", daysAgo(45)),      // stale (critical)
      makeGuidance("cost_rate_it", daysAgo(60)),   // stale (non-critical)
    ]);

    const report = await detectStaleness(1);

    expect(report.totalFields).toBe(3);
    expect(report.freshCount).toBe(1);
    expect(report.staleCount).toBe(2);
    expect(report.missingCount).toBe(0);
  });

  // 4. Missing guidance — property has no guidance records
  it("increments missingCount when property has no guidance at all", async () => {
    mockGetAllProperties.mockResolvedValue([
      makeProperty(1, "New Hotel"),
      makeProperty(2, "Researched Hotel"),
    ]);
    // Property 1 has no guidance
    mockGetAssumptionGuidance
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        makeGuidance("adr", daysAgo(10)),
      ]);

    const report = await detectStaleness(1);

    expect(report.missingCount).toBe(1);
    // The missing property contributes 1 to totalFields, plus 1 from the researched property
    expect(report.totalFields).toBe(2);
    expect(report.freshCount).toBe(1);
  });

  // 5. Critical fields flagged — ADR guidance stale → appears in criticallyStale
  it("flags critical fields in criticallyStale when they are stale", async () => {
    mockGetAllProperties.mockResolvedValue([makeProperty(1, "Critical Hotel")]);
    mockGetAssumptionGuidance.mockResolvedValue([
      makeGuidance("adr", daysAgo(60)),
      makeGuidance("cap_rate", daysAgo(45)),
      makeGuidance("revpar", daysAgo(35)),
    ]);

    const report = await detectStaleness(1);

    expect(report.criticallyStale).toContain("adr");
    expect(report.criticallyStale).toContain("cap_rate");
    expect(report.criticallyStale).toContain("revpar");
  });

  // 6. Non-critical fields NOT flagged as critically stale
  it("does not flag non-critical fields in criticallyStale", async () => {
    mockGetAllProperties.mockResolvedValue([makeProperty(1, "Mixed Hotel")]);
    mockGetAssumptionGuidance.mockResolvedValue([
      makeGuidance("cost_rate_it", daysAgo(90)),       // stale, non-critical
      makeGuidance("cost_rate_marketing", daysAgo(60)), // stale, non-critical
    ]);

    const report = await detectStaleness(1);

    expect(report.staleCount).toBe(2);
    expect(report.criticallyStale).toEqual([]);
    // They still appear in refreshPriority but as "stale", not "critically_stale"
    for (const item of report.refreshPriority) {
      expect(item.reason).toBe("stale");
    }
  });

  // 7. Refresh priority sorted: critically stale first, then stale (oldest), then missing
  it("sorts refreshPriority: critically_stale, then stale (oldest first), then never_researched", async () => {
    mockGetAllProperties.mockResolvedValue([
      makeProperty(1, "Hotel A"),
      makeProperty(2, "Hotel B"),
    ]);

    // Hotel A: has a stale critical field and a stale non-critical field
    mockGetAssumptionGuidance
      .mockResolvedValueOnce([
        makeGuidance("adr", daysAgo(60)),            // critically stale
        makeGuidance("cost_rate_it", daysAgo(45)),   // stale
      ])
      // Hotel B: no guidance at all
      .mockResolvedValueOnce([]);

    const report = await detectStaleness(1);

    expect(report.refreshPriority.length).toBe(3);
    // First: critically stale
    expect(report.refreshPriority[0].reason).toBe("critically_stale");
    expect(report.refreshPriority[0].fieldKey).toBe("adr");
    // Second: stale
    expect(report.refreshPriority[1].reason).toBe("stale");
    expect(report.refreshPriority[1].fieldKey).toBe("cost_rate_it");
    // Third: never_researched
    expect(report.refreshPriority[2].reason).toBe("never_researched");
    expect(report.refreshPriority[2].fieldKey).toBe("*");
  });

  // 8. Custom threshold — pass thresholdDays=7 → more fields appear stale
  it("uses custom thresholdDays to determine staleness", async () => {
    mockGetAllProperties.mockResolvedValue([makeProperty(1, "Tight Threshold")]);
    mockGetAssumptionGuidance.mockResolvedValue([
      makeGuidance("adr", daysAgo(10)),       // stale with 7-day threshold
      makeGuidance("occupancy", daysAgo(3)),   // fresh with 7-day threshold
      makeGuidance("cap_rate", daysAgo(15)),   // stale with 7-day threshold
    ]);

    const report = await detectStaleness(1, 7);

    expect(report.freshCount).toBe(1);
    expect(report.staleCount).toBe(2);
  });

  // 9. Empty portfolio — no properties
  it("returns all zeroes when there are no properties", async () => {
    mockGetAllProperties.mockResolvedValue([]);

    const report = await detectStaleness(1);

    expect(report.totalFields).toBe(0);
    expect(report.freshCount).toBe(0);
    expect(report.staleCount).toBe(0);
    expect(report.missingCount).toBe(0);
    expect(report.criticallyStale).toEqual([]);
    expect(report.refreshPriority).toEqual([]);
  });

  // 10. daysSinceUpdate calculated correctly
  it("calculates daysSinceUpdate approximately correctly", async () => {
    const targetDays = 15;
    mockGetAllProperties.mockResolvedValue([makeProperty(1, "Age Test")]);
    mockGetAssumptionGuidance.mockResolvedValue([
      makeGuidance("adr", daysAgo(targetDays)),
    ]);

    // Use threshold=1 so this field is definitely stale and appears in refreshPriority
    const report = await detectStaleness(1, 1);

    expect(report.refreshPriority.length).toBe(1);
    const item = report.refreshPriority[0];
    expect(item.daysSinceUpdate).not.toBeNull();
    // Allow 1 day tolerance for rounding
    expect(item.daysSinceUpdate).toBeGreaterThanOrEqual(targetDays - 1);
    expect(item.daysSinceUpdate).toBeLessThanOrEqual(targetDays + 1);
  });

  // Bonus: guidance record with null updatedAt counts as missing
  it("counts guidance records with null updatedAt as missing", async () => {
    mockGetAllProperties.mockResolvedValue([makeProperty(1, "Null Dates")]);
    mockGetAssumptionGuidance.mockResolvedValue([
      makeGuidance("adr", null),
      makeGuidance("occupancy", daysAgo(5)),
    ]);

    const report = await detectStaleness(1);

    expect(report.missingCount).toBe(1);
    expect(report.freshCount).toBe(1);
    expect(report.totalFields).toBe(2);
  });
});
