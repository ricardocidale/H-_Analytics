/**
 * runVerification.ts — The Verification Orchestrator
 *
 * This file ties together all of the financial verification systems into a single
 * pipeline. When the user clicks "Verify" in the UI, this is what runs.
 *
 * The verification pipeline runs 4 independent check systems on every property:
 *   1. Formula Checker (formulaChecker.ts) — Validates math identities
 *      (e.g., Revenue = ADR × Sold Rooms, ANOI = NOI - FF&E)
 *   2. GAAP Compliance Checker (gaapComplianceChecker.ts) — Validates accounting rules
 *      (e.g., principal not in Net Income, depreciation method correct)
 *   3. Full Auditor (financialAuditor.ts) — Independent recalculation of every number
 *      with workpaper references, just like a real audit firm would do
 *   4. Cross-Calculator Validation (crossCalculatorValidation.ts) — Compares the
 *      client engine's numbers against IRS/GAAP authoritative formulas
 *
 * The pipeline:
 *   For each property:
 *     → Run the financial engine to generate pro forma numbers
 *     → Feed those numbers through all 4 checkers
 *     → Collect results
 *   Then aggregate into a single VerificationResults object with:
 *     - Human-readable text reports (for display in the Checker Manual page)
 *     - Structured audit data (for programmatic consumption)
 *     - A summary with pass/fail counts, critical/material issues, audit opinion
 *
 * Overall status logic:
 *   PASS — No issues at all
 *   WARNING — Material issues found but no critical failures
 *   FAIL — Critical issues or formula failures detected
 */
import { generatePropertyProForma, MonthlyFinancials } from "./financialEngine";
import { checkPropertyFormulas, checkMetricFormulas, generateFormulaReport } from "./audits/formulaChecker";
import { checkGAAPCompliance, checkCashFlowStatement, generateComplianceReport } from "./audits/gaapComplianceChecker";
import { runFullAudit, generateAuditWorkpaper, type PropertyAuditInput, type GlobalAuditInput } from "./financialAuditor";
import { crossValidateFinancingCalculators, formatCrossValidationReport, type CrossValidationReport } from "./audits/crossCalculatorValidation";
import {
  DEFAULT_LTV,
  DEFAULT_INTEREST_RATE,
  DEFAULT_TERM_YEARS,
  PROJECTION_YEARS,
  MONTHS_PER_YEAR,
} from "./constants";

export type { TestCase } from "./verification/test-cases";
export { KNOWN_VALUE_TEST_CASES } from "./verification/test-cases";
export type { KnownValueCheck, KnownValueTestResult } from "./verification/known-value-runner";
export { runKnownValueTests, runKnownValueTestsStructured } from "./verification/known-value-runner";

export interface VerificationResults {
  formulaReport: string;
  complianceReport: string;
  auditWorkpaper: string;
  crossValidationReport: string;
  auditReports: import("./financialAuditor").AuditReport[];
  crossValidationReports: CrossValidationReport[];
  summary: {
    formulaChecksPassed: number;
    formulaChecksFailed: number;
    complianceChecksPassed: number;
    complianceChecksFailed: number;
    crossValidationPassed: number;
    crossValidationFailed: number;
    criticalIssues: number;
    materialIssues: number;
    auditOpinion: "UNQUALIFIED" | "QUALIFIED" | "ADVERSE" | "DISCLAIMER";
    overallStatus: "PASS" | "FAIL" | "WARNING";
  };
}

function convertToAuditInput(property: any): PropertyAuditInput {
  return {
    name: property.name || 'Unnamed Property',
    operationsStartDate: property.operationsStartDate,
    acquisitionDate: property.acquisitionDate || property.operationsStartDate,
    roomCount: property.roomCount,
    startAdr: property.startAdr,
    adrGrowthRate: property.adrGrowthRate,
    startOccupancy: property.startOccupancy,
    maxOccupancy: property.maxOccupancy,
    occupancyRampMonths: property.occupancyRampMonths,
    occupancyGrowthStep: property.occupancyGrowthStep,
    purchasePrice: property.purchasePrice,
    buildingImprovements: property.buildingImprovements || 0,
    landValuePercent: property.landValuePercent,
    taxRate: property.taxRate,
    type: property.type,
    acquisitionLTV: property.acquisitionLTV,
    acquisitionInterestRate: property.acquisitionInterestRate,
    acquisitionTermYears: property.acquisitionTermYears,
    operatingReserve: property.operatingReserve,
    debtAssumptions: property.debtAssumptions,
    willRefinance: property.willRefinance,
    refinanceDate: property.refinanceDate,
    refinanceLTV: property.refinanceLTV,
    refinanceInterestRate: property.refinanceInterestRate,
    refinanceTermYears: property.refinanceTermYears,
    refinanceClosingCostRate: property.refinanceClosingCostRate,
    costRateRooms: property.costRateRooms,
    costRateFB: property.costRateFB,
    costRateAdmin: property.costRateAdmin,
    costRateMarketing: property.costRateMarketing,
    costRatePropertyOps: property.costRatePropertyOps,
    costRateUtilities: property.costRateUtilities,
    costRateTaxes: property.costRateTaxes,
    costRateIT: property.costRateIT,
    costRateFFE: property.costRateFFE,
    costRateOther: property.costRateOther,
    costRateInsurance: property.costRateInsurance,
    revShareEvents: property.revShareEvents,
    revShareFB: property.revShareFB,
    revShareOther: property.revShareOther,
    baseManagementFeeRate: property.baseManagementFeeRate,
    incentiveManagementFeeRate: property.incentiveManagementFeeRate,
  };
}

function convertToGlobalAuditInput(global: any): GlobalAuditInput {
  return {
    modelStartDate: global.modelStartDate,
    inflationRate: global.inflationRate,
    debtAssumptions: {
      interestRate: DEFAULT_INTEREST_RATE,
      amortizationYears: DEFAULT_TERM_YEARS,
      acqLTV: DEFAULT_LTV
    }
  };
}

export function runFullVerification(
  properties: any[],
  globalAssumptions: any
): VerificationResults {
  const formulaReports: any[] = [];
  const complianceReports: any[] = [];
  const auditReports: any[] = [];
  const crossReports: any[] = [];
  
  const globalAuditInput = convertToGlobalAuditInput(globalAssumptions);
  
  for (const property of properties) {
    try {
      const projectionMonths = ((globalAssumptions as Record<string, unknown>).projectionYears as number ?? PROJECTION_YEARS) * MONTHS_PER_YEAR;
      const financials = generatePropertyProForma(property, globalAssumptions, projectionMonths);
      
      const formulaCheck = checkPropertyFormulas(financials);
      formulaReports.push(formulaCheck);
      
      const gaapCheck = checkGAAPCompliance(financials);
      complianceReports.push(gaapCheck);
      
      const cfCheck = checkCashFlowStatement(financials);
      complianceReports.push(cfCheck);
      
      const yearlyData = aggregateToYearly(financials);
      const metricCheck = checkMetricFormulas(yearlyData);
      formulaReports.push(metricCheck);
      
      const propertyAuditInput = convertToAuditInput(property);
      const auditReport = runFullAudit(propertyAuditInput, globalAuditInput, financials);
      auditReports.push(auditReport);
      
      const crossReport = crossValidateFinancingCalculators(
        {
          purchasePrice: property.purchasePrice,
          type: property.type,
          acquisitionLTV: property.acquisitionLTV,
          acquisitionInterestRate: property.acquisitionInterestRate ?? property.debtAssumptions?.interestRate,
          acquisitionTermYears: property.acquisitionTermYears ?? property.debtAssumptions?.amortizationYears,
          landValuePercent: property.landValuePercent,
          buildingImprovements: property.buildingImprovements,
          baseManagementFeeRate: property.baseManagementFeeRate,
          incentiveManagementFeeRate: property.incentiveManagementFeeRate,
          feeCategories: property.feeCategories,
          costRateFFE: property.costRateFFE,
        },
        globalAssumptions,
        financials,
      );
      crossReports.push(crossReport);
      
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      complianceReports.push({
        propertyName: property.name,
        checks: [{ rule: "verification_error", passed: false, severity: "critical" as const, message: `Verification crashed: ${errMsg}` }],
      });
    }
  }
  
  const formulaReport = generateFormulaReport(formulaReports);
  const complianceReport = generateComplianceReport(complianceReports);
  
  let auditWorkpaper = "";
  auditWorkpaper += "╔══════════════════════════════════════════════════════════════════════════════╗\n";
  auditWorkpaper += "║               CONSOLIDATED INDEPENDENT AUDITOR'S REPORT                      ║\n";
  auditWorkpaper += "║                       H+ Analytics                                  ║\n";
  auditWorkpaper += "╚══════════════════════════════════════════════════════════════════════════════╝\n\n";
  
  for (const report of auditReports) {
    auditWorkpaper += generateAuditWorkpaper(report);
    auditWorkpaper += "\n\n";
  }

  let crossValidationReport = "";
  for (const report of crossReports) {
    crossValidationReport += formatCrossValidationReport(report);
    crossValidationReport += "\n\n";
  }
  
  const formulaChecksPassed = formulaReports.reduce((sum, r) => sum + r.passed, 0);
  const formulaChecksFailed = formulaReports.reduce((sum, r) => sum + r.failed, 0);
  const complianceChecksPassed = complianceReports.reduce((sum, r) => sum + r.passed, 0);
  const complianceChecksFailed = complianceReports.reduce((sum, r) => sum + r.failed, 0);
  const crossValidationPassed = crossReports.reduce((sum, r) => sum + r.passed, 0);
  const crossValidationFailed = crossReports.reduce((sum, r) => sum + r.failed, 0);
  const criticalIssues = auditReports.reduce((sum, r) => sum + r.criticalIssues, 0) +
    crossReports.reduce((sum, r) => sum + r.criticalIssues, 0);
  const materialIssues = auditReports.reduce((sum, r) => sum + r.materialIssues, 0);
  
  let auditOpinion: "UNQUALIFIED" | "QUALIFIED" | "ADVERSE" | "DISCLAIMER" = "UNQUALIFIED";
  const hasCrossValidationCritical = crossReports.some(r => r.criticalIssues > 0);
  if (auditReports.some(r => r.opinion === "ADVERSE") || hasCrossValidationCritical) {
    auditOpinion = "ADVERSE";
  } else if (auditReports.some(r => r.opinion === "QUALIFIED") || crossValidationFailed > 0) {
    auditOpinion = "QUALIFIED";
  } else if (auditReports.some(r => r.opinion === "DISCLAIMER")) {
    auditOpinion = "DISCLAIMER";
  }
  
  let overallStatus: "PASS" | "FAIL" | "WARNING" = "PASS";
  if (criticalIssues > 0 || formulaChecksFailed > 0 || auditOpinion === "ADVERSE") {
    overallStatus = "FAIL";
  } else if (materialIssues > 0 || complianceChecksFailed > 0 || crossValidationFailed > 0 || auditOpinion === "QUALIFIED") {
    overallStatus = "WARNING";
  }
  
  return {
    formulaReport,
    complianceReport,
    auditWorkpaper,
    crossValidationReport,
    auditReports,
    crossValidationReports: crossReports,
    summary: {
      formulaChecksPassed,
      formulaChecksFailed,
      complianceChecksPassed,
      complianceChecksFailed,
      crossValidationPassed,
      crossValidationFailed,
      criticalIssues,
      materialIssues,
      auditOpinion,
      overallStatus
    }
  };
}

function aggregateToYearly(monthlyData: MonthlyFinancials[]): Array<{
  year: number;
  revenueRooms: number;
  soldRooms: number;
  availableRooms: number;
  adr: number;
  occupancy: number;
  revpar: number;
  revenueTotal: number;
  expenseOperating: number;
  gop: number;
  feeBase: number;
  feeIncentive: number;
  agop: number;
  expenseTaxes: number;
  noi: number;
  expenseFFE: number;
  anoi: number;
  equityMultiple?: number;
  netIncome?: number;
}> {
  const yearlyMap = new Map<number, any>();
  
  for (let i = 0; i < monthlyData.length; i++) {
    const m = monthlyData[i];
    const year = Math.floor(i / MONTHS_PER_YEAR) + 1;
    
    if (!yearlyMap.has(year)) {
      yearlyMap.set(year, { 
        revenueRooms: 0, 
        soldRooms: 0, 
        availableRooms: 0,
        revenueTotal: 0,
        expenseOperating: 0,
        gop: 0,
        feeBase: 0,
        feeIncentive: 0,
        agop: 0,
        expenseTaxes: 0,
        noi: 0,
        expenseFFE: 0,
        anoi: 0,
        netIncome: 0,
      });
    }
    
    const y = yearlyMap.get(year)!;
    y.revenueRooms += m.revenueRooms;
    y.soldRooms += m.soldRooms;
    y.availableRooms += m.availableRooms;
    y.revenueTotal += m.revenueTotal;
    
    const totalOperatingExpenses = m.expenseRooms + m.expenseFB + m.expenseEvents + 
      m.expenseOther + m.expenseMarketing + m.expensePropertyOps + 
      m.expenseUtilitiesVar + m.expenseAdmin + m.expenseIT + 
      m.expenseUtilitiesFixed + m.expenseInsurance + m.expenseOtherCosts;
    
    y.expenseOperating += totalOperatingExpenses;
    y.gop += m.gop;
    y.feeBase += m.feeBase;
    y.feeIncentive += m.feeIncentive;
    y.agop += m.agop;
    y.expenseTaxes += m.expenseTaxes;
    y.noi += m.noi;
    y.expenseFFE += m.expenseFFE;
    y.anoi += m.anoi;
    y.netIncome += (m.netIncome || 0);
  }
  
  return Array.from(yearlyMap.entries()).map(([year, d]) => ({
    year,
    ...d,
    adr: d.soldRooms > 0 ? d.revenueRooms / d.soldRooms : 0,
    occupancy: d.availableRooms > 0 ? (d.soldRooms / d.availableRooms) * 100 : 0,
    revpar: d.availableRooms > 0 ? d.revenueRooms / d.availableRooms : 0,
    equityMultiple: d.netIncome / (d.revenueTotal * 0.1 || 1),
  }));
}

export function printVerificationResults(_results: VerificationResults): void {
}
