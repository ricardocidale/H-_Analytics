import type { Property, GlobalAssumptions } from "@shared/schema";
import type { CompanyContextPack } from "./types";
import { buildFullIcpNarrative } from "../icp-intelligence";

function pct(v: number | null | undefined): string {
  if (v == null) return "not set";
  return `${(v * 100).toFixed(1)}%`;
}

function usd(v: number | null | undefined): string {
  if (v == null) return "not set";
  return `$${v.toLocaleString("en-US")}`;
}

function getGeographicSpread(properties: Property[]): string[] {
  const regions = new Set<string>();
  for (const p of properties) {
    if (p.country) regions.add(p.country);
    else if (p.stateProvince) regions.add(p.stateProvince);
    else if (p.location) {
      const parts = p.location.split(",").map(s => s.trim());
      if (parts.length > 0) regions.add(parts[parts.length - 1]);
    }
  }
  return Array.from(regions);
}

function getTypeBreakdown(properties: Property[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const p of properties) {
    const type = p.hospitalityType ?? "hotel";
    counts[type] = (counts[type] || 0) + 1;
  }
  return counts;
}

function buildPortfolioNarrative(
  properties: Property[],
  totalRooms: number,
  avgAdr: number,
  geoSpread: string[],
  avgStarRating: number | null,
  typeBreakdown: Record<string, number>,
): string {
  const parts: string[] = [];
  parts.push(`Portfolio of ${properties.length} properties with ${totalRooms} total rooms`);
  parts.push(`Average ADR ${usd(avgAdr)}`);
  if (avgStarRating != null) parts.push(`average star rating ${avgStarRating.toFixed(1)}★`);
  if (geoSpread.length > 0) parts.push(`spanning ${geoSpread.join(", ")}`);

  const types = Object.entries(typeBreakdown).map(([t, c]) => `${c} ${t}`).join(", ");
  if (types) parts.push(`types: ${types}`);

  return parts.join("; ");
}

function buildServiceNarrative(templates: Array<{ name: string; rate: number; serviceModel: string; markup: number }>): string {
  if (templates.length === 0) return "No service templates configured";
  const totalRate = templates.reduce((sum, t) => sum + t.rate, 0);
  return `${templates.length} service categories totaling ${pct(totalRate)} of revenue. Services: ${templates.map(t => `${t.name} (${pct(t.rate)}, ${t.serviceModel}, ${pct(t.markup)} markup)`).join("; ")}`;
}

function buildFeeNarrative(ga: GlobalAssumptions): string {
  const parts: string[] = [];
  if (ga.baseManagementFee != null) parts.push(`base management fee ${pct(ga.baseManagementFee)}`);
  if (ga.incentiveManagementFee != null) parts.push(`incentive fee ${pct(ga.incentiveManagementFee)} of GOP`);
  if (ga.commissionRate != null) parts.push(`acquisition commission ${pct(ga.commissionRate)}`);
  if (ga.salesCommissionRate != null) parts.push(`disposition commission ${pct(ga.salesCommissionRate)}`);
  return parts.length > 0 ? parts.join("; ") : "No fee rates configured";
}

function buildStaffingNarrative(ga: GlobalAssumptions): string {
  const parts: string[] = [];
  if (ga.staffSalary != null) parts.push(`base salary ${usd(ga.staffSalary)}`);

  const tiers: string[] = [];
  if (ga.staffTier1MaxProperties != null && ga.staffTier1Fte != null)
    tiers.push(`Tier 1: ≤${ga.staffTier1MaxProperties} properties = ${ga.staffTier1Fte} FTE`);
  if (ga.staffTier2MaxProperties != null && ga.staffTier2Fte != null)
    tiers.push(`Tier 2: ≤${ga.staffTier2MaxProperties} properties = ${ga.staffTier2Fte} FTE`);
  if (ga.staffTier3Fte != null)
    tiers.push(`Tier 3: ${ga.staffTier3Fte} FTE`);
  if (tiers.length > 0) parts.push(`staffing tiers: ${tiers.join(", ")}`);

  const overheadParts: string[] = [];
  if (ga.officeLeaseStart != null) overheadParts.push(`office ${usd(ga.officeLeaseStart)}/yr`);
  if (ga.professionalServicesStart != null) overheadParts.push(`professional ${usd(ga.professionalServicesStart)}/yr`);
  if (ga.techInfraStart != null) overheadParts.push(`tech ${usd(ga.techInfraStart)}/yr`);
  if (ga.businessInsuranceStart != null) overheadParts.push(`insurance ${usd(ga.businessInsuranceStart)}/yr`);
  if (overheadParts.length > 0) parts.push(`fixed overhead: ${overheadParts.join(", ")}`);

  const varParts: string[] = [];
  if (ga.travelCostPerClient != null) varParts.push(`travel ${usd(ga.travelCostPerClient)}/client`);
  if (ga.itLicensePerClient != null) varParts.push(`IT ${usd(ga.itLicensePerClient)}/client`);
  if (ga.marketingRate != null) varParts.push(`marketing ${pct(ga.marketingRate)}`);
  if (ga.miscOpsRate != null) varParts.push(`misc ${pct(ga.miscOpsRate)}`);
  if (varParts.length > 0) parts.push(`variable costs: ${varParts.join(", ")}`);

  const partnerComp: string[] = [];
  if (ga.partnerCompYear1 != null) partnerComp.push(`Y1: ${usd(ga.partnerCompYear1)}`);
  if (ga.partnerCompYear2 != null) partnerComp.push(`Y2: ${usd(ga.partnerCompYear2)}`);
  if (ga.partnerCompYear3 != null) partnerComp.push(`Y3: ${usd(ga.partnerCompYear3)}`);
  if (partnerComp.length > 0) parts.push(`partner compensation: ${partnerComp.join(", ")}`);

  return parts.length > 0 ? parts.join(". ") : "No staffing/overhead configured";
}

function buildIcpNarrative(ga: GlobalAssumptions): string {
  const icp = (ga as any).icpConfig;
  const descriptive = (ga as any).icpDescriptive;
  const companyName = ga.companyName || "Management Company";

  // Use the full ICP narrative builder if there's a generated ICP
  if (icp && typeof icp === "object" && icp._generated) {
    return buildFullIcpNarrative(icp, descriptive || {}, companyName);
  }

  // Legacy fallback: basic fields only
  if (!icp || typeof icp !== "object") return "No ICP configuration defined. Run 'Generate ICP' from the ICP Definition page to auto-build from your portfolio.";

  const asNum = (v: unknown): number | null => typeof v === "number" ? v : null;

  const parts: string[] = [];
  if (icp.roomsMin != null || icp.roomsMax != null) parts.push(`${icp.roomsMin ?? "?"}–${icp.roomsMax ?? "?"} rooms`);
  if (icp.adrMin != null || icp.adrMax != null) parts.push(`$${icp.adrMin ?? "?"}–$${icp.adrMax ?? "?"} ADR`);
  if (icp.acquisitionMin != null || icp.acquisitionMax != null) parts.push(`${usd(asNum(icp.acquisitionMin))}–${usd(asNum(icp.acquisitionMax))} acquisition`);

  const amenities: string[] = [];
  for (const a of ["pool", "spa", "gym", "tennis", "yogaStudio", "sauna", "coldPlunge"]) {
    if (icp[a] === "must" || icp[a] === "major") amenities.push(a);
  }
  if (amenities.length > 0) parts.push(`key amenities: ${amenities.join(", ")}`);

  if (ga.assetDescription) parts.push(`description: "${ga.assetDescription}"`);
  if (ga.propertyLabel) parts.push(`property label: ${ga.propertyLabel}`);

  return parts.length > 0 ? `ICP targeting: ${parts.join("; ")}` : "ICP configured but no specific criteria set. Run 'Generate ICP' from the ICP Definition page.";
}

function buildFinancialScaleNarrative(ga: GlobalAssumptions, properties: Property[]): string {
  const parts: string[] = [];

  if (ga.companyTaxRate != null) parts.push(`company tax rate ${pct(ga.companyTaxRate)}`);
  if (ga.costOfEquity != null) parts.push(`cost of equity ${pct(ga.costOfEquity)}`);
  if (ga.projectionYears != null) parts.push(`${ga.projectionYears}-year projection horizon`);

  const totalPurchase = properties.reduce((sum, p) => sum + (p.purchasePrice ?? 0), 0);
  if (totalPurchase > 0) parts.push(`total portfolio value ${usd(totalPurchase)}`);

  return parts.length > 0 ? parts.join("; ") : "No financial scale data available";
}

export function buildCompanyContextPack(
  globalAssumptions: GlobalAssumptions,
  properties: Property[],
  serviceTemplates: Array<{ name: string; defaultRate: number; serviceModel: string; serviceMarkup: number; isActive: boolean }>,
): CompanyContextPack {
  const ga = globalAssumptions;
  const activeProperties = properties.filter(p => p.isActive !== false);
  const totalRooms = activeProperties.reduce((sum, p) => sum + (p.roomCount ?? 0), 0);
  const avgRooms = activeProperties.length > 0 ? Math.round(totalRooms / activeProperties.length) : 0;
  const adrs = activeProperties.map(p => p.startAdr ?? 0).filter(a => a > 0);
  const avgAdr = adrs.length > 0 ? Math.round(adrs.reduce((s, a) => s + a, 0) / adrs.length) : 0;
  const minAdr = adrs.length > 0 ? Math.min(...adrs) : 0;
  const maxAdr = adrs.length > 0 ? Math.max(...adrs) : 0;
  const geoSpread = getGeographicSpread(activeProperties);
  const typeBreakdown = getTypeBreakdown(activeProperties);

  const ratings = activeProperties.map(p => p.starRating).filter((r): r is number => r != null);
  const avgStarRating = ratings.length > 0 ? Math.round(ratings.reduce((s, r) => s + r, 0) / ratings.length * 10) / 10 : null;

  const activeTemplates = serviceTemplates.filter(t => t.isActive !== false).map(t => ({
    name: t.name,
    rate: t.defaultRate,
    serviceModel: t.serviceModel,
    markup: t.serviceMarkup,
  }));

  const portfolioNarrative = buildPortfolioNarrative(activeProperties, totalRooms, avgAdr, geoSpread, avgStarRating, typeBreakdown);
  const serviceNarrative = buildServiceNarrative(activeTemplates);
  const feeNarrative = buildFeeNarrative(ga);
  const staffingNarrative = buildStaffingNarrative(ga);
  const icpNarrative = buildIcpNarrative(ga);
  const financialNarrative = buildFinancialScaleNarrative(ga, activeProperties);

  const fullNarrative = [
    `**${ga.companyName || "Management Company"}** manages ${activeProperties.length} properties.`,
    portfolioNarrative,
    `Service menu: ${serviceNarrative}`,
    `Fee structure: ${feeNarrative}`,
    `Staffing & overhead: ${staffingNarrative}`,
    icpNarrative,
    `Financial scale: ${financialNarrative}`,
  ].join("\n");

  return {
    companyProfile: {
      name: ga.companyName || "Management Company",
      description: ga.assetDescription || null,
      propertyLabel: ga.propertyLabel || "Hotel",
    },
    portfolioFootprint: {
      propertyCount: activeProperties.length,
      totalRooms,
      averageRooms: avgRooms,
      averageAdr: avgAdr,
      adrRange: { min: minAdr, max: maxAdr },
      geographicSpread: geoSpread,
      averageStarRating: avgStarRating,
      typeBreakdown,
      narrative: portfolioNarrative,
    },
    serviceMenu: { templates: activeTemplates, narrative: serviceNarrative },
    feeStructure: {
      baseManagementFeeRate: ga.baseManagementFee ?? null,
      incentiveManagementFeeRate: ga.incentiveManagementFee ?? null,
      commissionRate: ga.commissionRate ?? null,
      salesCommissionRate: ga.salesCommissionRate ?? null,
      narrative: feeNarrative,
    },
    staffingOverhead: { narrative: staffingNarrative },
    icpPositioning: { narrative: icpNarrative },
    financialScale: { narrative: financialNarrative },
    fullNarrative,
  };
}
