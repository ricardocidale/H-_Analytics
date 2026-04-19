import { MonthlyFinancials } from "../financialEngine";
import { addMonths, isBefore, startOfMonth } from "date-fns";
import { DEFAULT_PROPERTY_INCOME_TAX_RATE } from '../constants';
import { NOL_UTILIZATION_CAP } from '@shared/constants';
import type { AuditFinding, AuditSection, PropertyAuditInput, GlobalAuditInput } from "./types";
import { parseLocalDate, withinTolerance, formatVariance } from "./helpers";

export function auditIncomeStatement(
  property: PropertyAuditInput,
  global: GlobalAuditInput,
  monthlyData: MonthlyFinancials[]
): AuditSection {
  const findings: AuditFinding[] = [];
  
  const modelStart = startOfMonth(parseLocalDate(global.modelStartDate));
  const opsStart = startOfMonth(parseLocalDate(property.operationsStartDate));
  let opsMonthsChecked = 0;
  let auditNolBalance = 0;

  for (let i = 0; i < monthlyData.length; i++) {
    const m = monthlyData[i];
    const currentDate = addMonths(modelStart, i);
    const isOperational = !isBefore(currentDate, opsStart);

    if (!isOperational) {
      const preOpDepExp = m.depreciationExpense || 0;
      const preOpTaxable = (m.anoi || 0) - (m.interestExpense || 0) - preOpDepExp;
      if (preOpTaxable < 0) {
        auditNolBalance += Math.abs(preOpTaxable);
      }
      continue;
    }

    const expectedRoomRevenue = m.adr * m.soldRooms;
    const revenueMatch = withinTolerance(expectedRoomRevenue, m.revenueRooms);
    
    if (!revenueMatch) {
      findings.push({
        category: "Income Statement",
        rule: "Room Revenue Calculation",
        gaapReference: "ASC 606",
        severity: "critical",
        passed: false,
        expected: expectedRoomRevenue.toFixed(2),
        actual: m.revenueRooms.toFixed(2),
        variance: formatVariance(expectedRoomRevenue, m.revenueRooms),
        recommendation: `Month ${i + 1}: Room Revenue = ADR × Sold Rooms (${m.adr.toFixed(2)} × ${m.soldRooms})`,
        workpaperRef: `WP-IS-REV-M${i + 1}`
      });
    }
    
    const expectedSoldRooms = Math.round(m.availableRooms * m.occupancy);
    const soldRoomsMatch = Math.abs(expectedSoldRooms - m.soldRooms) <= 1;
    
    if (!soldRoomsMatch) {
      findings.push({
        category: "Income Statement",
        rule: "Sold Rooms Calculation",
        gaapReference: "USALI",
        severity: "material",
        passed: false,
        expected: expectedSoldRooms,
        actual: m.soldRooms,
        variance: formatVariance(expectedSoldRooms, m.soldRooms),
        recommendation: `Month ${i + 1}: Sold Rooms = Available × Occupancy`,
        workpaperRef: `WP-IS-SOLD-M${i + 1}`
      });
    }
    
    const expectedTotalRevenue = m.revenueRooms + m.revenueFB + m.revenueEvents + m.revenueOther;
    const totalRevMatch = withinTolerance(expectedTotalRevenue, m.revenueTotal);
    
    if (!totalRevMatch) {
      findings.push({
        category: "Income Statement",
        rule: "Total Revenue Calculation",
        gaapReference: "ASC 606",
        severity: "critical",
        passed: false,
        expected: expectedTotalRevenue.toFixed(2),
        actual: m.revenueTotal.toFixed(2),
        variance: formatVariance(expectedTotalRevenue, m.revenueTotal),
        recommendation: `Month ${i + 1}: Total Revenue = Sum of all revenue streams`,
        workpaperRef: `WP-IS-TREV-M${i + 1}`
      });
    }
    
    const totalDeptExpenses = m.expenseRooms + m.expenseFB + m.expenseEvents + m.expenseOther;
    const totalUndistExpenses = m.expenseMarketing + m.expensePropertyOps + m.expenseUtilitiesVar + 
                                m.expenseAdmin + m.expenseIT + 
                                m.expenseUtilitiesFixed + m.expenseInsurance + m.expenseOtherCosts;
    const expectedGOP = m.revenueTotal - totalDeptExpenses - totalUndistExpenses;
    const gopMatch = withinTolerance(expectedGOP, m.gop);
    
    if (!gopMatch) {
      findings.push({
        category: "Income Statement",
        rule: "GOP Calculation",
        gaapReference: "USALI",
        severity: "critical",
        passed: false,
        expected: expectedGOP.toFixed(2),
        actual: m.gop.toFixed(2),
        variance: formatVariance(expectedGOP, m.gop),
        recommendation: `Month ${i + 1}: GOP = Revenue - Department Expenses - Undistributed Expenses`,
        workpaperRef: `WP-IS-GOP-M${i + 1}`
      });
    }
    
    const expectedAGOP = m.gop - m.feeBase - m.feeIncentive;
    const agopMatch = withinTolerance(expectedAGOP, m.agop);
    if (!agopMatch) {
      findings.push({
        category: "Income Statement",
        rule: "AGOP Calculation",
        gaapReference: "USALI",
        severity: "critical",
        passed: false,
        expected: expectedAGOP.toFixed(2),
        actual: m.agop.toFixed(2),
        variance: formatVariance(expectedAGOP, m.agop),
        recommendation: `Month ${i + 1}: AGOP = GOP - Management Fees`,
        workpaperRef: `WP-IS-AGOP-M${i + 1}`
      });
    }

    const expectedNOI = m.agop - m.expenseTaxes;
    const noiMatch = withinTolerance(expectedNOI, m.noi);
    if (!noiMatch) {
      findings.push({
        category: "Income Statement",
        rule: "NOI Calculation",
        gaapReference: "USALI",
        severity: "critical",
        passed: false,
        expected: expectedNOI.toFixed(2),
        actual: m.noi.toFixed(2),
        variance: formatVariance(expectedNOI, m.noi),
        recommendation: `Month ${i + 1}: NOI = AGOP - Property Taxes`,
        workpaperRef: `WP-IS-NOI-M${i + 1}`
      });
    }

    const expectedANOI = m.noi - m.expenseFFE;
    const anoiMatch = withinTolerance(expectedANOI, m.anoi);
    if (!anoiMatch) {
      findings.push({
        category: "Income Statement",
        rule: "ANOI Calculation",
        gaapReference: "USALI",
        severity: "critical",
        passed: false,
        expected: expectedANOI.toFixed(2),
        actual: m.anoi.toFixed(2),
        variance: formatVariance(expectedANOI, m.anoi),
        recommendation: `Month ${i + 1}: ANOI = NOI - FF&E Reserve`,
        workpaperRef: `WP-IS-ANOI-M${i + 1}`
      });
    }
    
    const depExp = m.depreciationExpense || 0;
    const taxableForAudit = m.anoi - m.interestExpense - depExp;
    const taxRate = property.taxRate ?? DEFAULT_PROPERTY_INCOME_TAX_RATE;
    let expectedTax: number;
    if (taxableForAudit < 0) {
      auditNolBalance += Math.abs(taxableForAudit);
      expectedTax = 0;
    } else if (auditNolBalance > 0) {
      const maxUtil = taxableForAudit * NOL_UTILIZATION_CAP;
      const nolUsed = Math.min(auditNolBalance, maxUtil);
      auditNolBalance -= nolUsed;
      expectedTax = (taxableForAudit - nolUsed) > 0 ? (taxableForAudit - nolUsed) * taxRate : 0;
    } else {
      expectedTax = taxableForAudit > 0 ? taxableForAudit * taxRate : 0;
    }
    const expectedNetIncome = m.anoi - m.interestExpense - depExp - expectedTax;
    const netIncomeMatch = withinTolerance(expectedNetIncome, m.netIncome);
    
    if (!netIncomeMatch) {
      findings.push({
        category: "Income Statement",
        rule: "Net Income Calculation (GAAP)",
        gaapReference: "ASC 470/ASC 360 - Net Income = NOI - Interest - Depreciation - Tax",
        severity: "critical",
        passed: false,
        expected: expectedNetIncome.toFixed(2),
        actual: m.netIncome.toFixed(2),
        variance: formatVariance(expectedNetIncome, m.netIncome),
        recommendation: `Month ${i + 1}: Net Income = NOI - Interest - Depreciation - Income Tax (GAAP)`,
        workpaperRef: `WP-IS-NI-M${i + 1}`
      });
    }
    
    const incorrectNetIncome = m.anoi - m.debtPayment;
    const principalSignificant = m.principalPayment > 100;
    if (principalSignificant && withinTolerance(incorrectNetIncome, m.netIncome) && !withinTolerance(expectedNetIncome, m.netIncome)) {
      findings.push({
        category: "Income Statement",
        rule: "Principal in Net Income (ERROR)",
        gaapReference: "ASC 470 - Principal is FINANCING, not EXPENSE",
        severity: "critical",
        passed: false,
        expected: "Principal excluded from Net Income",
        actual: "Principal appears to reduce Net Income",
        variance: `Understated by $${m.principalPayment.toFixed(2)}`,
        recommendation: `Month ${i + 1}: GAAP VIOLATION - Principal payments should NOT reduce Net Income`,
        workpaperRef: `WP-IS-GAAP-M${i + 1}`
      });
    }
    
    const expectedCashFlow = m.anoi - m.debtPayment - (m.incomeTax || 0) + (m.refinancingProceeds || 0);
    const cashFlowMatch = withinTolerance(expectedCashFlow, m.cashFlow);
    
    if (!cashFlowMatch) {
      findings.push({
        category: "Cash Flow",
        rule: "Property Cash Flow",
        gaapReference: "ASC 230",
        severity: "material",
        passed: false,
        expected: expectedCashFlow.toFixed(2),
        actual: m.cashFlow.toFixed(2),
        variance: formatVariance(expectedCashFlow, m.cashFlow),
        recommendation: `Month ${i + 1}: Cash Flow = NOI - Total Debt Service (interest + principal)`,
        workpaperRef: `WP-CF-M${i + 1}`
      });
    }
    
    if (opsMonthsChecked < 3 && revenueMatch && totalRevMatch && gopMatch && noiMatch && netIncomeMatch && cashFlowMatch) {
      findings.push({
        category: "Income Statement",
        rule: "Full Verification",
        gaapReference: "ASC 606 / USALI",
        severity: "info",
        passed: true,
        expected: "All formulas correct",
        actual: "All formulas verified",
        variance: "Within tolerance",
        recommendation: `Month ${i + 1}: Revenue, GOP, NOI, Net Income all verified`,
        workpaperRef: `WP-IS-OK-M${i + 1}`
      });
    }
    opsMonthsChecked++;
  }

  if (findings.filter(f => !f.passed).length === 0 && opsMonthsChecked > 0) {
    findings.push({
      category: "Income Statement",
      rule: "Income Statement Reconciliation",
      gaapReference: "ASC 606 / USALI",
      severity: "info",
      passed: true,
      expected: "All income statement formulas verified",
      actual: `${opsMonthsChecked} operational months checked`,
      variance: "N/A",
      recommendation: "Revenue, GOP, NOI, Net Income, and Cash Flow all reconcile",
      workpaperRef: "WP-IS-OK"
    });
  }

  const passed = findings.filter(f => f.passed).length;
  const materialIssues = findings.filter(f => !f.passed && (f.severity === "critical" || f.severity === "material")).length;

  return {
    name: "Income Statement Audit",
    description: "Verify revenue, expenses, GOP, NOI, and Net Income calculations per USALI and GAAP",
    findings,
    passed,
    failed: findings.length - passed,
    materialIssues
  };
}
