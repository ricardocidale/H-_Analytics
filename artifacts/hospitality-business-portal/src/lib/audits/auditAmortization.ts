import { MonthlyFinancials } from "../financialEngine";
import { differenceInMonths, startOfMonth } from "date-fns";
import {
  DEFAULT_LTV,
  DEFAULT_INTEREST_RATE,
  DEFAULT_TERM_YEARS,
  MONTHS_PER_YEAR,
} from '../constants';
import { pmt } from "@calc/shared/pmt";
import type { AuditFinding, AuditSection, PropertyAuditInput, GlobalAuditInput } from "./types";
import { parseLocalDate, withinTolerance, formatVariance, AUDIT_SAMPLE_MONTHS } from "./helpers";

export function auditLoanAmortization(
  property: PropertyAuditInput,
  global: GlobalAuditInput,
  monthlyData: MonthlyFinancials[]
): AuditSection {
  const findings: AuditFinding[] = [];
  
  if (property.type !== "Financed" && !(property.willRefinance === "Yes" && property.refinanceDate)) {
    findings.push({
      category: "Loan Amortization",
      rule: "All-Cash Acquisition",
      gaapReference: "N/A",
      severity: "info",
      passed: true,
      expected: "No debt",
      actual: "All-cash transaction",
      variance: "N/A",
      recommendation: "Property acquired without financing - no debt service to audit",
      workpaperRef: "WP-LOAN-001"
    });
    return { name: "Loan Amortization Audit", description: "Verify loan payment calculations", findings, passed: 1, failed: 0, materialIssues: 0 };
  }
  
  const isOriginallyFinanced = property.type === "Financed";
  const totalInvestment = property.purchasePrice + property.buildingImprovements;
  const ltv = property.acquisitionLTV || DEFAULT_LTV;
  const loanAmount = isOriginallyFinanced ? totalInvestment * ltv : 0;
  const interestRate = property.acquisitionInterestRate ?? property.debtAssumptions?.interestRate ?? DEFAULT_INTEREST_RATE;
  const termYears = property.acquisitionTermYears ?? property.debtAssumptions?.amortizationYears ?? DEFAULT_TERM_YEARS;
  let currentMonthlyRate = isOriginallyFinanced ? interestRate / MONTHS_PER_YEAR : 0;
  let currentTotalPayments = isOriginallyFinanced ? termYears * MONTHS_PER_YEAR : 0;

  let currentMonthlyPayment = pmt(loanAmount, currentMonthlyRate, currentTotalPayments);

  if (isOriginallyFinanced) {
    findings.push({
      category: "Loan Amortization",
      rule: "PMT Formula Verification",
      gaapReference: "Standard Amortization",
      severity: "critical",
      passed: true,
      expected: `Loan: $${loanAmount.toLocaleString()} @ ${(interestRate * 100).toFixed(2)}% for ${termYears} yrs`,
      actual: `Monthly Payment: $${currentMonthlyPayment.toFixed(2)}`,
      variance: "N/A",
      recommendation: "Verify PMT = P × r × (1+r)^n / ((1+r)^n - 1)",
      workpaperRef: "WP-LOAN-002"
    });
  } else {
    findings.push({
      category: "Loan Amortization",
      rule: "Full Equity with Refinance",
      gaapReference: "ASC 470",
      severity: "info",
      passed: true,
      expected: "No original debt",
      actual: "Debt begins at refinance date",
      variance: "N/A",
      recommendation: "Full equity acquisition - debt service validated from refinance date forward",
      workpaperRef: "WP-LOAN-001"
    });
  }

  const modelStart = startOfMonth(parseLocalDate(global.modelStartDate));
  const acquisitionDate = startOfMonth(parseLocalDate(property.acquisitionDate || property.operationsStartDate));
  const acqMonthIndex = Math.max(0, differenceInMonths(acquisitionDate, modelStart));

  let refiMonthIndex = -1;
  if (property.willRefinance === "Yes" && property.refinanceDate) {
    const refiDate = startOfMonth(parseLocalDate(property.refinanceDate));
    refiMonthIndex = (refiDate.getFullYear() - modelStart.getFullYear()) * MONTHS_PER_YEAR +
                     (refiDate.getMonth() - modelStart.getMonth());
  }

  let runningBalance = loanAmount;
  let _totalInterestPaid = 0;
  let _totalPrincipalPaid = 0;
  let refinanced = false;

  for (let i = 0; i < acqMonthIndex && i < monthlyData.length; i++) {
    const m = monthlyData[i];
    if (m.debtPayment !== 0 || m.interestExpense !== 0 || m.principalPayment !== 0) {
      findings.push({
        category: "Loan Amortization",
        rule: "Pre-Acquisition Debt Service",
        gaapReference: "ASC 470",
        severity: "critical",
        passed: false,
        expected: 0,
        actual: m.debtPayment,
        variance: formatVariance(0, m.debtPayment),
        recommendation: `Month ${i + 1}: Debt service recorded before acquisition date`,
        workpaperRef: `WP-LOAN-003-M${i + 1}`
      });
    }
  }

  const startMonth = (!isOriginallyFinanced && refiMonthIndex >= 0)
    ? refiMonthIndex
    : Math.max(0, acqMonthIndex);
  for (let i = startMonth; i < Math.min(startMonth + AUDIT_SAMPLE_MONTHS, monthlyData.length); i++) {
    const m = monthlyData[i];

    if (!refinanced && refiMonthIndex >= 0 && i >= refiMonthIndex) {
      refinanced = true;
      const refiLoanAmount = monthlyData[refiMonthIndex].debtOutstanding + monthlyData[refiMonthIndex].principalPayment;
      const refiRate = property.refinanceInterestRate ?? DEFAULT_INTEREST_RATE;
      const refiTermYears = property.refinanceTermYears ?? DEFAULT_TERM_YEARS;
      currentMonthlyRate = refiRate / MONTHS_PER_YEAR;
      currentTotalPayments = refiTermYears * MONTHS_PER_YEAR;
      currentMonthlyPayment = pmt(refiLoanAmount, currentMonthlyRate, currentTotalPayments);
      runningBalance = refiLoanAmount;

      findings.push({
        category: "Loan Amortization",
        rule: "Refinance Event",
        gaapReference: "ASC 470",
        severity: "info",
        passed: true,
        expected: `New Loan: $${refiLoanAmount.toLocaleString()} @ ${(refiRate * 100).toFixed(2)}% for ${refiTermYears} yrs`,
        actual: `New Payment: $${currentMonthlyPayment.toFixed(2)}`,
        variance: "N/A",
        recommendation: `Month ${refiMonthIndex + 1}: Refinance detected - switching to new loan parameters`,
        workpaperRef: "WP-LOAN-REFI"
      });
    }

    const expectedInterest = runningBalance * currentMonthlyRate;
    const expectedPrincipal = currentMonthlyPayment - expectedInterest;
    const expectedDebtService = currentMonthlyPayment;

    const interestMatch = withinTolerance(expectedInterest, m.interestExpense);
    const principalMatch = withinTolerance(expectedPrincipal, m.principalPayment);
    const totalMatch = withinTolerance(expectedDebtService, m.debtPayment);

    if (!interestMatch) {
      findings.push({
        category: "Loan Amortization",
        rule: "Interest Calculation",
        gaapReference: "ASC 835-30",
        severity: "material",
        passed: false,
        expected: expectedInterest.toFixed(2),
        actual: m.interestExpense.toFixed(2),
        variance: formatVariance(expectedInterest, m.interestExpense),
        recommendation: `Month ${i + 1}: Interest = Balance × Monthly Rate (${runningBalance.toFixed(2)} × ${currentMonthlyRate.toFixed(6)})`,
        workpaperRef: `WP-LOAN-INT-M${i + 1}`
      });
    }

    if (!principalMatch) {
      findings.push({
        category: "Loan Amortization",
        rule: "Principal Calculation",
        gaapReference: "ASC 470",
        severity: "material",
        passed: false,
        expected: expectedPrincipal.toFixed(2),
        actual: m.principalPayment.toFixed(2),
        variance: formatVariance(expectedPrincipal, m.principalPayment),
        recommendation: `Month ${i + 1}: Principal = Payment - Interest`,
        workpaperRef: `WP-LOAN-PRIN-M${i + 1}`
      });
    }

    if (!totalMatch) {
      findings.push({
        category: "Loan Amortization",
        rule: "Total Debt Service",
        gaapReference: "ASC 470",
        severity: "material",
        passed: false,
        expected: expectedDebtService.toFixed(2),
        actual: m.debtPayment.toFixed(2),
        variance: formatVariance(expectedDebtService, m.debtPayment),
        recommendation: `Month ${i + 1}: Debt Service = Interest + Principal`,
        workpaperRef: `WP-LOAN-DS-M${i + 1}`
      });
    }

    if (interestMatch && principalMatch && totalMatch && i < startMonth + 3) {
      findings.push({
        category: "Loan Amortization",
        rule: "Payment Verification",
        gaapReference: "ASC 470 / ASC 835-30",
        severity: "info",
        passed: true,
        expected: expectedDebtService.toFixed(2),
        actual: m.debtPayment.toFixed(2),
        variance: "Within tolerance",
        recommendation: `Month ${i + 1}: All debt service components verified`,
        workpaperRef: `WP-LOAN-OK-M${i + 1}`
      });
    }

    runningBalance -= expectedPrincipal;
    if (m.debtOutstanding !== undefined && m.debtOutstanding > 0) {
      runningBalance = m.debtOutstanding;
    }
    _totalInterestPaid += expectedInterest;
    _totalPrincipalPaid += expectedPrincipal;
  }
  
  const passed = findings.filter(f => f.passed).length;
  const materialIssues = findings.filter(f => !f.passed && (f.severity === "critical" || f.severity === "material")).length;
  
  return {
    name: "Loan Amortization Audit",
    description: "Verify PMT formula, interest/principal split, and amortization schedule",
    findings,
    passed,
    failed: findings.length - passed,
    materialIssues
  };
}
