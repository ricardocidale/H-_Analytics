import { MonthlyFinancials } from "../financialEngine";
import { differenceInMonths, startOfMonth } from "date-fns";
import type { AuditFinding, AuditSection, PropertyAuditInput, GlobalAuditInput } from "./types";
import { parseLocalDate, formatVariance, AUDIT_TOLERANCE_DOLLARS } from "./helpers";

export function auditCashFlowReconciliation(
  property: PropertyAuditInput,
  global: GlobalAuditInput,
  monthlyData: MonthlyFinancials[]
): AuditSection {
  const findings: AuditFinding[] = [];

  const modelStart = startOfMonth(parseLocalDate(global.modelStartDate));
  const acqDate = startOfMonth(parseLocalDate(property.acquisitionDate || property.operationsStartDate));
  const acqMonthIndex = differenceInMonths(acqDate, modelStart);

  let cumulativeCashFlow = 0;
  let failedNetCF = 0;
  let failedEndingCash = 0;
  let failedOperatingCF = 0;
  let failedFinancingCF = 0;
  let totalChecked = 0;
  const reserveSeed = property.operatingReserve ?? 0;

  for (let i = 0; i < monthlyData.length; i++) {
    const m = monthlyData[i];
    if (i === acqMonthIndex) {
      cumulativeCashFlow += reserveSeed;
    }
    cumulativeCashFlow += (m.cashFlow ?? 0);

    if (i < acqMonthIndex) continue;
    totalChecked++;

    const netIncome = m.netIncome ?? 0;
    const depreciation = m.depreciationExpense ?? 0;
    const principalPayment = m.principalPayment ?? 0;
    const refiProceeds = m.refinancingProceeds ?? 0;

    const expectedOperatingCF = netIncome + depreciation;
    const expectedFinancingCF = -principalPayment + refiProceeds;
    const expectedNetCF = expectedOperatingCF + expectedFinancingCF;
    const actualCashFlow = m.cashFlow ?? 0;

    if (Math.abs(expectedNetCF - actualCashFlow) > AUDIT_TOLERANCE_DOLLARS) {
      failedNetCF++;
      if (failedNetCF <= 3) {
        findings.push({
          category: "Cash Flow Statement",
          rule: "Net Cash Flow = Operating CF + Financing CF",
          gaapReference: "ASC 230-10-45",
          severity: "material",
          passed: false,
          expected: `$${expectedNetCF.toFixed(2)}`,
          actual: actualCashFlow.toFixed(2),
          variance: formatVariance(expectedNetCF, actualCashFlow),
          recommendation: `Month ${i + 1}: Operating CF ($${expectedOperatingCF.toFixed(0)}) + Financing CF ($${expectedFinancingCF.toFixed(0)})`,
          workpaperRef: `WP-CF-NET-M${i + 1}`
        });
      }
    }

    const debtPayment = m.debtPayment ?? 0;
    const interestExpense = m.interestExpense ?? 0;
    const expectedTotalDebt = interestExpense + principalPayment;
    if (debtPayment > 0 && Math.abs(debtPayment - expectedTotalDebt) > 1) {
      findings.push({
        category: "Cash Flow Statement",
        rule: "Debt Service Split: Interest + Principal = Total Payment",
        gaapReference: "ASC 230-10-45-17",
        severity: "material",
        passed: false,
        expected: `$${expectedTotalDebt.toFixed(2)}`,
        actual: `$${debtPayment.toFixed(2)}`,
        variance: formatVariance(expectedTotalDebt, debtPayment),
        recommendation: `Month ${i + 1}: Interest ($${interestExpense.toFixed(0)}) + Principal ($${principalPayment.toFixed(0)})`,
        workpaperRef: `WP-CF-SPLIT-M${i + 1}`
      });
    }

    const actualEndingCash = m.endingCash;
    if (actualEndingCash !== undefined && Math.abs(cumulativeCashFlow - actualEndingCash) > AUDIT_TOLERANCE_DOLLARS) {
      failedEndingCash++;
      if (failedEndingCash <= 3) {
        findings.push({
          category: "Cash Flow Statement",
          rule: "Ending Cash = Cumulative Net Cash Flows",
          gaapReference: "ASC 230-10-45-24",
          severity: "critical",
          passed: false,
          expected: `$${cumulativeCashFlow.toFixed(2)}`,
          actual: `$${actualEndingCash.toFixed(2)}`,
          variance: formatVariance(cumulativeCashFlow, actualEndingCash),
          recommendation: `Month ${i + 1}: Cash reconciliation failed`,
          workpaperRef: `WP-CF-RECON-M${i + 1}`
        });
      }
    }

    const actualOperatingCF = m.operatingCashFlow;
    if (actualOperatingCF !== undefined && Math.abs(expectedOperatingCF - actualOperatingCF) > AUDIT_TOLERANCE_DOLLARS) {
      failedOperatingCF++;
      if (failedOperatingCF <= 3) {
        findings.push({
          category: "Cash Flow Statement",
          rule: "Operating CF = Net Income + Depreciation (Indirect Method)",
          gaapReference: "ASC 230-10-45",
          severity: "material",
          passed: false,
          expected: `$${expectedOperatingCF.toFixed(2)}`,
          actual: `$${actualOperatingCF.toFixed(2)}`,
          variance: formatVariance(expectedOperatingCF, actualOperatingCF),
          recommendation: `Month ${i + 1}: NI ($${netIncome.toFixed(0)}) + Dep ($${depreciation.toFixed(0)})`,
          workpaperRef: `WP-CF-OP-M${i + 1}`
        });
      }
    }

    const actualFinancingCF = m.financingCashFlow;
    if (actualFinancingCF !== undefined && Math.abs(expectedFinancingCF - actualFinancingCF) > AUDIT_TOLERANCE_DOLLARS) {
      failedFinancingCF++;
      if (failedFinancingCF <= 3) {
        findings.push({
          category: "Cash Flow Statement",
          rule: "Financing CF = -Principal + Refinance Proceeds",
          gaapReference: "ASC 230-10-45-17",
          severity: "material",
          passed: false,
          expected: `$${expectedFinancingCF.toFixed(2)}`,
          actual: `$${actualFinancingCF.toFixed(2)}`,
          variance: formatVariance(expectedFinancingCF, actualFinancingCF),
          recommendation: `Month ${i + 1}: -Principal ($${principalPayment.toFixed(0)}) + Refi ($${refiProceeds.toFixed(0)})`,
          workpaperRef: `WP-CF-FIN-M${i + 1}`
        });
      }
    }
  }

  const totalFailed = failedNetCF + failedEndingCash + failedOperatingCF + failedFinancingCF;

  if (totalFailed === 0) {
    findings.push({
      category: "Cash Flow Statement",
      rule: "Cash Flow Reconciliation",
      gaapReference: "ASC 230",
      severity: "info",
      passed: true,
      expected: "All cash flow checks passed",
      actual: `Verified ${totalChecked} months of cash flow statements`,
      variance: "N/A",
      recommendation: "Cash flow statement follows GAAP indirect method with proper Operating/Financing split",
      workpaperRef: "WP-CF-OK"
    });
  }

  const passed = findings.filter(f => f.passed).length;
  const materialIssues = findings.filter(f => !f.passed && (f.severity === "critical" || f.severity === "material")).length;

  return {
    name: "Cash Flow Reconciliation Audit",
    description: "Verify cash flow statement per GAAP indirect method (ASC 230)",
    findings,
    passed,
    failed: findings.length - passed,
    materialIssues
  };
}
