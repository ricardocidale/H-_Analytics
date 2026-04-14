import type { } from "../context-pack/types";
import {
  guidanceRecordSchema,
  type GuidanceRecord,
  type GuidanceExtractionResult,
  PROPERTY_ASSUMPTION_KEYS,
  COMPANY_ASSUMPTION_KEYS,
  normalizeAssumptionKey,
} from "./schemas";
import { logger } from "../../logger";

const parsePct = (s: string | undefined): number | null => {
  if (!s) return null;
  const bpsMatch = s.match(/([\d.]+)\s*(?:bps|basis\s*points?)/i);
  if (bpsMatch) return parseFloat(bpsMatch[1]) / 10000;
  const m = s.match(/([\d.]+)\s*%/);
  if (m) return parseFloat(m[1]) / 100;
  const raw = s.match(/([\d.]+)/);
  if (raw) {
    const v = parseFloat(raw[1]);
    return v > 1 ? v / 100 : v;
  }
  return null;
};

function applyMultiplier(n: number, s: string): number {
  const lower = s.toLowerCase();
  if (/\bm(?:illion)?s?\b/i.test(lower)) return n * 1_000_000;
  if (/\bk\b/i.test(lower) || /\bthousand/i.test(lower)) return n * 1_000;
  if (/\bb(?:illion)?s?\b/i.test(lower)) return n * 1_000_000_000;
  return n;
}

const parseRange = (s: string | undefined): { low: number; high: number; mid: number } | null => {
  if (!s) return null;
  const isPct = /%/.test(s);
  const isBps = /bps|basis\s*points?/i.test(s);
  const cleaned = s.replace(/[$€£¥,]/g, "");
  const nums = cleaned.replace(/[^0-9.,\-–KkMmBb]/g, " ")
    .split(/[\s–\-]+/)
    .map(x => {
      const n = parseFloat(x.replace(/[KkMmBb]/g, ""));
      if (isNaN(n)) return NaN;
      return applyMultiplier(n, x);
    })
    .filter(n => !isNaN(n));
  if (nums.length === 0) return null;
  let low = nums[0];
  let high = nums.length >= 2 ? nums[1] : nums[0];
  if (isBps) { low = low / 10000; high = high / 10000; }
  else if (isPct) { low = low / 100; high = high / 100; }
  if (low > high) [low, high] = [high, low];
  const mid = (low + high) / 2;
  return { low, high, mid };
};

const SANITY_BOUNDS: Record<string, { min: number; max: number; label: string }> = {
  adr:                { min: 30,     max: 5000,   label: "ADR ($)" },
  adrGrowth:          { min: -0.15,  max: 0.25,   label: "ADR Growth (%)" },
  maxOccupancy:       { min: 0.1,    max: 1.0,    label: "Max Occupancy (%)" },
  startOccupancy:     { min: 0.05,   max: 1.0,    label: "Start Occupancy (%)" },
  occupancyRampMonths:{ min: 0,      max: 60,     label: "Ramp Months" },
  capRate:            { min: 0.02,   max: 0.20,   label: "Cap Rate (%)" },
  interestRate:       { min: 0.005,  max: 0.20,   label: "Interest Rate (%)" },
  inflationRate:      { min: -0.05,  max: 0.30,   label: "Inflation (%)" },
  incomeTax:          { min: 0.0,    max: 0.55,   label: "Income Tax (%)" },
  landValue:          { min: 0.05,   max: 0.60,   label: "Land Value (%)" },
  costRooms:          { min: 0.05,   max: 0.50,   label: "Rooms Cost (%)" },
  costFB:             { min: 0.15,   max: 0.70,   label: "F&B Cost (%)" },
  costAdmin:          { min: 0.02,   max: 0.20,   label: "Admin Cost (%)" },
  costMarketing:      { min: 0.01,   max: 0.15,   label: "Marketing Cost (%)" },
  costPropertyOps:    { min: 0.02,   max: 0.20,   label: "Property Ops (%)" },
  costUtilities:      { min: 0.01,   max: 0.12,   label: "Utilities (%)" },
  costFFE:            { min: 0.01,   max: 0.10,   label: "FF&E Reserve (%)" },
  costIT:             { min: 0.005,  max: 0.08,   label: "IT Cost (%)" },
  dispositionCommission: { min: 0.01, max: 0.10,  label: "Disposition Commission (%)" },
  baseMgmtFee:        { min: 0.01,   max: 0.10,   label: "Base Mgmt Fee (%)" },
  incentiveMgmtFee:   { min: 0.0,    max: 0.15,   label: "Incentive Mgmt Fee (%)" },
  baseManagementFee:  { min: 0.01,   max: 0.10,   label: "Base Mgmt Fee (%)" },
  costOfEquity:       { min: 0.08,   max: 0.35,   label: "Cost of Equity (%)" },
  companyTaxRate:      { min: 0.10,   max: 0.55,   label: "Company Tax Rate (%)" },
};

const CROSS_FIELD_RULES: Array<{
  keys: [string, string];
  check: (a: number, b: number) => boolean;
  warning: string;
}> = [
  {
    keys: ["capRate", "maxOccupancy"],
    check: (cap, occ) => cap > 0.12 && occ > 0.85,
    warning: "High cap rate (>12%) combined with high occupancy (>85%) is unusual — high cap rates typically signal risk which suppresses occupancy.",
  },
  {
    keys: ["adr", "costRooms"],
    check: (adr, cost) => adr > 500 && cost > 0.35,
    warning: "High ADR ($500+) with high rooms cost (>35%) is atypical — luxury properties usually achieve lower cost-of-rooms as a percentage of revenue.",
  },
  {
    keys: ["inflationRate", "adrGrowth"],
    check: (inf, grow) => grow > 0 && inf > 0 && grow < inf * 0.5,
    warning: "ADR growth significantly below inflation suggests real rate erosion — verify this is intentional.",
  },
];

function validateSanity(record: GuidanceRecord, errors: string[]): boolean {
  const bounds = SANITY_BOUNDS[record.assumptionKey];
  if (!bounds) return true;
  const mid = record.valueMid;
  if (mid == null) return true;
  if (mid < bounds.min || mid > bounds.max) {
    errors.push(`Sanity warning: ${record.assumptionKey} mid=${mid} outside bounds [${bounds.min}, ${bounds.max}] for ${bounds.label}`);
    logger.warn(`Guidance sanity: ${record.assumptionKey}=${mid} out of range [${bounds.min},${bounds.max}]`, "extractor");
    return false;
  }
  return true;
}

function validateConfidenceRangeWidth(record: GuidanceRecord, errors: string[]): void {
  if (record.valueLow == null || record.valueHigh == null || record.valueMid == null) return;
  if (record.valueMid === 0) return;
  const rangeWidth = Math.abs(record.valueHigh - record.valueLow) / Math.abs(record.valueMid);
  if (record.confidence === "high" && rangeWidth > 0.30) {
    errors.push(`Confidence/range mismatch: ${record.assumptionKey} has "high" confidence but ${(rangeWidth * 100).toFixed(0)}% range width — downgrading to "medium"`);
    record.confidence = "medium";
  }
  if (record.confidence === "low" && rangeWidth < 0.05 && record.valueLow !== record.valueHigh) {
    errors.push(`Confidence/range mismatch: ${record.assumptionKey} has "low" confidence but only ${(rangeWidth * 100).toFixed(0)}% range width — upgrading to "medium"`);
    record.confidence = "medium";
  }
}

function runCrossFieldChecks(records: GuidanceRecord[], errors: string[]): void {
  const byKey = new Map(records.map(r => [r.assumptionKey, r]));
  for (const rule of CROSS_FIELD_RULES) {
    const a = byKey.get(rule.keys[0]);
    const b = byKey.get(rule.keys[1]);
    if (a?.valueMid != null && b?.valueMid != null) {
      if (rule.check(a.valueMid, b.valueMid)) {
        errors.push(`Cross-field: ${rule.warning}`);
      }
    }
  }
}

const str = (v: unknown): string | null => typeof v === "string" ? v : null;
const num = (v: unknown): number | null => typeof v === "number" ? v : v != null ? Number(v) : null;

function extractRecordFromSection(key: string, section: Record<string, unknown>): GuidanceRecord | null {
  if (!section || typeof section !== "object") return null;

  let valueLow: number | null = null;
  let valueMid: number | null = null;
  let valueHigh: number | null = null;
  let display: string | null = null;

  if (section.valueLow != null && section.valueMid != null) {
    valueLow = num(section.valueLow);
    valueMid = num(section.valueMid);
    valueHigh = section.valueHigh != null ? num(section.valueHigh) : valueMid;
    display = str(section.display) ?? `${valueLow}–${valueHigh}`;
  } else if (section.recommendedRange) {
    const range = parseRange(str(section.recommendedRange) ?? undefined);
    if (range) { valueLow = range.low; valueMid = range.mid; valueHigh = range.high; display = str(section.recommendedRange); }
  } else if (section.recommendedRate) {
    const p = parsePct(str(section.recommendedRate) ?? undefined);
    if (p != null) { valueMid = p; valueLow = p; valueHigh = p; display = str(section.recommendedRate); }
  } else if (section.recommendedPercent) {
    const p = parsePct(str(section.recommendedPercent) ?? undefined);
    if (p != null) { valueMid = p; valueLow = p; valueHigh = p; display = str(section.recommendedPercent); }
  } else if (section.mid != null) {
    valueMid = num(section.mid);
    valueLow = section.low != null ? num(section.low) : valueMid;
    valueHigh = section.high != null ? num(section.high) : valueMid;
    display = str(section.display) ?? `${valueLow}–${valueHigh}`;
  } else if (section.value != null) {
    valueMid = num(section.value);
    valueLow = valueMid;
    valueHigh = valueMid;
    display = String(valueMid);
  }

  if (valueMid == null) return null;

  return {
    assumptionKey: normalizeAssumptionKey(key),
    valueLow,
    valueMid,
    valueHigh,
    confidence: (section.confidence === "high" || section.confidence === "medium" || section.confidence === "low") ? section.confidence : "medium",
    sourceName: str(section.sourceName) ?? str(section.source),
    sourceDate: str(section.sourceDate),
    reasoning: str(section.reasoning) ?? str(section.rationale),
    comparableSet: section.comparableSet ?? section.comparables ?? null,
    display,
  };
}

function extractFromPropertyResearch(parsed: Record<string, unknown>): GuidanceRecord[] {
  const records: GuidanceRecord[] = [];

  const directMappings: Array<[string, string[]]> = [
    ["adr", ["adrAnalysis"]],
    ["adrGrowth", ["adrAnalysis.recommendedGrowthRate", "adrAnalysis.annualGrowthRate"]],
    ["maxOccupancy", ["occupancyAnalysis"]],
    ["startOccupancy", ["occupancyAnalysis.initialOccupancy"]],
    ["occupancyRampMonths", ["occupancyAnalysis.rampUpTimeline"]],
    ["occupancyStep", ["occupancyAnalysis.recommendedGrowthStep", "occupancyAnalysis.growthStepPercent"]],
    ["capRate", ["capRateAnalysis"]],
    ["cateringBoost", ["cateringAnalysis"]],
    ["landValue", ["landValueAllocation"]],
    ["incomeTax", ["incomeTaxAnalysis"]],
    ["inflationRate", ["localEconomics.inflationRate"]],
    ["interestRate", ["localEconomics.interestRate"]],
    ["dispositionCommission", ["dispositionAnalysis.recommendedCommission", "capRateAnalysis.saleCommission"]],
    ["revShareEvents", ["eventDemandAnalysis.recommendedRevenueShare"]],
    ["revShareFB", ["fbRevenueAnalysis.recommendedPercent", "cateringAnalysis.fbRevenueShare"]],
    ["revShareOther", ["ancillaryRevenueAnalysis.recommendedPercent"]],
    ["costMarketing", ["marketingCosts.marketingCostRate"]],
  ];

  const dig = (obj: unknown, path: string): unknown => {
    let cur: unknown = obj;
    for (const part of path.split(".")) {
      if (cur && typeof cur === "object" && !Array.isArray(cur)) cur = (cur as Record<string, unknown>)[part];
      else return undefined;
    }
    return cur;
  };

  const asSection = (v: unknown): Record<string, unknown> | null =>
    v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;

  for (const [key, paths] of directMappings) {
    for (const path of paths) {
      const val = dig(parsed, path);
      if (val != null) {
        const section = asSection(val) ?? { value: val, display: String(val) };
        const record = extractRecordFromSection(key, section);
        if (record) { records.push(record); break; }
      }
    }
  }

  const oc = asSection(parsed.operatingCostAnalysis);
  if (oc) {
    const rrb = asSection(oc.roomRevenueBased);
    const trb = asSection(oc.totalRevenueBased);
    const costMappings: Array<[string, unknown]> = [
      ["costRooms", rrb?.housekeeping],
      ["costFB", rrb?.fbCostOfSales],
      ["costAdmin", trb?.adminGeneral],
      ["costPropertyOps", trb?.propertyOps],
      ["costUtilities", trb?.utilities],
      ["costFFE", trb?.ffeReserve],
      ["costMarketing", trb?.marketing],
      ["costIT", trb?.it],
      ["costOther", trb?.other],
    ];
    for (const [key, raw] of costMappings) {
      const section = asSection(raw);
      if (section) {
        const record = extractRecordFromSection(key, section);
        if (record && !records.some(r => r.assumptionKey === record.assumptionKey)) records.push(record);
      }
    }
  }

  const pvc = asSection(parsed.propertyValueCostAnalysis);
  if (pvc) {
    const ptSection = asSection(pvc.propertyTaxes);
    if (ptSection) {
      const record = extractRecordFromSection("costTaxes", ptSection);
      if (record) records.push(record);
    }
  }

  const msfParent = asSection(parsed.managementServiceFeeAnalysis);
  const msf = msfParent ? asSection(msfParent.serviceFeeCategories) : null;
  if (msf) {
    const svcMappings: Array<[string, unknown]> = [
      ["svcFeeMarketing", msf.marketing],
      ["svcFeeTechRes", msf.technologyReservations],
      ["svcFeeAccounting", msf.accounting],
      ["svcFeeRevMgmt", msf.revenueManagement],
      ["svcFeeGeneralMgmt", msf.generalManagement],
      ["svcFeeProcurement", msf.procurement],
    ];
    for (const [key, raw] of svcMappings) {
      const section = asSection(raw);
      if (section) {
        const record = extractRecordFromSection(key, section);
        if (record) records.push(record);
      }
    }
  }

  const incFee = msfParent ? asSection(msfParent.incentiveFee) : null;
  if (incFee) {
    const record = extractRecordFromSection("incentiveMgmtFee", incFee);
    if (record) records.push(record);
  }

  return records;
}

function extractFromGenericKeys(parsed: Record<string, unknown>, validKeys: Set<string>): GuidanceRecord[] {
  const records: GuidanceRecord[] = [];

  for (const [key, value] of Object.entries(parsed)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const normalized = normalizeAssumptionKey(key);
      if (validKeys.has(normalized)) {
        const record = extractRecordFromSection(normalized, value as Record<string, unknown>);
        if (record) records.push(record);
      }
    }
  }

  return records;
}

function extractFromCompanyResearch(parsed: Record<string, unknown>): GuidanceRecord[] {
  const records: GuidanceRecord[] = [];

  const asSection = (v: unknown): Record<string, unknown> | null =>
    v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;

  const dig = (obj: unknown, path: string): unknown => {
    let cur: unknown = obj;
    for (const part of path.split(".")) {
      if (cur && typeof cur === "object" && !Array.isArray(cur)) cur = (cur as Record<string, unknown>)[part];
      else return undefined;
    }
    return cur;
  };

  const companyMappings: Array<[string, string[]]> = [
    ["baseManagementFee", ["feeAnalysis.baseManagementFee", "managementFees.baseFee"]],
    ["incentiveManagementFee", ["feeAnalysis.incentiveFee", "managementFees.incentiveFee"]],
    ["acquisitionCommission", ["feeAnalysis.acquisitionCommission", "commissions.acquisition"]],
    ["dispositionCommission", ["feeAnalysis.dispositionCommission", "commissions.disposition"]],
    ["partnerComp", ["compensationAnalysis.partnerCompensation", "staffing.partnerComp"]],
    ["staffSalary", ["compensationAnalysis.staffSalary", "staffing.baseSalary"]],
    ["officeLease", ["overheadAnalysis.officeLease", "fixedCosts.officeLease"]],
    ["professionalServices", ["overheadAnalysis.professionalServices", "fixedCosts.professionalServices"]],
    ["techInfra", ["overheadAnalysis.technologyInfrastructure", "fixedCosts.techInfra"]],
    ["businessInsurance", ["overheadAnalysis.businessInsurance", "fixedCosts.insurance"]],
    ["travelCost", ["variableCosts.travelCostPerClient", "overheadAnalysis.travelCost"]],
    ["itLicense", ["variableCosts.itLicensePerClient", "overheadAnalysis.itLicense"]],
    ["marketingRate", ["variableCosts.marketingRate", "overheadAnalysis.marketing"]],
    ["miscOps", ["variableCosts.miscOps", "overheadAnalysis.miscellaneous"]],
    ["companyTaxRate", ["taxAnalysis.effectiveTaxRate", "taxAnalysis.companyTaxRate"]],
    ["costOfEquity", ["valuationAnalysis.costOfEquity", "taxAnalysis.costOfEquity"]],
    ["svcFeeMarketing", ["serviceCategories.marketing", "serviceFees.marketing"]],
    ["svcFeeTechRes", ["serviceCategories.technologyReservations", "serviceFees.techReservations"]],
    ["svcFeeAccounting", ["serviceCategories.accounting", "serviceFees.accounting"]],
    ["svcFeeRevMgmt", ["serviceCategories.revenueManagement", "serviceFees.revenueManagement"]],
    ["svcFeeGeneralMgmt", ["serviceCategories.generalManagement", "serviceFees.generalManagement"]],
    ["svcFeeProcurement", ["serviceCategories.procurement", "serviceFees.procurement"]],
  ];

  for (const [key, paths] of companyMappings) {
    for (const path of paths) {
      const val = dig(parsed, path);
      if (val != null) {
        const section = asSection(val) ?? { value: val, display: String(val) };
        const record = extractRecordFromSection(key, section);
        if (record) { records.push(record); break; }
      }
    }
  }

  return records;
}

export function extractGuidance(
  aiResponse: Record<string, unknown>,
  tier: 1 | 2,
  entityType: "property" | "company",
): GuidanceExtractionResult {
  const errors: string[] = [];
  let rawRecords: GuidanceRecord[] = [];

  try {
    if (entityType === "property") {
      rawRecords = extractFromPropertyResearch(aiResponse);
    } else if (entityType === "company") {
      rawRecords = extractFromCompanyResearch(aiResponse);
    }

    const validKeys = entityType === "property" ? PROPERTY_ASSUMPTION_KEYS : COMPANY_ASSUMPTION_KEYS;
    const genericRecords = extractFromGenericKeys(aiResponse, validKeys);
    for (const gr of genericRecords) {
      if (!rawRecords.some(r => r.assumptionKey === gr.assumptionKey)) {
        rawRecords.push(gr);
      }
    }
  } catch (err: unknown) {
    errors.push(`Extraction error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const validRecords: GuidanceRecord[] = [];
  for (const raw of rawRecords) {
    const parsed = guidanceRecordSchema.safeParse(raw);
    if (parsed.success) {
      const record = parsed.data;
      if (validateSanity(record, errors)) {
        validateConfidenceRangeWidth(record, errors);
        validRecords.push(record);
      }
    } else {
      errors.push(`Validation failed for key "${raw.assumptionKey}": ${parsed.error.message}`);
    }
  }

  runCrossFieldChecks(validRecords, errors);

  return {
    records: validRecords,
    tier,
    entityType,
    rawKeyCount: rawRecords.length,
    validKeyCount: validRecords.length,
    errors,
  };
}
