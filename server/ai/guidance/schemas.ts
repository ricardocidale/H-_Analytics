import { z } from "zod";

export const guidanceRecordSchema = z.object({
  assumptionKey: z.string().min(1),
  valueLow: z.number().nullable().optional(),
  valueMid: z.number().nullable().optional(),
  valueHigh: z.number().nullable().optional(),
  confidence: z.enum(["high", "medium", "low"]).default("medium"),
  sourceName: z.string().nullable().optional(),
  sourceDate: z.string().nullable().optional(),
  reasoning: z.string().nullable().optional(),
  comparableSet: z.any().nullable().optional(),
  display: z.string().nullable().optional(),
});

export type GuidanceRecord = z.infer<typeof guidanceRecordSchema>;

export const guidanceExtractionResultSchema = z.object({
  records: z.array(guidanceRecordSchema),
  tier: z.number(),
  entityType: z.enum(["property", "company"]),
  rawKeyCount: z.number(),
  validKeyCount: z.number(),
  errors: z.array(z.string()),
});

export type GuidanceExtractionResult = z.infer<typeof guidanceExtractionResultSchema>;

export const PROPERTY_ASSUMPTION_KEYS = new Set([
  "adr", "adrGrowth", "startOccupancy", "maxOccupancy", "occupancy",
  "occupancyRampMonths", "occupancyStep", "occupancyGrowthStep",
  "revShareEvents", "revShareFB", "revShareOther", "cateringBoost", "catering",
  "costRooms", "costHousekeeping", "costFB", "costAdmin", "costMarketing",
  "costPropertyOps", "costUtilities", "costTaxes", "costPropertyTaxes",
  "costIT", "costFFE", "costOther", "costInsurance",
  "capRate", "exitCapRate", "interestRate", "ltv", "landValue",
  "depreciationYears", "saleCommission", "dispositionCommission",
  "incomeTax", "inflationRate", "countryRiskPremium",
  "baseMgmtFee", "incentiveMgmtFee", "incentiveFee",
  "svcFeeMarketing", "svcFeeTechRes", "svcFeeAccounting",
  "svcFeeRevMgmt", "svcFeeGeneralMgmt", "svcFeeProcurement",
  "rampMonths",
]);

export const COMPANY_ASSUMPTION_KEYS = new Set([
  "baseManagementFee", "incentiveManagementFee",
  "acquisitionCommission", "dispositionCommission",
  "partnerComp", "staffSalary", "staffingTiers",
  "officeLease", "professionalServices", "techInfra", "businessInsurance",
  "travelCost", "itLicense", "marketingRate", "miscOps",
  "companyTaxRate", "costOfEquity",
  "svcFeeMarketing", "svcFeeTechRes", "svcFeeAccounting",
  "svcFeeRevMgmt", "svcFeeGeneralMgmt", "svcFeeProcurement",
]);

export const KEY_ALIASES: Record<string, string> = {
  housekeeping: "costRooms",
  rooms: "costRooms",
  fbCostOfSales: "costFB",
  adminGeneral: "costAdmin",
  propertyOps: "costPropertyOps",
  utilities: "costUtilities",
  ffeReserve: "costFFE",
  marketing: "costMarketing",
  it: "costIT",
  other: "costOther",
  insurance: "costInsurance",
  propertyTaxes: "costTaxes",
  catering: "cateringBoost",
  occupancy: "maxOccupancy",
  rampMonths: "occupancyRampMonths",
  incentiveFee: "incentiveMgmtFee",
  saleCommission: "dispositionCommission",
};

export function normalizeAssumptionKey(key: string): string {
  return KEY_ALIASES[key] || key;
}
