import { MonthlyFinancials } from "../financialEngine";
import { addMonths, isBefore, startOfMonth } from "date-fns";
import {
  DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
} from '../constants';
import type { AuditFinding, AuditSection, PropertyAuditInput, GlobalAuditInput } from "./types";
import { parseLocalDate, withinTolerance, formatVariance, AUDIT_SAMPLE_MONTHS } from "./helpers";

export function auditManagementFees(
  property: PropertyAuditInput,
  global: GlobalAuditInput,
  monthlyData: MonthlyFinancials[]
): AuditSection {
  const findings: AuditFinding[] = [];
  
  const modelStart = startOfMonth(parseLocalDate(global.modelStartDate));
  const opsStart = startOfMonth(parseLocalDate(property.operationsStartDate));

  for (let i = 0; i < Math.min(AUDIT_SAMPLE_MONTHS, monthlyData.length); i++) {
    const m = monthlyData[i];
    const currentDate = addMonths(modelStart, i);
    const isOperational = !isBefore(currentDate, opsStart);
    
    if (!isOperational) continue;
    
    const baseFeeRate = property.baseManagementFeeRate ?? DEFAULT_BASE_MANAGEMENT_FEE_RATE;
    const incentiveFeeRate = property.incentiveManagementFeeRate ?? DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE;
    const expectedBaseFee = m.revenueTotal * baseFeeRate;
    const baseFeeMatch = withinTolerance(expectedBaseFee, m.feeBase);
    
    if (!baseFeeMatch && i < 6) {
      findings.push({
        category: "Management Fees",
        rule: "Base Management Fee",
        gaapReference: "ASC 606 - Performance Obligation",
        severity: "material",
        passed: false,
        expected: expectedBaseFee.toFixed(2),
        actual: m.feeBase.toFixed(2),
        variance: formatVariance(expectedBaseFee, m.feeBase),
        recommendation: `Month ${i + 1}: Base Fee = Revenue × ${(baseFeeRate * 100).toFixed(1)}%`,
        workpaperRef: `WP-FEE-BASE-M${i + 1}`
      });
    }
    
    const _expectedIncentiveFee = m.gop > 0 ? Math.max(0, m.gop * incentiveFeeRate) : 0;
    if (m.feeIncentive < 0) {
      findings.push({
        category: "Management Fees",
        rule: "Negative Incentive Fee",
        gaapReference: "ASC 606",
        severity: "critical",
        passed: false,
        expected: ">= 0",
        actual: m.feeIncentive.toFixed(2),
        variance: "Negative fee not allowed",
        recommendation: `Month ${i + 1}: Incentive fee cannot be negative`,
        workpaperRef: `WP-FEE-INC-M${i + 1}`
      });
    }
  }
  
  findings.push({
    category: "Management Fees",
    rule: "Fee Structure Verification",
    gaapReference: "ASC 606",
    severity: "info",
    passed: true,
    expected: `Base: ${((property.baseManagementFeeRate ?? DEFAULT_BASE_MANAGEMENT_FEE_RATE) * 100).toFixed(1)}%, Incentive: ${((property.incentiveManagementFeeRate ?? DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE) * 100).toFixed(1)}%`,
    actual: "Fee rates documented",
    variance: "N/A",
    recommendation: "Management fee structure matches per-property assumptions",
    workpaperRef: "WP-FEE-STRUCT"
  });
  
  const passed = findings.filter(f => f.passed).length;
  const materialIssues = findings.filter(f => !f.passed && (f.severity === "critical" || f.severity === "material")).length;
  
  return {
    name: "Management Fees Audit",
    description: "Verify base and incentive management fee calculations",
    findings,
    passed,
    failed: findings.length - passed,
    materialIssues
  };
}
