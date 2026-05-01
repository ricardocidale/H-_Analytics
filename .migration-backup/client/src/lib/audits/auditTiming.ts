import { MonthlyFinancials } from "../financialEngine";
import { differenceInMonths, startOfMonth } from "date-fns";
import type { AuditFinding, AuditSection, PropertyAuditInput, GlobalAuditInput } from "./types";
import { parseLocalDate, formatVariance } from "./helpers";

export function auditTimingRules(
  property: PropertyAuditInput,
  global: GlobalAuditInput,
  monthlyData: MonthlyFinancials[]
): AuditSection {
  const findings: AuditFinding[] = [];
  
  const modelStart = startOfMonth(parseLocalDate(global.modelStartDate));
  const opsStart = startOfMonth(parseLocalDate(property.operationsStartDate));
  const acquisitionDate = startOfMonth(parseLocalDate(property.acquisitionDate || property.operationsStartDate));
  
  const opsMonthIndex = differenceInMonths(opsStart, modelStart);
  const acqMonthIndex = differenceInMonths(acquisitionDate, modelStart);
  
  findings.push({
    category: "Timing",
    rule: "Model Start Date",
    gaapReference: "N/A",
    severity: "info",
    passed: true,
    expected: global.modelStartDate,
    actual: modelStart.toISOString().slice(0, 10),
    variance: "N/A",
    recommendation: "Model start date recorded",
    workpaperRef: "WP-TIME-001"
  });
  
  findings.push({
    category: "Timing",
    rule: "Operations Start Date",
    gaapReference: "N/A",
    severity: "info",
    passed: true,
    expected: property.operationsStartDate,
    actual: `Month ${opsMonthIndex + 1} of model`,
    variance: "N/A",
    recommendation: "Revenue should begin at operations start",
    workpaperRef: "WP-TIME-002"
  });
  
  for (let i = 0; i < Math.min(opsMonthIndex, monthlyData.length); i++) {
    const m = monthlyData[i];
    
    if (m.revenueTotal > 0) {
      findings.push({
        category: "Timing",
        rule: "Pre-Operations Revenue",
        gaapReference: "ASC 606",
        severity: "critical",
        passed: false,
        expected: 0,
        actual: m.revenueTotal.toFixed(2),
        variance: formatVariance(0, m.revenueTotal),
        recommendation: `Month ${i + 1}: Revenue recorded before operations start - investigate`,
        workpaperRef: `WP-TIME-REV-M${i + 1}`
      });
    }
  }
  
  for (let i = 0; i < Math.min(acqMonthIndex, monthlyData.length); i++) {
    const m = monthlyData[i];
    
    if (m.debtPayment > 0 || m.interestExpense > 0 || m.principalPayment > 0) {
      findings.push({
        category: "Timing",
        rule: "Pre-Acquisition Debt",
        gaapReference: "ASC 470",
        severity: "critical",
        passed: false,
        expected: 0,
        actual: m.debtPayment.toFixed(2),
        variance: formatVariance(0, m.debtPayment),
        recommendation: `Month ${i + 1}: Debt service before acquisition - liability does not exist yet`,
        workpaperRef: `WP-TIME-DEBT-M${i + 1}`
      });
    }
  }
  
  if (opsMonthIndex > 0 && opsMonthIndex < monthlyData.length) {
    const firstOpsMonth = monthlyData[opsMonthIndex];
    if (firstOpsMonth && firstOpsMonth.revenueTotal > 0) {
      findings.push({
        category: "Timing",
        rule: "Operations Start Verified",
        gaapReference: "ASC 606",
        severity: "info",
        passed: true,
        expected: "Revenue begins at ops start",
        actual: `$${firstOpsMonth.revenueTotal.toFixed(2)} in first operational month`,
        variance: "N/A",
        recommendation: "Revenue correctly begins at operations start date",
        workpaperRef: "WP-TIME-OPS-OK"
      });
    }
  }
  
  const passed = findings.filter(f => f.passed).length;
  const materialIssues = findings.filter(f => !f.passed && (f.severity === "critical" || f.severity === "material")).length;
  
  return {
    name: "Timing Rules Audit",
    description: "Verify all financial activity occurs after appropriate start dates",
    findings,
    passed,
    failed: findings.length - passed,
    materialIssues
  };
}
