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
  const m = s.match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : null;
};

const parseRange = (s: string | undefined): { low: number; high: number; mid: number } | null => {
  if (!s) return null;
  const nums = s.replace(/[^0-9.,\-–]/g, " ").split(/[\s–\-]+/).map(x => parseFloat(x.replace(/,/g, ""))).filter(n => !isNaN(n));
  if (nums.length >= 2) return { low: nums[0], high: nums[1], mid: Math.round((nums[0] + nums[1]) / 2) };
  if (nums.length === 1) return { low: nums[0], high: nums[0], mid: nums[0] };
  return null;
};

function extractRecordFromSection(key: string, section: any): GuidanceRecord | null {
  if (!section || typeof section !== "object") return null;

  let valueLow: number | null = null;
  let valueMid: number | null = null;
  let valueHigh: number | null = null;
  let display: string | null = null;

  if (section.valueLow != null && section.valueMid != null) {
    valueLow = Number(section.valueLow);
    valueMid = Number(section.valueMid);
    valueHigh = section.valueHigh != null ? Number(section.valueHigh) : valueMid;
    display = section.display || `${valueLow}–${valueHigh}`;
  } else if (section.recommendedRange) {
    const range = parseRange(section.recommendedRange);
    if (range) { valueLow = range.low; valueMid = range.mid; valueHigh = range.high; display = section.recommendedRange; }
  } else if (section.recommendedRate) {
    const pct = parsePct(section.recommendedRate);
    if (pct != null) { valueMid = pct; valueLow = pct; valueHigh = pct; display = section.recommendedRate; }
  } else if (section.recommendedPercent) {
    const pct = parsePct(section.recommendedPercent);
    if (pct != null) { valueMid = pct; valueLow = pct; valueHigh = pct; display = section.recommendedPercent; }
  } else if (section.mid != null) {
    valueMid = Number(section.mid);
    valueLow = section.low != null ? Number(section.low) : valueMid;
    valueHigh = section.high != null ? Number(section.high) : valueMid;
    display = section.display || `${valueLow}–${valueHigh}`;
  } else if (section.value != null) {
    valueMid = Number(section.value);
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
    sourceName: section.sourceName || section.source || null,
    sourceDate: section.sourceDate || null,
    reasoning: section.reasoning || section.rationale || null,
    comparableSet: section.comparableSet || section.comparables || null,
    display,
  };
}

function extractFromPropertyResearch(parsed: Record<string, any>): GuidanceRecord[] {
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

  for (const [key, paths] of directMappings) {
    for (const path of paths) {
      const parts = path.split(".");
      let val: any = parsed;
      for (const part of parts) {
        if (val && typeof val === "object") val = val[part];
        else { val = undefined; break; }
      }
      if (val != null) {
        const record = extractRecordFromSection(key, typeof val === "object" ? val : { value: val, display: String(val) });
        if (record) { records.push(record); break; }
      }
    }
  }

  const oc = parsed.operatingCostAnalysis;
  if (oc) {
    const costMappings: Array<[string, any]> = [
      ["costRooms", oc.roomRevenueBased?.housekeeping],
      ["costFB", oc.roomRevenueBased?.fbCostOfSales],
      ["costAdmin", oc.totalRevenueBased?.adminGeneral],
      ["costPropertyOps", oc.totalRevenueBased?.propertyOps],
      ["costUtilities", oc.totalRevenueBased?.utilities],
      ["costFFE", oc.totalRevenueBased?.ffeReserve],
      ["costMarketing", oc.totalRevenueBased?.marketing],
      ["costIT", oc.totalRevenueBased?.it],
      ["costOther", oc.totalRevenueBased?.other],
    ];
    for (const [key, section] of costMappings) {
      if (section) {
        const record = extractRecordFromSection(key, section);
        if (record && !records.some(r => r.assumptionKey === record.assumptionKey)) records.push(record);
      }
    }
  }

  const pvc = parsed.propertyValueCostAnalysis;
  if (pvc?.propertyTaxes) {
    const record = extractRecordFromSection("costTaxes", pvc.propertyTaxes);
    if (record) records.push(record);
  }

  const msf = parsed.managementServiceFeeAnalysis?.serviceFeeCategories;
  if (msf) {
    const svcMappings: Array<[string, any]> = [
      ["svcFeeMarketing", msf.marketing],
      ["svcFeeTechRes", msf.technologyReservations],
      ["svcFeeAccounting", msf.accounting],
      ["svcFeeRevMgmt", msf.revenueManagement],
      ["svcFeeGeneralMgmt", msf.generalManagement],
      ["svcFeeProcurement", msf.procurement],
    ];
    for (const [key, section] of svcMappings) {
      if (section) {
        const record = extractRecordFromSection(key, section);
        if (record) records.push(record);
      }
    }
  }

  const incFee = parsed.managementServiceFeeAnalysis?.incentiveFee;
  if (incFee) {
    const record = extractRecordFromSection("incentiveMgmtFee", incFee);
    if (record) records.push(record);
  }

  return records;
}

function extractFromGenericKeys(parsed: Record<string, any>, validKeys: Set<string>): GuidanceRecord[] {
  const records: GuidanceRecord[] = [];

  for (const [key, value] of Object.entries(parsed)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const normalized = normalizeAssumptionKey(key);
      if (validKeys.has(normalized)) {
        const record = extractRecordFromSection(normalized, value);
        if (record) records.push(record);
      }
    }
  }

  return records;
}

export function extractGuidance(
  aiResponse: Record<string, any>,
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
