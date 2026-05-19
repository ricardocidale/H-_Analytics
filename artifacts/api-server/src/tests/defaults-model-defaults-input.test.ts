/**
 * Sentinel-value test for buildModelDefaultsInput.
 *
 * §14 pre-condition 1 for DEFAULT_ADR_GROWTH_RATE retirement (U4):
 * proves the route layer reads adrGrowthRate from model_defaults, not from the
 * TS constant. The sentinel value 0.1234 is chosen to be unmistakably distinct
 * from any real or seed value.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── DB mock ──────────────────────────────────────────────────────────────────
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();

vi.mock("../db", () => ({
  db: {
    select: () => ({ from: mockFrom }),
  },
}));

vi.mock("@workspace/db", () => ({
  modelDefaults: { defaultKey: "defaultKey" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  inArray: vi.fn((_col, _keys) => "inArray-filter"),
}));

// ── Subject ──────────────────────────────────────────────────────────────────
import { buildModelDefaultsInput } from "../defaults";

// ── Helpers ──────────────────────────────────────────────────────────────────
type ModelDefaultRow = {
  id: number;
  defaultKey: string;
  value: unknown;
  country: string | null;
  countrySubdivision: string | null;
  businessType: string | null;
  sizeBand: string | null;
};

function makeRow(key: string, value: unknown, id = 1): ModelDefaultRow {
  return { id, defaultKey: key, value, country: null, countrySubdivision: null, businessType: null, sizeBand: null };
}

const ADR_BY_TIER_FIXTURE = {
  luxury:         { min: 350, max: 500, default: 400 },
  upper_upscale:  { min: 250, max: 400, default: 300 },
  upscale:        { min: 180, max: 300, default: 220 },
  upper_midscale: { min: 130, max: 200, default: 160 },
  midscale:       { min: 90,  max: 150, default: 120 },
  economy:        { min: 60,  max: 100, default: 80  },
};

describe("buildModelDefaultsInput — sentinel-value test", () => {
  beforeEach(() => {
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockResolvedValue([
      makeRow("mc.property_defaults.adrGrowthRate", 0.1234),
      makeRow("mc.property_defaults.maxOccupancy", 0.85),
      makeRow("mc.property_defaults.adrByTier", ADR_BY_TIER_FIXTURE),
    ]);
  });

  it("returns adrGrowthRate from model_defaults (sentinel 0.1234)", async () => {
    const result = await buildModelDefaultsInput();
    expect(result.adrGrowthRate).toBe(0.1234);
  });

  it("returns maxOccupancy from model_defaults", async () => {
    const result = await buildModelDefaultsInput();
    expect(result.maxOccupancy).toBe(0.85);
  });

  it("returns adrByTier from model_defaults", async () => {
    const result = await buildModelDefaultsInput();
    expect(result.adrByTier).toEqual(ADR_BY_TIER_FIXTURE);
  });

  it("throws if adrGrowthRate row is missing", async () => {
    mockWhere.mockResolvedValue([
      makeRow("mc.property_defaults.maxOccupancy", 0.85),
      makeRow("mc.property_defaults.adrByTier", ADR_BY_TIER_FIXTURE),
    ]);
    await expect(buildModelDefaultsInput()).rejects.toThrow("adrGrowthRate missing");
  });

  it("throws if maxOccupancy row is missing", async () => {
    mockWhere.mockResolvedValue([
      makeRow("mc.property_defaults.adrGrowthRate", 0.03),
      makeRow("mc.property_defaults.adrByTier", ADR_BY_TIER_FIXTURE),
    ]);
    await expect(buildModelDefaultsInput()).rejects.toThrow("maxOccupancy missing");
  });

  it("throws if adrByTier row is missing", async () => {
    mockWhere.mockResolvedValue([
      makeRow("mc.property_defaults.adrGrowthRate", 0.03),
      makeRow("mc.property_defaults.maxOccupancy", 0.85),
    ]);
    await expect(buildModelDefaultsInput()).rejects.toThrow("adrByTier missing");
  });
});
