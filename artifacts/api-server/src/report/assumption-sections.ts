import type { PropertyInput } from "@engine/types";
import { FIELD_REGISTRY, type FieldDefinition } from "@shared/field-registry";
import {
  resolveAsImprovedFacts,
  resolveAsPurchasedFacts,
} from "@engine/property/renovation-facts";
import { hasImprovedSideValues } from "@workspace/db";

/**
 * Assumption section builders for export reports.
 *
 * Title pattern `"Assumptions — <Entity>"` is the load-bearing contract:
 * - PDF / Excel / CSV consumers render assumption sections like any other table
 * - PPTX / DOCX generators filter them out (graphic formats)
 * - `selectStatements()` does not filter on this prefix — assumptions always
 *   travel with the report regardless of `reportScope`
 */
export const ASSUMPTIONS_TITLE_PREFIX = "Assumptions — ";

interface ExportRow {
  category: string;
  values: (string | number)[];
  indent?: number;
  isBold?: boolean;
  isHeader?: boolean;
  isItalic?: boolean;
  format?: "currency" | "percentage" | "number" | "ratio" | "multiplier";
}

interface StatementSection {
  title: string;
  years: string[];
  rows: ExportRow[];
  includeTable?: boolean;
  includeChart?: boolean;
}

function row(category: string, value: string | number | null | undefined, opts?: {
  indent?: number;
  isBold?: boolean;
  isHeader?: boolean;
  format?: ExportRow["format"];
}): ExportRow {
  const v = value === null || value === undefined ? "—" : value;
  return { category, values: [v], ...opts };
}

function header(label: string): ExportRow {
  return { category: label, values: [""], isHeader: true };
}

function fmtCurrency(v: number | null | undefined): string | number {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return v;
}

function fmtRate(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const pct = Math.abs(v) <= 2 ? v * 100 : v;
  return `${pct.toFixed(2)}%`;
}

function fmtInt(v: number | null | undefined): string | number {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return Math.round(v);
}

function fmtText(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

function fmtFieldValue(field: FieldDefinition, raw: unknown): string | number {
  if (raw === null || raw === undefined) return "—";
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return "—";
  switch (field.type) {
    case "rate": return fmtRate(n);
    case "currency": return fmtCurrency(n);
    case "integer": return fmtInt(n);
    case "decimal": return n;
  }
}

/** Resolve a property field with global-assumptions cascade per FIELD_REGISTRY. */
function resolvePropertyField(
  field: FieldDefinition,
  property: PropertyInput,
  globalAssumptions: Record<string, unknown>,
  rawProperty?: Record<string, unknown>,
): unknown {
  // Try property direct
  const propRecord = (rawProperty ?? property) as Record<string, unknown>;
  const propVal = propRecord[field.propertyField];
  if (propVal !== null && propVal !== undefined) return propVal;

  // Cascade per gaSource
  if (field.gaSource.kind === "direct") {
    return globalAssumptions[field.gaSource.gaField];
  }
  if (field.gaSource.kind === "debt") {
    const debt = globalAssumptions.debtAssumptions as Record<string, unknown> | undefined;
    if (debt) return debt[field.gaSource.debtField];
  }
  return field.fallback;
}

const PROPERTY_CATEGORY_LABELS: Record<FieldDefinition["category"], string> = {
  exit: "Exit Assumptions",
  revenue: "Revenue Assumptions",
  "cost-rate": "Operating Cost Rates",
  "management-fee": "Management Fees",
  operating: "Operating Assumptions",
  "debt-acquisition": "Acquisition Debt",
  "debt-refinance": "Refinance Debt",
  "brand-fee": "Brand Fee Stack",
  hma: "Hotel Management Agreement",
  condo: "Condo / Mixed-Use",
};

const PROPERTY_CATEGORY_ORDER: FieldDefinition["category"][] = [
  "revenue",
  "cost-rate",
  "operating",
  "management-fee",
  "debt-acquisition",
  "debt-refinance",
  "exit",
  "brand-fee",
  "hma",
  "condo",
];

export function buildPropertyAssumptionsSection(
  property: PropertyInput,
  globalAssumptions: Record<string, unknown>,
  rawProperty?: Record<string, unknown>,
): StatementSection {
  const p = (rawProperty ?? property) as Record<string, unknown>;
  const rows: ExportRow[] = [];

  rows.push(header("Property Profile"));
  rows.push(row("Name", fmtText(property.name), { indent: 1 }));
  rows.push(row("Business Model", fmtText(p.businessModel ?? "hotel"), { indent: 1 }));
  if (p.qualityTier) rows.push(row("Quality Tier", fmtText(p.qualityTier), { indent: 1 }));
  if (p.serviceLevel) rows.push(row("Service Level", fmtText(p.serviceLevel), { indent: 1 }));
  if (p.locationType) rows.push(row("Location Type", fmtText(p.locationType), { indent: 1 }));
  if (p.marketTier) rows.push(row("Market Tier", fmtText(p.marketTier), { indent: 1 }));
  rows.push(row("Rooms", fmtInt(property.roomCount), { indent: 1 }));
  // Renovation hypothesis (task #1406). Both snapshots come from the engine
  // resolver so the As-Improved row falls back to its As-Purchased twin
  // whenever the operator has not entered an improved value, and the legacy
  // `description` column survives transparently. The "(As-Improved, from
  // YYYY)" suffix mirrors the cutover used by the projection pipeline.
  const factsInput = p as unknown as Parameters<typeof resolveAsPurchasedFacts>[0];
  const purchasedFacts = resolveAsPurchasedFacts(factsInput);
  const improvedFacts = resolveAsImprovedFacts(factsInput);
  if (purchasedFacts.fbVenues != null) rows.push(row("F&B Venues (As-Purchased)", fmtInt(purchasedFacts.fbVenues), { indent: 1 }));
  if (purchasedFacts.fbSeats != null) rows.push(row("F&B Seats (As-Purchased)", fmtInt(purchasedFacts.fbSeats), { indent: 1 }));
  if (purchasedFacts.eventSpaceSqft != null) rows.push(row("Event Space (As-Purchased, sq ft)", fmtInt(purchasedFacts.eventSpaceSqft), { indent: 1 }));
  if (purchasedFacts.totalBuildingSqft != null) rows.push(row("Building (As-Purchased, sq ft)", fmtInt(purchasedFacts.totalBuildingSqft), { indent: 1 }));
  if (p.totalPropertyAcreage) rows.push(row("Acreage", fmtText(p.totalPropertyAcreage), { indent: 1 }));
  // Plan 2026-05-13-002 U3 — accessor-mediated presence check. New
  // As-Improved descriptor fields registered in the catalog automatically
  // participate without code edits here.
  const reopen = p.plannedReopeningYear != null ? Number(p.plannedReopeningYear) : null;
  const improvedSuffix = reopen != null ? ` (As-Improved, from ${reopen})` : " (As-Improved)";
  const hasImprovedHypothesis = hasImprovedSideValues(p);
  if (hasImprovedHypothesis) {
    if (improvedFacts.fbVenues != null) rows.push(row(`F&B Venues${improvedSuffix}`, fmtInt(improvedFacts.fbVenues), { indent: 1 }));
    if (improvedFacts.fbSeats != null) rows.push(row(`F&B Seats${improvedSuffix}`, fmtInt(improvedFacts.fbSeats), { indent: 1 }));
    if (improvedFacts.eventSpaceSqft != null) rows.push(row(`Event Space${improvedSuffix} (sq ft)`, fmtInt(improvedFacts.eventSpaceSqft), { indent: 1 }));
    if (improvedFacts.totalBuildingSqft != null) rows.push(row(`Building${improvedSuffix} (sq ft)`, fmtInt(improvedFacts.totalBuildingSqft), { indent: 1 }));
    if (reopen != null) rows.push(row("Planned Reopening Year", fmtInt(reopen), { indent: 1 }));
  }
  if (p.acquisitionDate) rows.push(row("Acquisition Date", fmtText(p.acquisitionDate), { indent: 1 }));
  if (p.operationsStartDate) rows.push(row("Operations Start", fmtText(p.operationsStartDate), { indent: 1 }));
  if (p.ownerPriorityReturn !== undefined && p.ownerPriorityReturn !== null && Number(p.ownerPriorityReturn) > 0) {
    rows.push(row("Owner Priority Return", fmtRate(Number(p.ownerPriorityReturn)), { indent: 1 }));
  }
  if (p.feeSubordination && p.feeSubordination !== "none") {
    rows.push(row("Fee Subordination", fmtText(p.feeSubordination), { indent: 1 }));
  }

  for (const cat of PROPERTY_CATEGORY_ORDER) {
    const fields = FIELD_REGISTRY.filter(f => f.category === cat);
    if (fields.length === 0) continue;
    rows.push(header(PROPERTY_CATEGORY_LABELS[cat]));
    for (const f of fields) {
      const raw = resolvePropertyField(f, property, globalAssumptions, rawProperty);
      rows.push(row(f.label, fmtFieldValue(f, raw), { indent: 1 }));
    }
  }

  return {
    title: `${ASSUMPTIONS_TITLE_PREFIX}${property.name ?? "Property"}`,
    years: ["Value"],
    rows,
    includeTable: true,
    includeChart: false,
  };
}

interface DebtAssumptionsShape {
  interestRate?: number;
  amortizationYears?: number;
  refiLTV?: number;
  refiClosingCostRate?: number;
  refiInterestRate?: number;
  refiAmortizationYears?: number;
  refiPeriodYears?: number;
  acqLTV?: number;
  acqClosingCostRate?: number;
}

interface AcqPackageShape {
  purchasePrice?: number;
  buildingImprovements?: number;
  preOpeningCosts?: number;
  operatingReserve?: number;
  monthsToOps?: number;
}

export function buildCompanyAssumptionsSection(
  globalAssumptions: Record<string, unknown>,
): StatementSection {
  const g = globalAssumptions;
  const companyName = (g.companyName as string) ?? "Management Company";
  const rows: ExportRow[] = [];

  rows.push(header("Company Identity"));
  rows.push(row("Company Name", fmtText(companyName), { indent: 1 }));
  rows.push(row("Property Label", fmtText(g.propertyLabel), { indent: 1 }));
  rows.push(row("Model Start Date", fmtText(g.modelStartDate), { indent: 1 }));
  rows.push(row("Operations Start Date", fmtText(g.companyOpsStartDate), { indent: 1 }));
  rows.push(row("Projection Years", fmtInt(Number(g.projectionYears)), { indent: 1 }));
  rows.push(row("Fiscal Year Start Month", fmtInt(Number(g.fiscalYearStartMonth)), { indent: 1 }));

  rows.push(header("Macro & Inflation"));
  rows.push(row("Inflation Rate", fmtRate(Number(g.inflationRate)), { indent: 1 }));
  rows.push(row("Fixed Cost Escalation", fmtRate(Number(g.fixedCostEscalationRate)), { indent: 1 }));
  if (g.companyInflationRate !== null && g.companyInflationRate !== undefined) {
    rows.push(row("Company Inflation Rate", fmtRate(Number(g.companyInflationRate)), { indent: 1 }));
  }

  rows.push(header("Management Fees"));
  rows.push(row("Base Management Fee", fmtRate(Number(g.baseManagementFee)), { indent: 1 }));
  rows.push(row("Incentive Management Fee", fmtRate(Number(g.incentiveManagementFee)), { indent: 1 }));

  rows.push(header("Funding"));
  rows.push(row("Funding Source Label", fmtText(g.fundingSourceLabel), { indent: 1 }));
  rows.push(row("Capital Raise 1 Amount", fmtCurrency(Number(g.capitalRaise1Amount)), { indent: 1 }));
  rows.push(row("Capital Raise 1 Date", fmtText(g.capitalRaise1Date), { indent: 1 }));
  rows.push(row("Capital Raise 2 Amount", fmtCurrency(Number(g.capitalRaise2Amount)), { indent: 1 }));
  rows.push(row("Capital Raise 2 Date", fmtText(g.capitalRaise2Date), { indent: 1 }));
  rows.push(row("Valuation Cap", fmtCurrency(Number(g.capitalRaiseValuationCap)), { indent: 1 }));
  rows.push(row("Discount Rate", fmtRate(Number(g.capitalRaiseDiscountRate)), { indent: 1 }));
  rows.push(row("Funding Interest Rate", fmtRate(Number(g.fundingInterestRate)), { indent: 1 }));
  rows.push(row("Interest Payment Frequency", fmtText(g.fundingInterestPaymentFrequency), { indent: 1 }));

  rows.push(header("Partner Compensation"));
  const PARTNER_COMP_YEAR_NUMS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"] as const;
  for (const y of PARTNER_COMP_YEAR_NUMS) {
    const comp = g[`partnerCompYear${y}`];
    const count = g[`partnerCountYear${y}`];
    rows.push(row(
      `Year ${y}: ${fmtInt(Number(count))} partners @ ${fmtCurrency(Number(comp))}`,
      "",
      { indent: 1 },
    ));
  }

  rows.push(header("Staffing"));
  rows.push(row("Staff Salary", fmtCurrency(Number(g.staffSalary)), { indent: 1 }));
  rows.push(row(`Tier 1 (≤ ${fmtInt(Number(g.staffTier1MaxProperties))} properties)`, `${Number(g.staffTier1Fte)} FTE`, { indent: 1 }));
  rows.push(row(`Tier 2 (≤ ${fmtInt(Number(g.staffTier2MaxProperties))} properties)`, `${Number(g.staffTier2Fte)} FTE`, { indent: 1 }));
  rows.push(row("Tier 3 (above Tier 2)", `${Number(g.staffTier3Fte)} FTE`, { indent: 1 }));

  rows.push(header("Fixed Overhead (Year 1)"));
  rows.push(row("Office Lease", fmtCurrency(Number(g.officeLeaseStart)), { indent: 1 }));
  rows.push(row("Professional Services", fmtCurrency(Number(g.professionalServicesStart)), { indent: 1 }));
  rows.push(row("Tech Infrastructure", fmtCurrency(Number(g.techInfraStart)), { indent: 1 }));
  rows.push(row("Business Insurance", fmtCurrency(Number(g.businessInsuranceStart)), { indent: 1 }));

  rows.push(header("Variable Costs"));
  rows.push(row("Travel Cost / Client", fmtCurrency(Number(g.travelCostPerClient)), { indent: 1 }));
  rows.push(row("IT License / Client", fmtCurrency(Number(g.itLicensePerClient)), { indent: 1 }));
  rows.push(row("Marketing Rate (% revenue)", fmtRate(Number(g.marketingRate)), { indent: 1 }));
  rows.push(row("Misc Ops Rate (% revenue)", fmtRate(Number(g.miscOpsRate)), { indent: 1 }));

  rows.push(header("Tax & Returns"));
  rows.push(row("Company Tax Rate", fmtRate(Number(g.companyTaxRate)), { indent: 1 }));
  rows.push(row("Cost of Equity", fmtRate(Number(g.costOfEquity)), { indent: 1 }));

  rows.push(header("Acquisition (Standard Package)"));
  const acq = g.standardAcqPackage as AcqPackageShape | undefined;
  rows.push(row("Purchase Price", fmtCurrency(acq?.purchasePrice), { indent: 1 }));
  rows.push(row("Building Improvements", fmtCurrency(acq?.buildingImprovements), { indent: 1 }));
  rows.push(row("Pre-Opening Costs", fmtCurrency(acq?.preOpeningCosts), { indent: 1 }));
  rows.push(row("Operating Reserve", fmtCurrency(acq?.operatingReserve), { indent: 1 }));
  rows.push(row("Months to Operations", fmtInt(acq?.monthsToOps), { indent: 1 }));
  rows.push(row("Acquisition Commission", fmtRate(Number(g.commissionRate)), { indent: 1 }));

  rows.push(header("Debt (Default)"));
  const debt = g.debtAssumptions as DebtAssumptionsShape | undefined;
  rows.push(row("Acquisition LTV", fmtRate(debt?.acqLTV), { indent: 1 }));
  rows.push(row("Acquisition Closing Cost", fmtRate(debt?.acqClosingCostRate), { indent: 1 }));
  rows.push(row("Acquisition Interest Rate", fmtRate(debt?.interestRate), { indent: 1 }));
  rows.push(row("Amortization (Years)", fmtInt(debt?.amortizationYears), { indent: 1 }));
  rows.push(row("Refinance LTV", fmtRate(debt?.refiLTV), { indent: 1 }));
  rows.push(row("Refinance Closing Cost", fmtRate(debt?.refiClosingCostRate), { indent: 1 }));
  if (debt?.refiInterestRate !== undefined) {
    rows.push(row("Refinance Interest Rate", fmtRate(debt.refiInterestRate), { indent: 1 }));
  }
  if (debt?.refiAmortizationYears !== undefined) {
    rows.push(row("Refinance Amortization (Years)", fmtInt(debt.refiAmortizationYears), { indent: 1 }));
  }
  if (debt?.refiPeriodYears !== undefined) {
    rows.push(row("Refinance Period (Years)", fmtInt(debt.refiPeriodYears), { indent: 1 }));
  }

  rows.push(header("Exit Defaults"));
  rows.push(row("Exit Cap Rate", fmtRate(Number(g.exitCapRate)), { indent: 1 }));
  rows.push(row("Sales Commission", fmtRate(Number(g.salesCommissionRate)), { indent: 1 }));
  if (g.exitRevenueMultiple !== null && g.exitRevenueMultiple !== undefined) {
    rows.push(row("Exit Revenue Multiple", `${Number(g.exitRevenueMultiple).toFixed(2)}x`, { indent: 1 }));
  }
  rows.push(row("Depreciation Years", fmtInt(Number(g.depreciationYears)), { indent: 1 }));

  return {
    title: `${ASSUMPTIONS_TITLE_PREFIX}${companyName}`,
    years: ["Value"],
    rows,
    includeTable: true,
    includeChart: false,
  };
}
