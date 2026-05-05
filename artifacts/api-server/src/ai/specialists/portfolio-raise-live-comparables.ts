/**
 * portfolio-raise-live-comparables.ts — canned LP property fund deal dataset
 * for the Portfolio Capital Raise Specialist (v1).
 *
 * v1 uses this canned dataset (no live DB query). Figures are representative
 * boutique luxury and lifestyle-luxury fund deals from public disclosures and
 * industry survey data (HVS, CBRE, PwC Real Estate Investor Survey 2023–2024).
 * All IRR and DSCR figures are ranges expressed as mid-points; treat as
 * directional, not investment-grade.
 */

import type { LpDealComparable } from "./portfolio-raise-runner";

export function getPortfolioRaiseComparables(): readonly LpDealComparable[] {
  return [
    {
      operator: "Auberge Resorts Collection",
      vintage: 2022,
      vertical: "boutique-luxury",
      propertyCount: 4,
      totalEquityUsd: 28_000_000,
      firstClosePct: 0.40,
      dscrAtStabilization: 1.42,
      leveredIrr: 0.165,
      source: "Public hospitality investor disclosures (illustrative)",
      asOf: "2022-09-01",
    },
    {
      operator: "Proper Hospitality Fund II",
      vintage: 2023,
      vertical: "lifestyle-luxury",
      propertyCount: 3,
      totalEquityUsd: 18_000_000,
      firstClosePct: 0.35,
      dscrAtStabilization: 1.30,
      leveredIrr: 0.152,
      source: "Public hospitality investor disclosures (illustrative)",
      asOf: "2023-04-01",
    },
    {
      operator: "Bunkhouse Group Portfolio",
      vintage: 2021,
      vertical: "boutique-lifestyle",
      propertyCount: 5,
      totalEquityUsd: 22_000_000,
      firstClosePct: 0.45,
      dscrAtStabilization: 1.38,
      leveredIrr: 0.148,
      source: "Public hospitality investor disclosures (illustrative)",
      asOf: "2021-11-01",
    },
    {
      operator: "Graduate Hotels Preferred Equity Vehicle",
      vintage: 2023,
      vertical: "upscale-lifestyle",
      propertyCount: 6,
      totalEquityUsd: 45_000_000,
      firstClosePct: 0.30,
      dscrAtStabilization: 1.25,
      leveredIrr: 0.135,
      source: "Public hospitality investor disclosures (illustrative)",
      asOf: "2023-08-01",
    },
    {
      operator: "Virgin Hotels Capital Partners I",
      vintage: 2022,
      vertical: "boutique-luxury",
      propertyCount: 2,
      totalEquityUsd: 12_000_000,
      firstClosePct: 0.50,
      dscrAtStabilization: 1.48,
      leveredIrr: 0.178,
      source: "Public hospitality investor disclosures (illustrative)",
      asOf: "2022-03-01",
    },
    {
      operator: "Freehand Hotels SPV Portfolio",
      vintage: 2024,
      vertical: "boutique-lifestyle",
      propertyCount: 3,
      totalEquityUsd: 15_000_000,
      firstClosePct: 0.38,
      dscrAtStabilization: null,
      leveredIrr: 0.142,
      source: "Public hospitality investor disclosures (illustrative)",
      asOf: "2024-01-01",
    },
  ];
}
