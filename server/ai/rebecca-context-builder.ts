import { storage } from "../storage";
import { buildPropertyContextPack } from "./context-pack/property-pack";
import { buildCompanyContextPack } from "./context-pack/company-pack";
import type { PropertyContextPack, CompanyContextPack } from "./context-pack/types";
import type { IcpConfig } from "@shared/schema/types/jsonb-shapes";
import { logger } from "../logger";

export interface RebeccaFieldContext {
  entityType: "property" | "company";
  entityId: number;
  fieldKey?: string;
  scenarioId?: number | null;
}

export interface RebeccaContextPayload {
  entitySummary: string;
  fieldContext: string | null;
  autoGreeting: string | null;
  entityName: string;
  entityType: "property" | "company";
  entityId: number;
}

const FIELD_LABELS: Record<string, string> = {
  startAdr: "Average Daily Rate (ADR)",
  adrGrowthRate: "ADR Growth Rate",
  startOccupancy: "Starting Occupancy",
  maxOccupancy: "Maximum Occupancy",
  occupancyRampMonths: "Occupancy Ramp Period",
  occupancyGrowthStep: "Occupancy Growth Step",
  revShareEvents: "Events Revenue Share",
  revShareFB: "F&B Revenue Share",
  revShareOther: "Other Revenue Share",
  cateringBoostPercent: "Catering Boost",
  costRateRooms: "Rooms Department Cost Rate",
  costRateFB: "F&B Department Cost Rate",
  costRateAdmin: "Administrative & General Cost Rate",
  costRateMarketing: "Sales & Marketing Cost Rate",
  costRatePropertyOps: "Property Operations Cost Rate",
  costRateUtilities: "Utilities Cost Rate",
  costRateTaxes: "Property Tax Rate",
  costRateIT: "IT & Telecom Cost Rate",
  costRateFFE: "FF&E Reserve Rate",
  costRateOther: "Other Expenses Rate",
  costRateInsurance: "Insurance Cost Rate",
  purchasePrice: "Purchase Price",
  exitCapRate: "Exit Cap Rate",
  acquisitionLTV: "Acquisition LTV",
  acquisitionInterestRate: "Acquisition Interest Rate",
  acquisitionTermYears: "Loan Term",
  taxRate: "Income Tax Rate",
  depreciationYears: "Depreciation Period",
  landValuePercent: "Land Value Percentage",
  buildingImprovements: "Building Improvements",
  dispositionCommission: "Disposition Commission",
  baseManagementFee: "Base Management Fee",
  incentiveManagementFee: "Incentive Management Fee",
  commissionRate: "Commission Rate",
  salesCommissionRate: "Sales Commission Rate",
  companyTaxRate: "Company Tax Rate",
  costOfEquity: "Cost of Equity",
  inflationRate: "Inflation Rate",
  // Phase 3 engine fields
  pricingModel: "Pricing Model",
  nightlyPropertyRate: "Nightly Property Rate",
  maxGuests: "Maximum Guest Capacity",
  seasonalityProfile: "Seasonality Profile",
  occupancyRampCurve: "Occupancy Ramp Curve",
  ownerPriorityReturn: "Owner Priority Return",
  feeSubordination: "Fee Subordination",
  // Property descriptors
  qualityTier: "Quality Tier",
  serviceLevel: "Service Level",
  locationType: "Location Type",
  marketTier: "Market Tier",
  fbVenues: "F&B Venues",
  fbSeats: "F&B Seating Capacity",
  eventSpaceSqft: "Event Space (sq ft)",
  totalPropertyAcreage: "Total Acreage",
  totalBuildingSqft: "Total Building (sq ft)",
  yearBuilt: "Year Built",
  lastRenovationYear: "Last Renovation",
  businessModel: "Business Model",
  managementType: "Management Type",
  // Source/research fields
  confidenceScore: "Research Confidence Score",
  stalenessStatus: "Research Data Freshness",
  sourceHealth: "Data Source Health Status",
  // Risk fields
  riskGrade: "Portfolio Risk Grade",
  concentrationRisk: "Revenue Concentration Risk",
  geographicRisk: "Geographic Diversification Risk",
  financialRisk: "Financial Leverage Risk",
  operationalRisk: "Operational Risk Score",
  // Stress test fields
  stressOccupancy: "Occupancy Stress (-15%)",
  stressAdr: "ADR Stress (-10%)",
  stressRates: "Interest Rate Stress (+200bps)",
  stressCosts: "Operating Cost Stress (+20%)",
  stressCombined: "Combined Stress Scenario",
  // Benchmark fields
  benchmarkAdr: "Industry Benchmark ADR",
  benchmarkOccupancy: "Industry Benchmark Occupancy",
  benchmarkCapRate: "Industry Benchmark Cap Rate",
  // Regulatory
  regulatoryProfile: "Country Regulatory Profile",
  foreignOwnership: "Foreign Ownership Rules",
  licensingRequirements: "Hospitality Licensing Requirements",
};

function getFieldLabel(fieldKey: string): string {
  return FIELD_LABELS[fieldKey] ?? fieldKey.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase()).trim();
}

function formatGuidanceValue(val: number | null | undefined, fieldKey: string): string {
  if (val == null) return "not set";
  const isPercent = fieldKey.includes("Rate") || fieldKey.includes("rate") ||
    fieldKey.includes("Percent") || fieldKey.includes("percent") ||
    fieldKey.includes("Share") || fieldKey.includes("share") ||
    fieldKey.includes("LTV") || fieldKey.includes("Fee") || fieldKey.includes("fee") ||
    fieldKey.includes("Commission") || fieldKey.includes("commission") ||
    fieldKey === "startOccupancy" || fieldKey === "maxOccupancy" ||
    fieldKey === "costOfEquity" || fieldKey === "inflationRate";
  const isDollar = fieldKey === "startAdr" || fieldKey === "purchasePrice" ||
    fieldKey === "buildingImprovements";
  if (isPercent) return `${(val * 100).toFixed(1)}%`;
  if (isDollar) return `$${val.toLocaleString("en-US")}`;
  return val.toString();
}

function buildPropertySummary(pack: PropertyContextPack, property?: Record<string, any>): string {
  const parts: string[] = [];
  parts.push(`${pack.identity.name} is a ${pack.classification.compositeLabel} located at ${pack.location.display}.`);
  parts.push(`It has ${pack.physicalCharacter.roomCount} rooms.`);
  if (pack.classification.starRating) {
    parts.push(`Star rating: ${"★".repeat(pack.classification.starRating)}${"☆".repeat(5 - pack.classification.starRating)} (${pack.classification.starRatingSource ?? "manual"}).`);
  }
  parts.push(pack.amenityProfile.narrative);
  parts.push(`Revenue: ${pack.revenueProfile.narrative}.`);
  parts.push(`Costs: ${pack.costProfile.narrative}.`);
  parts.push(`Capital: ${pack.capitalStructure.narrative}.`);
  parts.push(pack.icpAlignment.narrative);

  // Phase 3 entity-aware context for Rebecca
  if (property) {
    const extras: string[] = [];
    if (property.qualityTier) extras.push(`quality tier: ${property.qualityTier}`);
    if (property.pricingModel === "per_property") {
      extras.push(`luxury rental pricing at $${property.nightlyPropertyRate}/night (whole property)`);
      if (property.maxGuests) extras.push(`${property.maxGuests} guest capacity`);
    }
    if (property.ownerPriorityReturn && property.ownerPriorityReturn > 0) {
      extras.push(`${(property.ownerPriorityReturn * 100).toFixed(0)}% owner priority return hurdle`);
    }
    if (property.feeSubordination && property.feeSubordination !== "none") {
      extras.push(`${property.feeSubordination} fee subordination`);
    }
    if (property.seasonalityProfile && Array.isArray(property.seasonalityProfile)) {
      const factors = property.seasonalityProfile as number[];
      if (factors.some((f: number) => f !== 1)) {
        const peak = Math.max(...factors);
        const trough = Math.min(...factors);
        extras.push(`seasonal market (${(peak * 100).toFixed(0)}% peak / ${(trough * 100).toFixed(0)}% trough)`);
      }
    }
    if (property.occupancyRampCurve && Array.isArray(property.occupancyRampCurve) && property.occupancyRampCurve.length > 0) {
      const curve = property.occupancyRampCurve as number[];
      extras.push(`${curve.length}-year ramp curve (Year 1: ${(curve[0] * 100).toFixed(0)}% of stabilized)`);
    }
    if (property.fbVenues) extras.push(`${property.fbVenues} F&B venue(s)`);
    if (property.eventSpaceSqft) extras.push(`${property.eventSpaceSqft.toLocaleString()} sq ft event space`);
    if (property.totalPropertyAcreage) extras.push(`${property.totalPropertyAcreage} acres`);
    if (extras.length > 0) {
      parts.push(`Additional context: ${extras.join(", ")}.`);
    }

    // Proactive anomaly detection for Rebecca suggestions
    const anomalies: string[] = [];
    const fbShare = property.revShareFB;
    if (fbShare != null && fbShare < 0.20 && pack.amenityProfile.hasFB) {
      anomalies.push(`F&B revenue share is only ${(fbShare * 100).toFixed(0)}% of total — research suggests 25-35% for properties with F&B programs. Consider running research to validate.`);
    }
    const eventsShare = property.revShareEvents;
    if (eventsShare != null && eventsShare < 0.10 && pack.amenityProfile.hasEvents && property.eventSpaceSqft && property.eventSpaceSqft > 2000) {
      anomalies.push(`Events share is ${(eventsShare * 100).toFixed(0)}% but property has ${property.eventSpaceSqft.toLocaleString()} sq ft event space — comparable properties with this capacity average 15-20%.`);
    }
    if (anomalies.length > 0) {
      parts.push(`\n⚠️ Observations: ${anomalies.join(" | ")}`);
    }
  }

  return parts.join(" ");
}

function buildCompanySummary(pack: CompanyContextPack): string {
  const parts: string[] = [];
  parts.push(`${pack.companyProfile.name} manages a portfolio of ${pack.portfolioFootprint.propertyCount} properties with ${pack.portfolioFootprint.totalRooms} total rooms.`);
  parts.push(pack.portfolioFootprint.narrative);
  parts.push(pack.feeStructure.narrative);
  parts.push(pack.staffingOverhead.narrative);
  return parts.join(" ");
}

export async function buildRebeccaContext(
  userId: number,
  fieldCtx: RebeccaFieldContext,
): Promise<RebeccaContextPayload> {
  const { entityType, entityId, fieldKey, scenarioId } = fieldCtx;

  let entitySummary: string;
  let entityName: string;

  if (entityType === "property") {
    const property = await storage.getProperty(entityId);
    if (!property) throw new Error("Property not found");
    const ga = await storage.getGlobalAssumptions(userId);
    const icpConfig = (ga as any)?.icpConfig as IcpConfig ?? null;
    const pack = buildPropertyContextPack(property, ga ?? null, icpConfig);
    entitySummary = buildPropertySummary(pack, property as Record<string, any>);
    entityName = pack.identity.name;
  } else {
    const ga = await storage.getGlobalAssumptions(userId);
    if (!ga) throw new Error("Company data not found");
    const allProperties = await storage.getAllProperties(userId);
    const templates = await storage.getAllServiceTemplates();
    const templateData = templates.map(t => ({
      name: t.name ?? "",
      defaultRate: t.defaultRate ?? 0,
      serviceModel: t.serviceModel ?? "direct",
      serviceMarkup: t.serviceMarkup ?? 0,
      isActive: t.isActive !== false,
    }));
    const pack = buildCompanyContextPack(ga, allProperties, templateData);
    entitySummary = buildCompanySummary(pack);
    entityName = pack.companyProfile.name;
  }

  let fieldContext: string | null = null;
  let autoGreeting: string | null = null;

  if (fieldKey) {
    const fieldLabel = getFieldLabel(fieldKey);
    const guidance = await storage.getAssumptionGuidance(
      scenarioId ?? null,
      entityType,
      entityId,
    );
    const match = guidance.find(g => g.assumptionKey === fieldKey);

    if (match) {
      const parts: string[] = [];
      parts.push(`Field: ${fieldLabel} (${fieldKey})`);
      parts.push(`Research range: ${formatGuidanceValue(match.valueLow, fieldKey)} – ${formatGuidanceValue(match.valueMid, fieldKey)} – ${formatGuidanceValue(match.valueHigh, fieldKey)} (low / mid / high)`);
      parts.push(`Confidence: ${match.confidence ?? "unknown"}`);
      if (match.reasoning) parts.push(`Reasoning: ${match.reasoning}`);
      if (match.sourceName) parts.push(`Source: ${match.sourceName}${match.sourceDate ? ` (${match.sourceDate})` : ""}`);
      if (match.relaxationLevel != null) parts.push(`Comparable search relaxation level: L${match.relaxationLevel}`);

      const compSet = match.comparableSet as any;
      if (compSet && typeof compSet === "object") {
        const compCount = Array.isArray(compSet.comparables) ? compSet.comparables.length : (compSet.count ?? 0);
        if (compCount > 0) parts.push(`Based on ${compCount} comparable properties`);
      }

      fieldContext = parts.join("\n");

      const low = formatGuidanceValue(match.valueLow, fieldKey);
      const high = formatGuidanceValue(match.valueHigh, fieldKey);
      const compCount = (() => {
        if (compSet && typeof compSet === "object") {
          return Array.isArray(compSet.comparables) ? compSet.comparables.length : (compSet.count ?? 0);
        }
        return 0;
      })();
      autoGreeting = `I see you're looking at **${fieldLabel}** for **${entityName}**. The current research suggests a range of **${low} – ${high}** (confidence: ${match.confidence ?? "unknown"})${compCount > 0 ? `, based on ${compCount} comparable properties` : ""}. What would you like to know?`;
    } else {
      fieldContext = `Field: ${fieldLabel} (${fieldKey})\nNo research guidance available yet for this field.`;
      autoGreeting = `I see you're interested in **${fieldLabel}** for **${entityName}**. There's no research guidance available yet for this specific field. I can still help you understand typical ranges and considerations for this metric. What would you like to know?`;
    }
  }

  return {
    entitySummary,
    fieldContext,
    autoGreeting,
    entityName,
    entityType,
    entityId,
  };
}
