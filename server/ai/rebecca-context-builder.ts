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

function buildPropertySummary(pack: PropertyContextPack): string {
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
    entitySummary = buildPropertySummary(pack);
    entityName = pack.identity.name;
  } else {
    const ga = await storage.getGlobalAssumptions(userId);
    if (!ga) throw new Error("Company data not found");
    const allProperties = await storage.getAllProperties(userId);
    const templates = await storage.getAllServiceTemplates();
    const templateData = templates.map(t => ({
      name: t.name ?? "",
      defaultRate: (t as any).defaultRate ?? 0,
      serviceModel: (t as any).serviceModel ?? "direct",
      serviceMarkup: (t as any).serviceMarkup ?? 0,
      isActive: (t as any).isActive !== false,
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
