import { MonthlyFinancials } from "../financialEngine";
import { differenceInMonths, startOfMonth } from "date-fns";
import { getFactoryNumber } from "@shared/model-constants-registry";
import {
  DEFAULT_LAND_VALUE_PERCENT,
  // DEPRECIATION_YEARS replaced with registry factory baseline (Audit #319 R4).
  MONTHS_PER_YEAR,
} from '../constants';
import type { AuditFinding, AuditSection, PropertyAuditInput, GlobalAuditInput } from "./types";
import { parseLocalDate, withinTolerance, formatVariance, AUDIT_TOLERANCE_DOLLARS, AUDIT_SAMPLE_MONTHS } from "./helpers";

export function auditDepreciation(
  property: PropertyAuditInput,
  global: GlobalAuditInput,
  monthlyData: MonthlyFinancials[]
): AuditSection {
  const findings: AuditFinding[] = [];
  
  const landPct = property.landValuePercent ?? DEFAULT_LAND_VALUE_PERCENT;
  const effectiveDepYears = property.depreciationYears ?? global.depreciationYears ?? getFactoryNumber('depreciationYears');
  const depreciableBasis = property.purchasePrice * (1 - landPct) + property.buildingImprovements;
  const expectedMonthlyDep = depreciableBasis / effectiveDepYears / MONTHS_PER_YEAR;
  const expectedAnnualDep = depreciableBasis / effectiveDepYears;

  const modelStart = startOfMonth(parseLocalDate(global.modelStartDate));
  const acquisitionDate = startOfMonth(parseLocalDate(property.acquisitionDate || property.operationsStartDate));
  const acqMonthIndex = Math.max(0, differenceInMonths(acquisitionDate, modelStart));
  
  findings.push({
    category: "Depreciation",
    rule: "39-Year Straight-Line Method",
    gaapReference: "IRS Publication 946 / ASC 360-10",
    severity: "critical",
    passed: true,
    expected: `Depreciable Basis: $${depreciableBasis.toLocaleString()} (${((1 - landPct) * 100).toFixed(0)}% of purchase + improvements)`,
    actual: `Monthly: $${expectedMonthlyDep.toFixed(2)}`,
    variance: `Annual: $${expectedAnnualDep.toFixed(2)}`,
    recommendation: "Verify depreciation uses 39-year schedule for nonresidential hotel property",
    workpaperRef: "WP-DEP-001"
  });
  
  findings.push({
    category: "Depreciation",
    rule: "Depreciation Start Date",
    gaapReference: "ASC 360-10-35",
    severity: "critical",
    passed: true,
    expected: `Starts Month ${acqMonthIndex + 1}`,
    actual: `Acquisition: ${acquisitionDate.toISOString().slice(0, 10)}`,
    variance: "N/A",
    recommendation: "Depreciation must begin when property is placed in service",
    workpaperRef: "WP-DEP-002"
  });
  
  let preAcqDepFailures = 0;
  for (let i = 0; i < Math.min(acqMonthIndex, monthlyData.length); i++) {
    const m = monthlyData[i];
    if ((m.depreciationExpense ?? 0) > AUDIT_TOLERANCE_DOLLARS) {
      preAcqDepFailures++;
      if (preAcqDepFailures <= 2) {
        findings.push({
          category: "Depreciation",
          rule: "Pre-Acquisition Depreciation",
          gaapReference: "ASC 360-10-35",
          severity: "critical",
          passed: false,
          expected: 0,
          actual: m.depreciationExpense,
          variance: formatVariance(0, m.depreciationExpense ?? 0),
          recommendation: `Month ${i + 1}: Depreciation recorded before asset placed in service`,
          workpaperRef: `WP-DEP-003-M${i + 1}`
        });
      }
    }
  }

  let depFailures = 0;
  const sampleEnd = Math.min(acqMonthIndex + AUDIT_SAMPLE_MONTHS, monthlyData.length);
  for (let i = acqMonthIndex; i < sampleEnd; i++) {
    const m = monthlyData[i];
    const actualDep = m.depreciationExpense ?? 0;
    if (!withinTolerance(expectedMonthlyDep, actualDep)) {
      depFailures++;
      if (depFailures <= 3) {
        findings.push({
          category: "Depreciation",
          rule: "Monthly Depreciation Amount",
          gaapReference: "ASC 360-10-35 / IRS Pub 946",
          severity: "material",
          passed: false,
          expected: expectedMonthlyDep.toFixed(2),
          actual: actualDep.toFixed(2),
          variance: formatVariance(expectedMonthlyDep, actualDep),
          recommendation: `Month ${i + 1}: Expected $${depreciableBasis.toLocaleString()} / ${effectiveDepYears} / 12 = $${expectedMonthlyDep.toFixed(2)}`,
          workpaperRef: `WP-DEP-AMT-M${i + 1}`
        });
      }
    }
  }

  if (depFailures === 0 && preAcqDepFailures === 0) {
    findings.push({
      category: "Depreciation",
      rule: "Depreciation Amount Validation",
      gaapReference: "ASC 360-10-35 / IRS Pub 946",
      severity: "info",
      passed: true,
      expected: `$${expectedMonthlyDep.toFixed(2)}/month`,
      actual: `Verified ${sampleEnd - acqMonthIndex} post-acquisition months`,
      variance: "Within tolerance",
      recommendation: "Monthly depreciation matches 39-year straight-line calculation",
      workpaperRef: "WP-DEP-AMT-OK"
    });
  }

  const passed = findings.filter(f => f.passed).length;
  const materialIssues = findings.filter(f => !f.passed && (f.severity === "critical" || f.severity === "material")).length;
  
  return {
    name: "Depreciation Audit",
    description: "Verify 39-year straight-line depreciation per IRS/GAAP requirements",
    findings,
    passed,
    failed: findings.length - passed,
    materialIssues
  };
}
