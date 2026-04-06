import type { PropertyContextPack, CompanyContextPack } from "../context-pack/types";
import {
  guidanceRecordSchema,
  type GuidanceRecord,
  type GuidanceExtractionResult,
  PROPERTY_ASSUMPTION_KEYS,
  COMPANY_ASSUMPTION_KEYS,
  normalizeAssumptionKey,
} from "./schemas";

const parsePct = (s: string | undefined): number | null => {
  if (!s) return null;
  const m = s.match(/([\d.]+)\s*%/);
  if (m) return parseFloat(m[1]) / 100;
  const raw = s.match(/([\d.]+)/);
  if (raw) {
    const v = parseFloat(raw[1]);
    return v > 1 ? v / 100 : v;
  }
  return null;
};

const parseRange = (s: string | undefined): { low: number; high: number; mid: number } | null => {
  if (!s) return null;
  const nums = s.replace(/[^0-9.,\-–]/g, " ").split(/[\s–\-]+/).map(x => parseFloat(x.replace(/,/g, ""))).filter(n => !isNaN(n));
  if (nums.length >= 2) return { low: nums[0], high: nums[1], mid: Math.round((nums[0] + nums[1]) / 2) };
  if (nums.length === 1) return { low: nums[0], high: nums[0], mid: nums[0] };
  return null;
};

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
    }

    const validKeys = entityType === "property" ? PROPERTY_ASSUMPTION_KEYS : COMPANY_ASSUMPTION_KEYS;
    const genericRecords = extractFromGenericKeys(aiResponse, validKeys);
    for (const gr of genericRecords) {
      if (!rawRecords.some(r => r.assumptionKey === gr.assumptionKey)) {
        rawRecords.push(gr);
      }
    }
  } catch (err) {
    errors.push(`Extraction error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const validRecords: GuidanceRecord[] = [];
  for (const raw of rawRecords) {
    const parsed = guidanceRecordSchema.safeParse(raw);
    if (parsed.success) {
      validRecords.push(parsed.data);
    } else {
      errors.push(`Validation failed for key "${raw.assumptionKey}": ${parsed.error.message}`);
    }
  }

  return {
    records: validRecords,
    tier,
    entityType,
    rawKeyCount: rawRecords.length,
    validKeyCount: validRecords.length,
    errors,
  };
}
