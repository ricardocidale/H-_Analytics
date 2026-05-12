/**
 * national-anchors.test.ts — Coverage for the national-benchmark overlay.
 *
 * Verifies both wiring paths called out in task #1415:
 *   (a) DB-populated path — minion rows present, derived markup uses them.
 *   (b) Fallback path     — DB empty, hardcoded anchors drive the result.
 */

import { describe, expect, it } from "vitest";
import {
  NATIONAL_MARKUP_FACTOR_ANCHORS,
  NATIONAL_VENDOR_COST_ANCHORS,
  PROPERTY_COST_RATE_TO_SERVICE_LINE,
  TEMPLATE_TO_SERVICE_LINES,
  derivePropertyCostAnchors,
  deriveTemplateMarkupsFromNationalBenchmarks,
  overlayNationalCostAnchorsOnProperty,
  overlayNationalMarkupsOnTemplates,
} from "./national-anchors.js";
import type { ServiceTemplate } from "./types.js";

const TEMPLATES: ServiceTemplate[] = [
  { id: 1, name: "Marketing & Brand",         defaultRate: 0.02,  serviceModel: "centralized", serviceMarkup: 0.20, isActive: true, sortOrder: 1 },
  { id: 2, name: "Technology & Reservations", defaultRate: 0.025, serviceModel: "centralized", serviceMarkup: 0.20, isActive: true, sortOrder: 2 },
  { id: 3, name: "Accounting",                defaultRate: 0.015, serviceModel: "centralized", serviceMarkup: 0.20, isActive: true, sortOrder: 3 },
  { id: 4, name: "Revenue Management",        defaultRate: 0.01,  serviceModel: "centralized", serviceMarkup: 0.20, isActive: true, sortOrder: 4 },
  { id: 5, name: "General Management",        defaultRate: 0.015, serviceModel: "direct",      serviceMarkup: 0.20, isActive: true, sortOrder: 5 },
  { id: 6, name: "Procurement",               defaultRate: 0.01,  serviceModel: "centralized", serviceMarkup: 0.20, isActive: true, sortOrder: 6 },
];

describe("deriveTemplateMarkupsFromNationalBenchmarks — fallback path", () => {
  it("derives every mapped template from hardcoded anchors when DB is empty", () => {
    const out = deriveTemplateMarkupsFromNationalBenchmarks([], []);
    for (const templateName of Object.keys(TEMPLATE_TO_SERVICE_LINES)) {
      expect(out[templateName]).toBeGreaterThan(0);
    }
  });

  it("matches the analytic markup-sum / cost-sum for Marketing & Brand", () => {
    const out = deriveTemplateMarkupsFromNationalBenchmarks([], []);
    const expected =
      (NATIONAL_MARKUP_FACTOR_ANCHORS.marketing + NATIONAL_MARKUP_FACTOR_ANCHORS.branding) /
      (NATIONAL_VENDOR_COST_ANCHORS.marketing + NATIONAL_VENDOR_COST_ANCHORS.branding);
    expect(out["Marketing & Brand"]).toBeCloseTo(expected, 12);
  });

  it("yields 20% for Technology & Reservations under default anchors", () => {
    const out = deriveTemplateMarkupsFromNationalBenchmarks([], []);
    // (0.0030 + 0.0050) / (0.0150 + 0.0250) = 0.20
    expect(out["Technology & Reservations"]).toBeCloseTo(0.20, 12);
  });
});

describe("deriveTemplateMarkupsFromNationalBenchmarks — DB-populated path", () => {
  it("uses the supplied DB rows in preference to anchors", () => {
    const vendorRows = [
      { serviceLine: "marketing", costPctRevenue: 0.10 },
      { serviceLine: "branding",  costPctRevenue: 0.10 },
    ];
    const markupRows = [
      { serviceLine: "marketing", markupPctRevenue: 0.05 },
      { serviceLine: "branding",  markupPctRevenue: 0.05 },
    ];
    const out = deriveTemplateMarkupsFromNationalBenchmarks(vendorRows, markupRows);
    // (0.05 + 0.05) / (0.10 + 0.10) = 0.50
    expect(out["Marketing & Brand"]).toBeCloseTo(0.50, 12);
  });

  it("partial DB coverage falls back to anchors for the missing service lines", () => {
    // Only "marketing" overridden; "branding" must fall back to anchors.
    const vendorRows = [{ serviceLine: "marketing", costPctRevenue: 0.10 }];
    const markupRows = [{ serviceLine: "marketing", markupPctRevenue: 0.05 }];
    const out = deriveTemplateMarkupsFromNationalBenchmarks(vendorRows, markupRows);
    const expected =
      (0.05 + NATIONAL_MARKUP_FACTOR_ANCHORS.branding) /
      (0.10 + NATIONAL_VENDOR_COST_ANCHORS.branding);
    expect(out["Marketing & Brand"]).toBeCloseTo(expected, 12);
  });

  it("uses the newest row when multiple periods exist for the same service line", () => {
    // Mirrors getLatestNationalBenchmarks() ordering: rows arrive newest-first.
    // Older rows for the same service line must NOT overwrite the newer value.
    const vendorRows = [
      { serviceLine: "accounting", costPctRevenue: 0.05 },   // newest
      { serviceLine: "accounting", costPctRevenue: 0.99 },   // older — must be ignored
    ];
    const markupRows = [
      { serviceLine: "accounting", markupPctRevenue: 0.01 }, // newest
      { serviceLine: "accounting", markupPctRevenue: 0.50 }, // older — must be ignored
    ];
    const out = deriveTemplateMarkupsFromNationalBenchmarks(vendorRows, markupRows);
    expect(out["Accounting"]).toBeCloseTo(0.01 / 0.05, 12); // 0.20, not 0.50/0.99
  });

  it("when newest row is invalid, falls back to the anchor (does NOT use older valid duplicate)", () => {
    // Strict newest-precedence: an invalid newest row still claims the slot,
    // so older valid rows for the same service line are ignored and the
    // hardcoded anchor is used as the fallback.
    const vendorRows = [
      { serviceLine: "accounting", costPctRevenue: Number.NaN }, // newest, invalid
      { serviceLine: "accounting", costPctRevenue: 0.99 },        // older, ignored
    ];
    const markupRows = [
      { serviceLine: "accounting", markupPctRevenue: -1 },        // newest, invalid
      { serviceLine: "accounting", markupPctRevenue: 0.50 },      // older, ignored
    ];
    const out = deriveTemplateMarkupsFromNationalBenchmarks(vendorRows, markupRows);
    const expected =
      NATIONAL_MARKUP_FACTOR_ANCHORS.accounting /
      NATIONAL_VENDOR_COST_ANCHORS.accounting;
    expect(out["Accounting"]).toBeCloseTo(expected, 12);
  });

  it("ignores non-finite or negative DB values and keeps the anchor", () => {
    const vendorRows = [
      { serviceLine: "accounting", costPctRevenue: Number.NaN },
      { serviceLine: "marketing",  costPctRevenue: -0.5 },
    ];
    const out = deriveTemplateMarkupsFromNationalBenchmarks(vendorRows, []);
    const expectedAccounting =
      NATIONAL_MARKUP_FACTOR_ANCHORS.accounting / NATIONAL_VENDOR_COST_ANCHORS.accounting;
    expect(out["Accounting"]).toBeCloseTo(expectedAccounting, 12);
  });
});

describe("overlayNationalMarkupsOnTemplates", () => {
  it("only overlays centralized templates that map to a benchmark", () => {
    const overlaid = overlayNationalMarkupsOnTemplates(TEMPLATES, [], []);
    // Mapped centralized templates change.
    const mkt = overlaid.find(t => t.name === "Marketing & Brand")!;
    expect(mkt.serviceMarkup).not.toBe(0.20);
    // Direct template ("General Management") stays at its stored markup.
    const gm = overlaid.find(t => t.name === "General Management")!;
    expect(gm.serviceMarkup).toBe(0.20);
    // Unmapped centralized template ("Procurement") stays at its stored markup.
    const proc = overlaid.find(t => t.name === "Procurement")!;
    expect(proc.serviceMarkup).toBe(0.20);
  });

  it("uses DB rows when present", () => {
    const vendorRows = [
      { serviceLine: "accounting", costPctRevenue: 0.04 },
    ];
    const markupRows = [
      { serviceLine: "accounting", markupPctRevenue: 0.02 },
    ];
    const overlaid = overlayNationalMarkupsOnTemplates(TEMPLATES, vendorRows, markupRows);
    const acct = overlaid.find(t => t.name === "Accounting")!;
    expect(acct.serviceMarkup).toBeCloseTo(0.5, 12); // 0.02 / 0.04
  });

  it("returns an unchanged-shape array (one entry per template, same order)", () => {
    const overlaid = overlayNationalMarkupsOnTemplates(TEMPLATES, [], []);
    expect(overlaid).toHaveLength(TEMPLATES.length);
    overlaid.forEach((t, i) => {
      expect(t.id).toBe(TEMPLATES[i].id);
      expect(t.name).toBe(TEMPLATES[i].name);
      expect(t.serviceModel).toBe(TEMPLATES[i].serviceModel);
    });
  });
});

// ── Task #1484: property cost rate anchor tests ────────────────────────────

describe("derivePropertyCostAnchors — fallback path (DB empty)", () => {
  it("returns the hardcoded anchor for each of the three mapped rates", () => {
    const anchors = derivePropertyCostAnchors([]);
    expect(anchors.costRateRooms).toBeCloseTo(
      NATIONAL_VENDOR_COST_ANCHORS[PROPERTY_COST_RATE_TO_SERVICE_LINE.costRateRooms],
      12,
    );
    expect(anchors.costRatePropertyOps).toBeCloseTo(
      NATIONAL_VENDOR_COST_ANCHORS[PROPERTY_COST_RATE_TO_SERVICE_LINE.costRatePropertyOps],
      12,
    );
    expect(anchors.costRateFB).toBeCloseTo(
      NATIONAL_VENDOR_COST_ANCHORS[PROPERTY_COST_RATE_TO_SERVICE_LINE.costRateFB],
      12,
    );
  });

  it("hardcoded anchor values match expected USALI/STR benchmarks", () => {
    const anchors = derivePropertyCostAnchors([]);
    // housekeeping=9%, maintenance=4%, food_beverage=6% (STR HOST 2024)
    expect(anchors.costRateRooms).toBeCloseTo(0.09, 12);
    expect(anchors.costRatePropertyOps).toBeCloseTo(0.04, 12);
    expect(anchors.costRateFB).toBeCloseTo(0.06, 12);
  });
});

describe("derivePropertyCostAnchors — DB-populated path", () => {
  it("uses DB rows in preference to hardcoded anchors", () => {
    const vendorRows = [
      { serviceLine: "housekeeping",  costPctRevenue: 0.11 },
      { serviceLine: "maintenance",   costPctRevenue: 0.05 },
      { serviceLine: "food_beverage", costPctRevenue: 0.08 },
    ];
    const anchors = derivePropertyCostAnchors(vendorRows);
    expect(anchors.costRateRooms).toBeCloseTo(0.11, 12);
    expect(anchors.costRatePropertyOps).toBeCloseTo(0.05, 12);
    expect(anchors.costRateFB).toBeCloseTo(0.08, 12);
  });

  it("falls back to hardcoded anchor for service lines missing from DB", () => {
    const vendorRows = [{ serviceLine: "housekeeping", costPctRevenue: 0.11 }];
    const anchors = derivePropertyCostAnchors(vendorRows);
    expect(anchors.costRateRooms).toBeCloseTo(0.11, 12);
    expect(anchors.costRatePropertyOps).toBeCloseTo(NATIONAL_VENDOR_COST_ANCHORS.maintenance, 12);
    expect(anchors.costRateFB).toBeCloseTo(NATIONAL_VENDOR_COST_ANCHORS.food_beverage, 12);
  });

  it("uses newest row when multiple periods exist for the same service line", () => {
    const vendorRows = [
      { serviceLine: "housekeeping", costPctRevenue: 0.12 }, // newest
      { serviceLine: "housekeeping", costPctRevenue: 0.99 }, // older — ignored
    ];
    const anchors = derivePropertyCostAnchors(vendorRows);
    expect(anchors.costRateRooms).toBeCloseTo(0.12, 12);
  });

  it("ignores invalid (non-finite or negative) DB rows and falls back to anchor", () => {
    const vendorRows = [
      { serviceLine: "housekeeping", costPctRevenue: Number.NaN },
      { serviceLine: "maintenance",  costPctRevenue: -0.01 },
    ];
    const anchors = derivePropertyCostAnchors(vendorRows);
    expect(anchors.costRateRooms).toBeCloseTo(NATIONAL_VENDOR_COST_ANCHORS.housekeeping, 12);
    expect(anchors.costRatePropertyOps).toBeCloseTo(NATIONAL_VENDOR_COST_ANCHORS.maintenance, 12);
  });
});

describe("overlayNationalCostAnchorsOnProperty", () => {
  const ANCHORS = { costRateRooms: 0.09, costRatePropertyOps: 0.04, costRateFB: 0.06 };

  it("fills null cost rates with national anchors", () => {
    const property = { costRateRooms: null, costRateFB: null, costRatePropertyOps: null };
    const result = overlayNationalCostAnchorsOnProperty(property, ANCHORS);
    expect(result.costRateRooms).toBe(0.09);
    expect(result.costRateFB).toBe(0.06);
    expect(result.costRatePropertyOps).toBe(0.04);
  });

  it("fills undefined cost rates with national anchors", () => {
    const property: {
      costRateRooms?: number | null;
      costRateFB?: number | null;
      costRatePropertyOps?: number | null;
    } = {};
    const result = overlayNationalCostAnchorsOnProperty(property, ANCHORS);
    expect(result.costRateRooms).toBe(0.09);
    expect(result.costRateFB).toBe(0.06);
    expect(result.costRatePropertyOps).toBe(0.04);
  });

  it("preserves explicit numeric overrides (DB-populated path)", () => {
    const property = { costRateRooms: 0.25, costRateFB: 0.15, costRatePropertyOps: 0.07 };
    const result = overlayNationalCostAnchorsOnProperty(property, ANCHORS);
    expect(result.costRateRooms).toBe(0.25);
    expect(result.costRateFB).toBe(0.15);
    expect(result.costRatePropertyOps).toBe(0.07);
  });

  it("mixes anchors (for null rates) and user overrides (for numeric rates)", () => {
    const property = { costRateRooms: 0.25, costRateFB: null, costRatePropertyOps: null };
    const result = overlayNationalCostAnchorsOnProperty(property, ANCHORS);
    expect(result.costRateRooms).toBe(0.25);   // user override preserved
    expect(result.costRateFB).toBe(0.06);       // anchor filled
    expect(result.costRatePropertyOps).toBe(0.04); // anchor filled
  });

  it("treats zero as an explicit override (0 !== null)", () => {
    const property = { costRateRooms: 0, costRateFB: 0, costRatePropertyOps: 0 };
    const result = overlayNationalCostAnchorsOnProperty(property, ANCHORS);
    expect(result.costRateRooms).toBe(0);
    expect(result.costRateFB).toBe(0);
    expect(result.costRatePropertyOps).toBe(0);
  });

  it("does not mutate the original property object", () => {
    const property = {
      costRateRooms: null as number | null,
      costRateFB: null as number | null,
      costRatePropertyOps: null as number | null,
      name: "Test Hotel",
    };
    const result = overlayNationalCostAnchorsOnProperty(property, ANCHORS);
    expect(property.costRateRooms).toBeNull(); // original untouched
    expect(result.name).toBe("Test Hotel");    // extra fields preserved
    expect(result.costRateRooms).toBe(0.09);   // overlay applied to copy
  });
});
