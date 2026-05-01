/**
 * G6 tests for Watchdog specialist (Giovanna / portfolio-ops.watchdog).
 *
 * Coverage:
 *   G6-consistency: checkPortfolioConsistency logic
 *   - returns [] for fewer than 2 properties
 *   - flags same-country tax rate spread > 10pp
 *   - flags exit cap rate outside 6%–15%
 *   - flags ADR growth > 5%
 *
 *   G6-staleness: checkStaleness logic
 *   - returns 0 for empty portfolio
 *   - returns 0 when all properties recently validated
 *   - counts and marks stale properties
 *
 *   G6-alerts: computeFieldAlerts hard-floor path
 *   - emits critical alert when taxRate deviates > 2x threshold
 *
 *   G6-catalog: catalog entry
 *   - status is "built"
 *   - correct letter, subject, and humanName
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../server/storage", () => ({
  storage: {
    getAllProperties: vi.fn(),
    updateProperty: vi.fn(),
    getProperty: vi.fn(),
    upsertAssumptionGuidance: vi.fn(),
    logAssumptionChange: vi.fn(),
    recordObservedMissingFields: vi.fn(),
  },
}));

vi.mock("../../../server/ai/benchmark-lookups", () => ({
  validateAllAssumptions: vi.fn().mockResolvedValue([]),
  validateAssumptionRange: vi.fn().mockResolvedValue({
    fieldName: "taxRate",
    userValue: 0.60,
    verdict: "ok",
    deviationPercent: 0,
    explanation: "ok",
    benchmarkRange: null,
  }),
  computeDataQuality: vi.fn(),
  meetsConvictionFloor: vi.fn().mockReturnValue(false),
  insufficientDataMessage: vi.fn().mockReturnValue(""),
}));

import {
  checkPortfolioConsistency,
  checkStaleness,
  computeFieldAlerts,
} from "../../../server/ai/analyst-watchdog";
import { storage } from "../../../server/storage";
import { SPECIALIST_CATALOG } from "../../../engine/analyst/registry/specialist-catalog";

const mockedStorage = storage as unknown as {
  getAllProperties: ReturnType<typeof vi.fn>;
  updateProperty: ReturnType<typeof vi.fn>;
  getProperty: ReturnType<typeof vi.fn>;
  upsertAssumptionGuidance: ReturnType<typeof vi.fn>;
  logAssumptionChange: ReturnType<typeof vi.fn>;
  recordObservedMissingFields: ReturnType<typeof vi.fn>;
};

function stubProperty(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: "Test Hotel",
    country: "United States",
    city: null,
    stateProvince: null,
    qualityTier: null,
    taxRate: 0.21,
    exitCapRate: 0.08,
    adrGrowthRate: 0.03,
    validationStatus: "validated" as const,
    lastValidatedAt: new Date(),
    flaggedFieldCount: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedStorage.updateProperty.mockResolvedValue(undefined);
  mockedStorage.upsertAssumptionGuidance.mockResolvedValue(undefined);
  mockedStorage.logAssumptionChange.mockResolvedValue(undefined);
  mockedStorage.recordObservedMissingFields.mockResolvedValue(undefined);
});

// ─── checkPortfolioConsistency ────────────────────────────────────────────────

describe("Watchdog G6 — checkPortfolioConsistency", () => {
  it("returns [] when portfolio has fewer than 2 properties", async () => {
    mockedStorage.getAllProperties.mockResolvedValue([]);
    const warnings = await checkPortfolioConsistency();
    expect(warnings).toEqual([]);
  });

  it("flags same-country tax rate spread > 10pp", async () => {
    mockedStorage.getAllProperties.mockResolvedValue([
      stubProperty({ id: 1, name: "Hotel A", taxRate: 0.21 }),
      stubProperty({ id: 2, name: "Hotel B", taxRate: 0.35 }), // 14pp spread
    ]);
    const warnings = await checkPortfolioConsistency();
    expect(warnings.some((w) => w.includes("Tax rate inconsistency"))).toBe(true);
  });

  it("flags exit cap rate outside 6%–15% range", async () => {
    mockedStorage.getAllProperties.mockResolvedValue([
      stubProperty({ id: 1, name: "Hotel A", exitCapRate: 0.04 }), // 4% — below floor
      stubProperty({ id: 2, name: "Hotel B", exitCapRate: 0.08 }),
    ]);
    const warnings = await checkPortfolioConsistency();
    expect(warnings.some((w) => w.includes("exit cap rate"))).toBe(true);
  });

  it("flags ADR growth rate above 5%/yr", async () => {
    mockedStorage.getAllProperties.mockResolvedValue([
      stubProperty({ id: 1, name: "Hotel A", adrGrowthRate: 0.07 }), // 7% — above threshold
      stubProperty({ id: 2, name: "Hotel B", adrGrowthRate: 0.03 }),
    ]);
    const warnings = await checkPortfolioConsistency();
    expect(warnings.some((w) => w.includes("ADR growth"))).toBe(true);
  });
});

// ─── checkStaleness ───────────────────────────────────────────────────────────

describe("Watchdog G6 — checkStaleness", () => {
  it("returns 0 for an empty portfolio", async () => {
    mockedStorage.getAllProperties.mockResolvedValue([]);
    const count = await checkStaleness();
    expect(count).toBe(0);
  });

  it("returns 0 when all properties were validated recently", async () => {
    mockedStorage.getAllProperties.mockResolvedValue([
      stubProperty({ lastValidatedAt: new Date() }),
    ]);
    const count = await checkStaleness();
    expect(count).toBe(0);
    expect(mockedStorage.updateProperty).not.toHaveBeenCalled();
  });

  it("counts and marks stale properties validated more than 30 days ago", async () => {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    mockedStorage.getAllProperties.mockResolvedValue([
      stubProperty({ lastValidatedAt: sixtyDaysAgo }),
    ]);
    const count = await checkStaleness();
    expect(count).toBe(1);
    expect(mockedStorage.updateProperty).toHaveBeenCalledWith(1, { validationStatus: "stale" });
  });
});

// ─── computeFieldAlerts ───────────────────────────────────────────────────────

describe("Watchdog G6 — computeFieldAlerts", () => {
  it("emits critical alert when taxRate deviates more than 2x the hard-floor threshold", async () => {
    // US taxRate default = 0.21; threshold = 0.10; 2x = 0.20.
    // value = 0.60 → deviation ≈ 1.86 — well past the critical boundary.
    mockedStorage.getProperty.mockResolvedValue(stubProperty());
    const alerts = await computeFieldAlerts(1, { taxRate: 0.60 });
    const taxAlert = alerts.find((a) => a.field === "taxRate");
    expect(taxAlert).toBeDefined();
    expect(taxAlert!.severity).toBe("critical");
  });
});

// ─── catalog ──────────────────────────────────────────────────────────────────

describe("Watchdog G6 — catalog", () => {
  const entry = SPECIALIST_CATALOG.find((s) => s.id === "portfolio-ops.watchdog")!;

  it("portfolio-ops.watchdog status is built", () => {
    expect(entry).toBeDefined();
    expect(entry.status).toBe("built");
  });

  it("catalog entry has correct letter, subject, and humanName", () => {
    expect(entry.letter).toBe("G");
    expect(entry.subject).toBe("portfolio-ops");
    expect(entry.humanName).toBe("Giovanna");
  });
});
