import { MonthlyFinancials } from "../financialEngine";
import { differenceInMonths, startOfMonth } from "date-fns";
import {
  DEFAULT_LAND_VALUE_PERCENT,
  DEFAULT_LTV,
  DEPRECIATION_YEARS,
  MONTHS_PER_YEAR,
} from '../constants';
import type { AuditFinding, AuditSection, PropertyAuditInput, GlobalAuditInput } from "./types";
import { parseLocalDate, formatVariance, AUDIT_TOLERANCE_DOLLARS } from "./helpers";

export function auditBalanceSheet(
  property: PropertyAuditInput,
  global: GlobalAuditInput,
  monthlyData: MonthlyFinancials[]
): AuditSection {
  const findings: AuditFinding[] = [];

  const modelStart = startOfMonth(parseLocalDate(global.modelStartDate));
  const acqDate = startOfMonth(parseLocalDate(property.acquisitionDate || property.operationsStartDate));
  const acqMonthIndex = differenceInMonths(acqDate, modelStart);

  const landPct = property.landValuePercent ?? DEFAULT_LAND_VALUE_PERCENT;
  const effectiveDepYears = property.depreciationYears ?? global.depreciationYears ?? DEPRECIATION_YEARS;
  const depreciableBasis = (property.purchasePrice ?? 0) * (1 - landPct) + (property.buildingImprovements ?? 0);
  const _monthlyDepreciation = depreciableBasis / effectiveDepYears / MONTHS_PER_YEAR;
  const landValue = (property.purchasePrice ?? 0) * landPct;

  let failedPropertyValue = 0;
  let failedEquity = 0;
  let totalChecked = 0;

  let cumulativeDepreciation = 0;

  for (let i = 0; i < monthlyData.length; i++) {
    const m = monthlyData[i];

    if (i < acqMonthIndex) continue;
    totalChecked++;

    cumulativeDepreciation += (m.depreciationExpense || 0);
    const expectedPropertyValue = landValue + depreciableBasis - cumulativeDepreciation;

    const actualPropertyValue = m.propertyValue || 0;

    if (Math.abs(expectedPropertyValue - actualPropertyValue) > AUDIT_TOLERANCE_DOLLARS) {
      failedPropertyValue++;
      if (failedPropertyValue <= 3) {
        findings.push({
          category: "Balance Sheet",
          rule: "Property Asset = Land + Depreciable Basis - Accumulated Depreciation",
          gaapReference: "ASC 360-10",
          severity: "material",
          passed: false,
          expected: expectedPropertyValue.toFixed(2),
          actual: actualPropertyValue.toFixed(2),
          variance: formatVariance(expectedPropertyValue, actualPropertyValue),
          recommendation: `Month ${i + 1}: Expected = $${landValue.toLocaleString()} + $${depreciableBasis.toLocaleString()} - $${cumulativeDepreciation.toFixed(0)} acc. depreciation`,
          workpaperRef: `WP-BS-ASSET-M${i + 1}`
        });
      }
    }

    const expectedNetCF = (m.operatingCashFlow || 0) + (m.financingCashFlow || 0);
    const actualCF = m.cashFlow || 0;
    if (Math.abs(expectedNetCF - actualCF) > AUDIT_TOLERANCE_DOLLARS) {
      failedEquity++;
      if (failedEquity <= 3) {
        findings.push({
          category: "Balance Sheet",
          rule: "Cash Flow = Operating CF + Financing CF",
          gaapReference: "ASC 230 / FASB Conceptual Framework",
          severity: "material",
          passed: false,
          expected: expectedNetCF.toFixed(2),
          actual: actualCF.toFixed(2),
          variance: formatVariance(expectedNetCF, actualCF),
          recommendation: `Month ${i + 1}: Cash flow components must reconcile`,
          workpaperRef: `WP-BS-CF-M${i + 1}`
        });
      }
    }
  }

  // ── A = L + E identity check (ASC 210) ──────────────────────────────────
  const totalPropValue = (property.purchasePrice ?? 0) + (property.buildingImprovements ?? 0);
  const isFinanced = property.type === "Financed";
  const originalLoanAmount = isFinanced ? totalPropValue * (property.acquisitionLTV ?? DEFAULT_LTV) : 0;
  const initialEquity = totalPropValue - originalLoanAmount + (property.operatingReserve ?? 0);

  let cumulativeNetIncome = 0;
  let cumulativeRefiEquityAdj = 0;
  let failedIdentity = 0;

  for (let i = 0; i < monthlyData.length; i++) {
    const m = monthlyData[i];
    if (i < acqMonthIndex) continue;

    cumulativeNetIncome += (m.netIncome || 0);

    // Refinancing proceeds increase cash (assets) and new debt increases liabilities,
    // but closing costs are not captured in net income.
    // The observed debtChange = newLoanEnding - prevDebt includes both the refi jump and
    // the first month's amortization on the new loan. To isolate the pure refi debt jump
    // (newLoanBeginning - prevDebt), we undo the amortization: refiDebtJump = rawDebtChange + principal.
    // Then equity adjustment = proceeds - refiDebtJump = -closingCosts.
    if ((m.refinancingProceeds || 0) !== 0) {
      const prevDebt = i > 0 ? (monthlyData[i - 1].debtOutstanding || 0) : 0;
      const rawDebtChange = (m.debtOutstanding || 0) - prevDebt;
      const refiDebtJump = rawDebtChange + (m.principalPayment || 0);
      cumulativeRefiEquityAdj += (m.refinancingProceeds || 0) - refiDebtJump;
    }

    const totalAssets = (m.endingCash || 0) + (m.propertyValue || 0);
    const totalLiabilities = m.debtOutstanding || 0;
    const derivedEquity = initialEquity + cumulativeNetIncome + cumulativeRefiEquityAdj;
    const gap = Math.abs(totalAssets - totalLiabilities - derivedEquity);

    if (gap > AUDIT_TOLERANCE_DOLLARS) {
      failedIdentity++;
      if (failedIdentity <= 3) {
        findings.push({
          category: "Balance Sheet",
          rule: "Assets = Liabilities + Equity (ASC 210)",
          gaapReference: "ASC 210 / FASB Conceptual Framework",
          severity: "critical",
          passed: false,
          expected: (totalLiabilities + derivedEquity).toFixed(2),
          actual: totalAssets.toFixed(2),
          variance: formatVariance(totalLiabilities + derivedEquity, totalAssets),
          recommendation: `Month ${i + 1}: Assets ($${totalAssets.toFixed(0)}) ≠ Liabilities ($${totalLiabilities.toFixed(0)}) + Equity ($${derivedEquity.toFixed(0)}); gap = $${gap.toFixed(2)}`,
          workpaperRef: `WP-BS-ALE-M${i + 1}`
        });
      }
    }
  }

  if (failedIdentity > 3) {
    findings.push({
      category: "Balance Sheet",
      rule: "Assets = Liabilities + Equity (ASC 210)",
      gaapReference: "ASC 210 / FASB Conceptual Framework",
      severity: "critical",
      passed: false,
      expected: "All months balance",
      actual: `${failedIdentity} months failed`,
      variance: `${failedIdentity} of ${totalChecked} months`,
      recommendation: "Balance sheet identity A=L+E has systematic variance — review equity derivation or debt tracking",
      workpaperRef: "WP-BS-ALE-SUMMARY"
    });
  }

  if (failedPropertyValue > 3) {
    findings.push({
      category: "Balance Sheet",
      rule: "Property Asset Valuation",
      gaapReference: "ASC 360-10",
      severity: "material",
      passed: false,
      expected: "All months match",
      actual: `${failedPropertyValue} months failed`,
      variance: `${failedPropertyValue} of ${totalChecked} months`,
      recommendation: "Property value calculation has systematic variance - review depreciation logic",
      workpaperRef: "WP-BS-ASSET-SUMMARY"
    });
  }

  if (failedPropertyValue === 0 && failedEquity === 0 && failedIdentity === 0) {
    findings.push({
      category: "Balance Sheet",
      rule: "Balance Sheet Reconciliation",
      gaapReference: "FASB Conceptual Framework",
      severity: "info",
      passed: true,
      expected: "All balance sheet checks passed",
      actual: `Property value, cash flow, and A=L+E identity reconciled for ${totalChecked} months`,
      variance: "N/A",
      recommendation: "Balance sheet is properly reconciled with independent calculations",
      workpaperRef: "WP-BS-OK"
    });
  }

  const passed = findings.filter(f => f.passed).length;
  const materialIssues = findings.filter(f => !f.passed && (f.severity === "critical" || f.severity === "material")).length;

  return {
    name: "Balance Sheet Audit",
    description: "Verify Assets = Liabilities + Equity and proper asset/debt valuation",
    findings,
    passed,
    failed: findings.length - passed,
    materialIssues
  };
}
