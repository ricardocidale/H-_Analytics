/**
 * validate-research.ts — Post-LLM Research Value Validation
 *
 * Runs extracted research values through deterministic tools to catch
 * hallucinated or unreasonable financial recommendations before they
 * are saved to the property record.
 *
 * Each validation produces a flag: "pass", "warn", or "fail" with a reason.
 */
import { computePropertyMetrics } from "./property-metrics.js";
import { computeCapRateValuation } from "./cap-rate-valuation.js";
import { RESEARCH_CAP_RATE_VALUATION_MAX_MULTIPLIER, RESEARCH_CAP_RATE_VALUATION_MIN_MULTIPLIER } from "../../shared/constants.js";
import type { BusinessModelType } from "../../shared/constants.js";

interface ResearchValueEntry {
  display: string;
  mid: number;
  source: "ai";
}

interface PropertyContext {
  roomCount: number;
  startAdr: number;
  maxOccupancy: number;
  purchasePrice?: number;
  costRateRooms?: number;
  costRateFB?: number;
  businessModel?: string;
}

interface ValidationFlag {
  status: "pass" | "warn" | "fail";
  reason?: string;
}

export interface ValidatedResearchValues {
  values: Record<string, ResearchValueEntry & { validation?: ValidationFlag }>;
  summary: {
    total: number;
    passed: number;
    warned: number;
    failed: number;
  };
}

interface BoundsSet {
  adr: { min: number; max: number };
  occupancy: { min: number; max: number };
  startOccupancy: { min: number; max: number };
  capRate: { min: number; max: number };
  noiMargin: { min: number; max: number };
  costRate: { min: number; max: number };
  catering: { min: number; max: number };
  landValue: { min: number; max: number };
  incomeTax: { min: number; max: number };
  revShare: { min: number; max: number };
  svcFee: { min: number; max: number };
  rampMonths: { min: number; max: number };
  platformFee: { min: number; max: number };
}

const HOTEL_BOUNDS: BoundsSet = {
  adr: { min: 50, max: 2000 },
  occupancy: { min: 20, max: 100 },
  startOccupancy: { min: 10, max: 90 },
  capRate: { min: 3, max: 15 },
  noiMargin: { min: 5, max: 55 },
  costRate: { min: 0.5, max: 50 },
  catering: { min: 5, max: 80 },
  landValue: { min: 5, max: 60 },
  incomeTax: { min: 5, max: 50 },
  revShare: { min: 1, max: 60 },
  svcFee: { min: 0.5, max: 10 },
  rampMonths: { min: 3, max: 36 },
  platformFee: { min: 0, max: 5 },
};

const LODGE_BOUNDS: BoundsSet = {
  adr: { min: 100, max: 3000 },
  occupancy: { min: 15, max: 95 },
  startOccupancy: { min: 5, max: 80 },
  capRate: { min: 4, max: 18 },
  noiMargin: { min: 3, max: 50 },
  costRate: { min: 0.3, max: 50 },
  catering: { min: 0, max: 10 },
  landValue: { min: 10, max: 80 },
  incomeTax: { min: 5, max: 50 },
  revShare: { min: 0, max: 40 },
  svcFee: { min: 0.5, max: 25 },
  rampMonths: { min: 3, max: 24 },
  platformFee: { min: 0, max: 5 },
};

const VRBO_BOUNDS: BoundsSet = {
  adr: { min: 75, max: 1500 },
  occupancy: { min: 15, max: 95 },
  startOccupancy: { min: 5, max: 85 },
  capRate: { min: 3, max: 15 },
  noiMargin: { min: 2, max: 50 },
  costRate: { min: 0.5, max: 50 },
  catering: { min: 0, max: 5 },
  landValue: { min: 5, max: 60 },
  incomeTax: { min: 5, max: 50 },
  revShare: { min: 0, max: 15 },
  svcFee: { min: 0.5, max: 30 },
  rampMonths: { min: 1, max: 12 },
  platformFee: { min: 3, max: 25 },
};

const BOUNDS_BY_MODEL: Record<BusinessModelType, BoundsSet> = {
  hotel: HOTEL_BOUNDS,
  lodge: LODGE_BOUNDS,
  vrbo: VRBO_BOUNDS,
};

function getBounds(businessModel?: string): BoundsSet {
  const bm = (businessModel as BusinessModelType) ?? 'hotel';
  return BOUNDS_BY_MODEL[bm] ?? HOTEL_BOUNDS;
}

function checkBounds(value: number, bounds: { min: number; max: number }, label: string): ValidationFlag {
  if (value < bounds.min) return { status: "warn", reason: `${label} (${value}) below typical minimum (${bounds.min})` };
  if (value > bounds.max) return { status: "warn", reason: `${label} (${value}) above typical maximum (${bounds.max})` };
  return { status: "pass" };
}

/**
 * Validate extracted research values against deterministic financial models.
 * Returns the same values with validation flags attached.
 */
export function validateResearchValues(
  extracted: Record<string, ResearchValueEntry>,
  property: PropertyContext
): ValidatedResearchValues {
  const BOUNDS = getBounds(property.businessModel);
  const values: Record<string, ResearchValueEntry & { validation?: ValidationFlag }> = {};
  let passed = 0, warned = 0, failed = 0;

  const addValidation = (key: string, entry: ResearchValueEntry, flag: ValidationFlag) => {
    values[key] = { ...entry, validation: flag };
    if (flag.status === "pass") passed++;
    else if (flag.status === "warn") warned++;
    else failed++;
  };

  for (const [key, entry] of Object.entries(extracted)) {
    if (key === "adr") {
      const flag = checkBounds(entry.mid, BOUNDS.adr, "ADR");
      if (flag.status === "pass") {
        const metrics = computePropertyMetrics({
          room_count: property.roomCount,
          adr: entry.mid,
          occupancy: property.maxOccupancy,
          cost_rate_rooms: property.costRateRooms,
          cost_rate_fb: property.costRateFB,
        });
        if (metrics.noi_margin_pct < BOUNDS.noiMargin.min) {
          addValidation(key, entry, { status: "warn", reason: `ADR $${entry.mid} yields ${metrics.noi_margin_pct.toFixed(1)}% NOI margin (below ${BOUNDS.noiMargin.min}%)` });
          continue;
        }
      }
      addValidation(key, entry, flag);

    } else if (key === "occupancy") {
      addValidation(key, entry, checkBounds(entry.mid, BOUNDS.occupancy, "Stabilized occupancy"));

    } else if (key === "startOccupancy") {
      const flag = checkBounds(entry.mid, BOUNDS.startOccupancy, "Starting occupancy");
      if (flag.status === "pass" && extracted["occupancy"]) {
        if (entry.mid >= extracted["occupancy"].mid) {
          addValidation(key, entry, { status: "warn", reason: `Start occupancy (${entry.mid}%) >= stabilized (${extracted["occupancy"].mid}%)` });
          continue;
        }
      }
      addValidation(key, entry, flag);

    } else if (key === "capRate") {
      const flag = checkBounds(entry.mid, BOUNDS.capRate, "Cap rate");
      if (flag.status === "pass" && property.purchasePrice) {
        const metrics = computePropertyMetrics({
          room_count: property.roomCount,
          adr: property.startAdr,
          occupancy: property.maxOccupancy,
        });
        if (metrics.annual_noi > 0) {
          const valuation = computeCapRateValuation({
            annual_noi: metrics.annual_noi,
            cap_rate: entry.mid / 100,
            purchase_price: property.purchasePrice,
          });
          if (valuation.implied_value > property.purchasePrice * RESEARCH_CAP_RATE_VALUATION_MAX_MULTIPLIER) {
            addValidation(key, entry, { status: "warn", reason: `Cap rate ${entry.mid}% implies value $${valuation.implied_value.toLocaleString()} (>${RESEARCH_CAP_RATE_VALUATION_MAX_MULTIPLIER}x purchase price $${property.purchasePrice.toLocaleString()})` });
            continue;
          }
          if (valuation.implied_value < property.purchasePrice * RESEARCH_CAP_RATE_VALUATION_MIN_MULTIPLIER) {
            addValidation(key, entry, { status: "warn", reason: `Cap rate ${entry.mid}% implies value $${valuation.implied_value.toLocaleString()} (<${RESEARCH_CAP_RATE_VALUATION_MIN_MULTIPLIER * 100}% of purchase price $${property.purchasePrice.toLocaleString()})` });
            continue;
          }
        }
      }
      addValidation(key, entry, flag);

    } else if (key === "catering") {
      addValidation(key, entry, checkBounds(entry.mid, BOUNDS.catering, "Catering boost"));

    } else if (key === "landValue") {
      addValidation(key, entry, checkBounds(entry.mid, BOUNDS.landValue, "Land value %"));

    } else if (key === "incomeTax") {
      addValidation(key, entry, checkBounds(entry.mid, BOUNDS.incomeTax, "Income tax rate"));

    } else if (key === "rampMonths") {
      addValidation(key, entry, checkBounds(entry.mid, BOUNDS.rampMonths, "Ramp months"));

    } else if (key === "platformFee") {
      addValidation(key, entry, checkBounds(entry.mid, BOUNDS.platformFee, "Platform fee rate"));

    } else if (key.startsWith("cost")) {
      addValidation(key, entry, checkBounds(entry.mid, BOUNDS.costRate, key));

    } else if (key.startsWith("revShare")) {
      addValidation(key, entry, checkBounds(entry.mid, BOUNDS.revShare, key));

    } else if (key.startsWith("svcFee")) {
      addValidation(key, entry, checkBounds(entry.mid, BOUNDS.svcFee, key));

    } else {
      values[key] = { ...entry };
      passed++;
    }
  }

  return {
    values,
    summary: {
      total: passed + warned + failed,
      passed,
      warned,
      failed,
    },
  };
}
