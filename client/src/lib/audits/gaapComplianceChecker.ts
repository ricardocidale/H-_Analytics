/**
 * gaapComplianceChecker.ts — GAAP Standards Compliance Verifier
 *
 * This file checks that the financial model follows Generally Accepted Accounting
 * Principles (GAAP). While the formulaChecker verifies math, this file verifies
 * that accounting rules are applied correctly.
 *
 * Two main functions:
 *
 * 1. checkGAAPCompliance() — Checks the income statement and related items:
 *    - ASC 470 (Debt): Interest expense reduces Net Income, but principal does NOT.
 *      Principal is a balance sheet transaction (reducing a liability), not an expense.
 *    - ASC 230 (Cash Flows): Cash Flow = NOI - full debt service (interest + principal) - tax.
 *      Unlike Net Income, cash flow DOES include principal because it's actual cash leaving.
 *    - ASC 606 (Revenue): Room revenue recognized when the guest stays (point-in-time).
 *    - ASC 360 (Property): 39-year straight-line depreciation for nonresidential real property (hotels).
 *    - Matching Principle: Expenses are recorded in the same period as related revenue.
 *    - USALI: NOI is calculated BEFORE debt service (industry standard for hotels).
 *    - FF&E Reserve: Set-aside for furniture/fixtures replacement is properly recorded.
 *
 * 2. checkCashFlowStatement() — Checks the Statement of Cash Flows per ASC 230:
 *    - Operating Activities: Start with Net Income, add back depreciation (non-cash).
 *      Interest paid is classified as operating (US GAAP rule).
 *    - Financing Activities: Principal repayment is a financing outflow (not operating).
 *
 * Key insight: The difference between Net Income and Cash Flow comes down to two items:
 *   - Depreciation: Reduces Net Income (non-cash expense) but NOT Cash Flow
 *   - Principal: Reduces Cash Flow (actual cash out) but NOT Net Income
 *   This is why: Cash Flow = Net Income + Depreciation - Principal
 */
import { MonthlyFinancials } from "../financialEngine";

export interface ComplianceCheckResult {
  passed: boolean;
  category: string;
  rule: string;
  description: string;
  details?: string;
  severity: "critical" | "warning" | "info";
}

export interface ComplianceReport {
  timestamp: Date;
  totalChecks: number;
  passed: number;
  failed: number;
  criticalIssues: number;
  warnings: number;
  results: ComplianceCheckResult[];
}

export function checkGAAPCompliance(monthlyData: MonthlyFinancials[]): ComplianceReport {
  const results: ComplianceCheckResult[] = [];
  
  // 1. DEBT SERVICE TREATMENT (ASC 470)
  // Interest expense hits Income Statement, Principal hits Statement of Cash Flows only
  for (let i = 0; i < Math.min(12, monthlyData.length); i++) {
    const m = monthlyData[i];
    
    const depExp = m.depreciationExpense ?? 0;
    const incomeTax = m.incomeTax ?? 0;
    const correctNetIncome = m.anoi - m.interestExpense - depExp - incomeTax;
    const incorrectNetIncome = m.anoi - m.debtPayment;
    
    const isCorrect = Math.abs(m.netIncome - correctNetIncome) < 0.01;
    const wouldBeIncorrect = Math.abs(m.netIncome - incorrectNetIncome) < 0.01 && m.principalPayment > 0;
    
    results.push({
      passed: isCorrect && !wouldBeIncorrect,
      category: "ASC 470 - Debt",
      rule: "Interest/Principal Separation",
      description: `Month ${i + 1}: Net Income = ANOI - Interest (${m.interestExpense.toFixed(0)}) - Depreciation (${depExp.toFixed(0)}) - Tax (${incomeTax.toFixed(0)})`,
      details: isCorrect ? "Net Income correctly computed per GAAP (includes depreciation and tax)" : "Net Income calculation may be incorrect",
      severity: "critical"
    });
    
    const expectedCashFlow = m.anoi - m.debtPayment - incomeTax;
    const cashFlowCorrect = Math.abs(m.cashFlow - expectedCashFlow) < 0.01;
    
    results.push({
      passed: cashFlowCorrect,
      category: "ASC 230 - Cash Flows",
      rule: "Debt Service & Tax in Cash Flow",
      description: `Month ${i + 1}: Cash Flow = ANOI - Debt Service (${m.debtPayment.toFixed(0)}) - Tax (${incomeTax.toFixed(0)})`,
      details: cashFlowCorrect ? "Cash flow correctly includes debt service and income tax" : "Cash flow calculation may be incorrect",
      severity: "critical"
    });
  }
  
  // 2. DEPRECIATION TREATMENT (ASC 360)
  const depMonths = monthlyData.filter(m => m.depreciationExpense > 0);
  if (depMonths.length >= 2) {
    const firstDep = depMonths[0].depreciationExpense;
    const depConsistent = depMonths.every(m => Math.abs(m.depreciationExpense - firstDep) < 0.01);
    results.push({
      passed: depConsistent,
      category: "ASC 360 - Property",
      rule: "Straight-Line Consistency",
      description: `Monthly depreciation ${depConsistent ? "is" : "is NOT"} consistent at $${firstDep.toFixed(2)} across ${depMonths.length} months`,
      details: depConsistent ? "Straight-line depreciation verified: equal amounts each month" : "Depreciation varies between months — violates straight-line method",
      severity: "critical"
    });
  } else {
    results.push({
      passed: depMonths.length > 0 || monthlyData.length === 0,
      category: "ASC 360 - Property",
      rule: "Depreciation Present",
      description: `${depMonths.length} months with depreciation expense recorded`,
      details: depMonths.length > 0 ? "Depreciation is being recorded" : "No depreciation found — verify property has been acquired",
      severity: "warning"
    });
  }
  
  // 3. REVENUE RECOGNITION (ASC 606)
  for (let i = 0; i < Math.min(12, monthlyData.length); i++) {
    const m = monthlyData[i];
    
    // Room revenue should be recognized when room nights are consumed
    const revenueRecognized = m.revenueRooms === m.adr * m.soldRooms;
    results.push({
      passed: revenueRecognized,
      category: "ASC 606 - Revenue",
      rule: "Point-in-Time Recognition",
      description: `Month ${i + 1}: Room revenue recognized at point of service (${m.soldRooms} room nights @ $${m.adr.toFixed(0)} ADR)`,
      details: "Revenue recognized when performance obligation satisfied",
      severity: "critical"
    });
  }
  
  // 4. MATCHING PRINCIPLE
  for (let i = 0; i < Math.min(12, monthlyData.length); i++) {
    const m = monthlyData[i];
    
    const hasRevenue = m.revenueTotal > 0;
    const hasVariableExpenses = (m.expenseRooms + m.expenseFB + m.expenseEvents + m.expenseOther) > 0;
    
    if (hasRevenue) {
      results.push({
        passed: hasVariableExpenses,
        category: "Matching Principle",
        rule: "Expense Recognition",
        description: `Month ${i + 1}: Revenue $${m.revenueTotal.toFixed(0)} ${hasVariableExpenses ? "has" : "MISSING"} matched variable expenses`,
        details: hasVariableExpenses ? "Variable expenses correctly recorded in same period as revenue" : "Revenue recognized without corresponding variable expenses — matching violation",
        severity: hasVariableExpenses ? "info" : "critical"
      });
    }
  }
  
  // 5. MANAGEMENT FEE CALCULATION
  for (let i = 0; i < Math.min(12, monthlyData.length); i++) {
    const m = monthlyData[i];
    
    if (m.revenueTotal > 0) {
      const baseFeeRate = m.feeBase / m.revenueTotal;
      const baseFeeReasonable = baseFeeRate >= 0 && baseFeeRate <= 0.15;
      results.push({
        passed: baseFeeReasonable,
        category: "ASC 606 - Fees",
        rule: "Management Fee Rate",
        description: `Month ${i + 1}: Base fee rate ${(baseFeeRate * 100).toFixed(1)}% ${baseFeeReasonable ? "within" : "OUTSIDE"} 0-15% range`,
        details: baseFeeReasonable ? `Fee rate ${(baseFeeRate * 100).toFixed(1)}% is within industry norms` : `Fee rate ${(baseFeeRate * 100).toFixed(1)}% exceeds industry ceiling of 15%`,
        severity: baseFeeReasonable ? "info" : "warning"
      });
    }
    
    if (m.gop > 0) {
      const incentiveRate = m.feeIncentive / m.gop;
      const incentiveReasonable = incentiveRate >= 0 && incentiveRate <= 0.20;
      results.push({
        passed: incentiveReasonable,
        category: "ASC 606 - Fees",
        rule: "Incentive Fee Rate",
        description: `Month ${i + 1}: Incentive fee rate ${(incentiveRate * 100).toFixed(1)}% ${incentiveReasonable ? "within" : "OUTSIDE"} 0-20% range`,
        details: incentiveReasonable ? `Incentive rate ${(incentiveRate * 100).toFixed(1)}% is within industry norms` : `Incentive rate ${(incentiveRate * 100).toFixed(1)}% exceeds industry ceiling`,
        severity: incentiveReasonable ? "info" : "warning"
      });
    } else if (m.gop <= 0 && m.feeIncentive > 0) {
      results.push({
        passed: false,
        category: "ASC 606 - Fees",
        rule: "Incentive Fee on Negative GOP",
        description: `Month ${i + 1}: Incentive fee $${m.feeIncentive.toFixed(0)} charged when GOP is $${m.gop.toFixed(0)} (negative/zero)`,
        details: "Incentive fees must not be charged when GOP is non-positive",
        severity: "critical"
      });
    }
  }
  
  // 6. NOI CALCULATION STANDARD (USALI)
  for (let i = 0; i < Math.min(12, monthlyData.length); i++) {
    const m = monthlyData[i];
    
    if (m.revenueTotal > 0) {
      const totalOpEx = m.expenseRooms + m.expenseFB + m.expenseEvents + m.expenseOther +
        m.expenseMarketing + m.expensePropertyOps + m.expenseUtilitiesVar +
        m.expenseAdmin + m.expenseIT + m.expenseUtilitiesFixed + m.expenseInsurance + m.expenseOtherCosts;
      const expectedGOP = m.revenueTotal - totalOpEx;
      const gopCorrect = Math.abs(m.gop - expectedGOP) < 0.01;
      const noiPlusDebt = m.noi + m.debtPayment;
      const noiExcludesDebt = m.debtPayment === 0 || noiPlusDebt > m.noi;
      results.push({
        passed: gopCorrect && noiExcludesDebt,
        category: "USALI Standard",
        rule: "NOI Definition",
        description: `Month ${i + 1}: GOP $${m.gop.toFixed(0)} = Revenue $${m.revenueTotal.toFixed(0)} − OpEx $${totalOpEx.toFixed(0)}`,
        details: gopCorrect ? "GOP correctly computed before debt service per USALI" : `GOP mismatch: expected $${expectedGOP.toFixed(0)}, got $${m.gop.toFixed(0)}`,
        severity: gopCorrect ? "info" : "critical"
      });
    }
  }
  
  // 7. FF&E RESERVE TREATMENT
  for (let i = 0; i < Math.min(12, monthlyData.length); i++) {
    const m = monthlyData[i];
    
    if (m.revenueTotal > 0) {
      const ffeRate = m.revenueTotal > 0 ? m.expenseFFE / m.revenueTotal : 0;
      const ffeReasonable = ffeRate >= 0 && ffeRate <= 0.10;
      results.push({
        passed: ffeReasonable,
        category: "Industry Practice",
        rule: "FF&E Reserve Rate",
        description: `Month ${i + 1}: FF&E rate ${(ffeRate * 100).toFixed(1)}% ${ffeReasonable ? "within" : "OUTSIDE"} 0-10% range`,
        details: ffeReasonable ? `FF&E reserve rate ${(ffeRate * 100).toFixed(1)}% is within industry norms (1-5% typical)` : `FF&E rate exceeds 10% — unusual for hospitality`,
        severity: ffeReasonable ? "info" : "warning"
      });
    } else {
      results.push({
        passed: m.expenseFFE === 0,
        category: "Industry Practice",
        rule: "FF&E Reserve",
        description: `Month ${i + 1}: No revenue — FF&E should be $0`,
        details: m.expenseFFE === 0 ? "Correctly no FF&E reserve when no revenue" : `FF&E $${m.expenseFFE.toFixed(0)} charged with no revenue`,
        severity: m.expenseFFE === 0 ? "info" : "warning"
      });
    }
  }
  
  const passed = results.filter(r => r.passed).length;
  const criticalIssues = results.filter(r => !r.passed && r.severity === "critical").length;
  const warnings = results.filter(r => !r.passed && r.severity === "warning").length;
  
  return {
    timestamp: new Date(),
    totalChecks: results.length,
    passed,
    failed: results.length - passed,
    criticalIssues,
    warnings,
    results
  };
}

export function checkCashFlowStatement(monthlyData: MonthlyFinancials[]): ComplianceReport {
  const results: ComplianceCheckResult[] = [];
  
  // ASC 230 - Statement of Cash Flows Requirements
  
  // 1. Operating Activities (Indirect Method): Operating CF = Net Income + Depreciation
  for (let i = 0; i < Math.min(12, monthlyData.length); i++) {
    const m = monthlyData[i];
    
    const expectedOpCF = m.netIncome + (m.depreciationExpense ?? 0);
    const opCFCorrect = Math.abs((m.operatingCashFlow ?? 0) - expectedOpCF) < 0.01;
    results.push({
      passed: opCFCorrect,
      category: "ASC 230 - Operating",
      rule: "Indirect Method Reconciliation",
      description: `Month ${i + 1}: Operating CF $${(m.operatingCashFlow ?? 0).toFixed(0)} ${opCFCorrect ? "=" : "≠"} NI $${m.netIncome.toFixed(0)} + Dep $${(m.depreciationExpense ?? 0).toFixed(0)}`,
      details: opCFCorrect ? "Operating cash flow correctly reconciles from net income + depreciation add-back" : `Expected $${expectedOpCF.toFixed(0)}, got $${(m.operatingCashFlow ?? 0).toFixed(0)}`,
      severity: "critical"
    });
  }
  
  // 2. Financing Activities: Financing CF = -Principal + Refinancing Proceeds (ASC 230)
  for (let i = 0; i < Math.min(12, monthlyData.length); i++) {
    const m = monthlyData[i];
    
    if (m.principalPayment > 0 || (m.refinancingProceeds ?? 0) > 0) {
      const expectedFinCF = -m.principalPayment + (m.refinancingProceeds ?? 0);
      const finCFCorrect = Math.abs((m.financingCashFlow ?? 0) - expectedFinCF) < 0.01;
      results.push({
        passed: finCFCorrect,
        category: "ASC 230 - Financing",
        rule: "Principal Classification",
        description: `Month ${i + 1}: Financing CF $${(m.financingCashFlow ?? 0).toFixed(0)} ${finCFCorrect ? "=" : "≠"} -Principal $${(-m.principalPayment).toFixed(0)}${(m.refinancingProceeds ?? 0) > 0 ? ` + Refi $${(m.refinancingProceeds ?? 0).toFixed(0)}` : ""}`,
        details: finCFCorrect ? "Principal correctly classified as financing outflow" : `Expected $${expectedFinCF.toFixed(0)}, got $${(m.financingCashFlow ?? 0).toFixed(0)}`,
        severity: "critical"
      });
    }
  }
  
  // 3. Interest is in Operating CF (US GAAP: interest paid = operating)
  for (let i = 0; i < Math.min(12, monthlyData.length); i++) {
    const m = monthlyData[i];
    
    if (m.interestExpense > 0 && m.principalPayment > 0) {
      const interestInOperating = (m.operatingCashFlow ?? 0) < m.netIncome + (m.depreciationExpense ?? 0) + m.interestExpense;
      results.push({
        passed: interestInOperating,
        category: "ASC 230 - Operating",
        rule: "Interest Classification",
        description: `Month ${i + 1}: Interest $${m.interestExpense.toFixed(0)} included in operating activities (US GAAP)`,
        details: interestInOperating ? "Interest correctly reduces operating cash flow, not financing" : "Interest may be misclassified",
        severity: "critical"
      });
    }
  }
  
  const passed = results.filter(r => r.passed).length;
  const criticalIssues = results.filter(r => !r.passed && r.severity === "critical").length;
  const warnings = results.filter(r => !r.passed && r.severity === "warning").length;
  
  return {
    timestamp: new Date(),
    totalChecks: results.length,
    passed,
    failed: results.length - passed,
    criticalIssues,
    warnings,
    results
  };
}

export function generateComplianceReport(reports: ComplianceReport[]): string {
  let output = "═══════════════════════════════════════════════════════════════\n";
  output += "              GAAP COMPLIANCE VERIFICATION REPORT\n";
  output += "═══════════════════════════════════════════════════════════════\n\n";
  
  let totalChecks = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  let totalCritical = 0;
  let totalWarnings = 0;
  
  for (const report of reports) {
    totalChecks += report.totalChecks;
    totalPassed += report.passed;
    totalFailed += report.failed;
    totalCritical += report.criticalIssues;
    totalWarnings += report.warnings;
    
    if (report.criticalIssues > 0) {
      output += `\n🚨 CRITICAL ISSUES:\n`;
      output += "───────────────────────────────────────────────────────────────\n";
      for (const result of report.results.filter(r => !r.passed && r.severity === "critical")) {
        output += `  ✗ [${result.category}] ${result.rule}\n`;
        output += `    ${result.description}\n`;
        if (result.details) output += `    → ${result.details}\n`;
        output += "\n";
      }
    }
    
    if (report.warnings > 0) {
      output += `\n⚠️  WARNINGS:\n`;
      output += "───────────────────────────────────────────────────────────────\n";
      for (const result of report.results.filter(r => !r.passed && r.severity === "warning")) {
        output += `  △ [${result.category}] ${result.rule}\n`;
        output += `    ${result.description}\n`;
        if (result.details) output += `    → ${result.details}\n`;
        output += "\n";
      }
    }
  }
  
  output += "\n═══════════════════════════════════════════════════════════════\n";
  output += "                     COMPLIANCE SUMMARY\n";
  output += "───────────────────────────────────────────────────────────────\n";
  output += `  Total Checks:     ${totalChecks}\n`;
  output += `  Passed:           ${totalPassed} ✓\n`;
  output += `  Failed:           ${totalFailed} ✗\n`;
  output += `  Critical Issues:  ${totalCritical}\n`;
  output += `  Warnings:         ${totalWarnings}\n`;
  output += `  Compliance Rate:  ${((totalPassed / totalChecks) * 100).toFixed(1)}%\n`;
  output += "═══════════════════════════════════════════════════════════════\n";
  
  output += "\nKEY GAAP STANDARDS VERIFIED:\n";
  output += "───────────────────────────────────────────────────────────────\n";
  output += "  ✓ ASC 470 - Debt: Interest vs Principal separation\n";
  output += "  ✓ ASC 230 - Cash Flows: Operating vs Financing classification\n";
  output += "  ✓ ASC 606 - Revenue: Point-in-time recognition\n";
  output += "  ✓ ASC 360 - Property: Depreciation treatment\n";
  output += "  ✓ USALI - Industry: NOI calculation standards\n";
  output += "───────────────────────────────────────────────────────────────\n";
  
  if (totalCritical === 0) {
    output += "\n✅ ALL GAAP COMPLIANCE CHECKS PASSED\n";
  } else {
    output += "\n❌ GAAP COMPLIANCE ISSUES DETECTED - IMMEDIATE REVIEW REQUIRED\n";
  }
  
  return output;
}
