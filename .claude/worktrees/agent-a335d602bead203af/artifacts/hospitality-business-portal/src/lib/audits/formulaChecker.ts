/**
 * formulaChecker.ts — Mathematical Relationship Validator
 *
 * This file checks that the basic arithmetic relationships in the financial model
 * are internally consistent. It does NOT recalculate from scratch (that's the
 * auditor's job) — instead, it verifies that the numbers in each month's output
 * satisfy the expected mathematical identities.
 *
 * For every month, it checks 7 formulas:
 *   1. Room Revenue = ADR × Sold Rooms
 *   2. Sold Rooms = Available Rooms × Occupancy
 *   3. Total Revenue = Room + F&B + Events + Other
 *   4. Total Expenses = Operating Expenses + Management Fees + FF&E Reserve
 *   5. GOP (Gross Operating Profit) = Total Revenue - Operating Expenses
 *   6. NOI (Net Operating Income) = GOP - Base Fee - Incentive Fee - FF&E
 *   7. Net Income = NOI - Interest - Depreciation - Tax (GAAP formula)
 *   8. Cash Flow = NOI - Debt Service - Tax + Refinancing Proceeds
 *
 * It also checks yearly metric formulas:
 *   - ADR = Room Revenue ÷ Rooms Sold
 *   - Occupancy = Rooms Sold ÷ Available Room Nights
 *   - RevPAR = Room Revenue ÷ Available Rooms (should equal ADR × Occupancy)
 *
 * All checks use a 0.1% tolerance to account for floating-point rounding.
 *
 * Key terms:
 *   - ADR (Average Daily Rate): What the hotel charges per room per night
 *   - RevPAR (Revenue Per Available Room): The industry's primary performance metric
 *   - FF&E (Furniture, Fixtures & Equipment): Reserve fund for replacing worn-out items
 */
import { MonthlyFinancials } from "../financialEngine";

export interface FormulaCheckResult {
  passed: boolean;
  name: string;
  description: string;
  expected: string;
  actual: string;
}

export interface FormulaCheckReport {
  timestamp: Date;
  totalChecks: number;
  passed: number;
  failed: number;
  results: FormulaCheckResult[];
}

function withinTolerance(expected: number, actual: number, tolerance: number = 0.001): boolean {
  if (expected === 0 && actual === 0) return true;
  if (expected === 0) return Math.abs(actual) < tolerance;
  return Math.abs((expected - actual) / expected) < tolerance;
}

export function checkPropertyFormulas(monthlyData: MonthlyFinancials[]): FormulaCheckReport {
  const results: FormulaCheckResult[] = [];
  
  for (let i = 0; i < monthlyData.length; i++) {
    const m = monthlyData[i];
    const monthLabel = `Month ${i + 1}`;
    
    // 1. Revenue Calculations
    // Room Revenue = ADR * Sold Rooms
    const expectedRoomRevenue = m.adr * m.soldRooms;
    results.push({
      passed: withinTolerance(expectedRoomRevenue, m.revenueRooms),
      name: `${monthLabel}: Room Revenue Formula`,
      description: "Room Revenue = ADR × Sold Rooms",
      expected: expectedRoomRevenue.toFixed(2),
      actual: m.revenueRooms.toFixed(2)
    });
    
    // Sold Rooms = Available Rooms * Occupancy
    const expectedSoldRooms = m.availableRooms * m.occupancy;
    results.push({
      passed: withinTolerance(expectedSoldRooms, m.soldRooms),
      name: `${monthLabel}: Sold Rooms Formula`,
      description: "Sold Rooms = Available Rooms × Occupancy",
      expected: expectedSoldRooms.toFixed(0),
      actual: m.soldRooms.toFixed(0)
    });
    
    // Total Revenue = Room + F&B + Events + Other
    const expectedTotalRevenue = m.revenueRooms + m.revenueFB + m.revenueEvents + m.revenueOther;
    results.push({
      passed: withinTolerance(expectedTotalRevenue, m.revenueTotal),
      name: `${monthLabel}: Total Revenue Formula`,
      description: "Total Revenue = Room + F&B + Events + Other Revenue",
      expected: expectedTotalRevenue.toFixed(2),
      actual: m.revenueTotal.toFixed(2)
    });
    
    // 2. Expense Calculations
    const totalOperatingExpenses = m.expenseRooms + m.expenseFB + m.expenseEvents + 
      m.expenseOther + m.expenseMarketing + m.expensePropertyOps + 
      m.expenseUtilitiesVar + m.expenseAdmin + m.expenseIT + 
      m.expenseUtilitiesFixed + m.expenseInsurance + m.expenseOtherCosts;
    
    const expectedTotalExpenses = totalOperatingExpenses + m.feeBase + m.feeIncentive + m.expenseTaxes + m.expenseFFE;
    results.push({
      passed: withinTolerance(expectedTotalExpenses, m.totalExpenses),
      name: `${monthLabel}: Total Expenses Formula`,
      description: "Total Expenses = Operating Expenses + Management Fees + FF&E Reserve",
      expected: expectedTotalExpenses.toFixed(2),
      actual: m.totalExpenses.toFixed(2)
    });
    
    // 3. GOP = Total Revenue - (Operating Expenses before Mgmt Fees)
    const expectedGOP = m.revenueTotal - totalOperatingExpenses;
    results.push({
      passed: withinTolerance(expectedGOP, m.gop),
      name: `${monthLabel}: GOP Formula`,
      description: "GOP = Total Revenue - Operating Expenses (before mgmt fees)",
      expected: expectedGOP.toFixed(2),
      actual: m.gop.toFixed(2)
    });
    
    // 4. USALI Waterfall: AGOP → NOI → ANOI
    const expectedAGOP = m.gop - m.feeBase - m.feeIncentive;
    results.push({
      passed: withinTolerance(expectedAGOP, m.agop),
      name: `${monthLabel}: AGOP Formula`,
      description: "AGOP = GOP - Base Fee - Incentive Fee",
      expected: expectedAGOP.toFixed(2),
      actual: m.agop.toFixed(2)
    });
    const expectedNOI = m.agop - m.expenseTaxes;
    results.push({
      passed: withinTolerance(expectedNOI, m.noi),
      name: `${monthLabel}: NOI Formula`,
      description: "NOI = AGOP - Property Taxes",
      expected: expectedNOI.toFixed(2),
      actual: m.noi.toFixed(2)
    });
    const expectedANOI = m.noi - m.expenseFFE;
    results.push({
      passed: withinTolerance(expectedANOI, m.anoi),
      name: `${monthLabel}: ANOI Formula`,
      description: "ANOI = NOI - FF&E Reserve",
      expected: expectedANOI.toFixed(2),
      actual: m.anoi.toFixed(2)
    });
    
    // 5. Debt Service = Interest + Principal
    const expectedDebtPayment = m.interestExpense + m.principalPayment;
    results.push({
      passed: withinTolerance(expectedDebtPayment, m.debtPayment),
      name: `${monthLabel}: Debt Service Formula`,
      description: "Debt Service = Interest Expense + Principal Payment",
      expected: expectedDebtPayment.toFixed(2),
      actual: m.debtPayment.toFixed(2)
    });
    
    // 6. Net Income = ANOI - Interest - Depreciation - Tax (GAAP)
    const depExp = m.depreciationExpense ?? 0;
    const incomeTax = m.incomeTax ?? 0;
    const expectedNetIncome = m.anoi - m.interestExpense - depExp - incomeTax;
    results.push({
      passed: withinTolerance(expectedNetIncome, m.netIncome),
      name: `${monthLabel}: Net Income Formula`,
      description: "Net Income = ANOI - Interest - Depreciation - Income Tax (GAAP)",
      expected: expectedNetIncome.toFixed(2),
      actual: m.netIncome.toFixed(2)
    });
    
    // 7. Cash Flow = ANOI - Debt Payment - Tax + Refinancing Proceeds (ASC 230)
    const refiProceeds = m.refinancingProceeds ?? 0;
    const expectedCashFlow = m.anoi - m.debtPayment - incomeTax + refiProceeds;
    results.push({
      passed: withinTolerance(expectedCashFlow, m.cashFlow),
      name: `${monthLabel}: Cash Flow Formula`,
      description: "Cash Flow = NOI - Total Debt Service - Income Tax + Refinancing Proceeds",
      expected: expectedCashFlow.toFixed(2),
      actual: m.cashFlow.toFixed(2)
    });
  }
  
  const passed = results.filter(r => r.passed).length;
  
  return {
    timestamp: new Date(),
    totalChecks: results.length,
    passed,
    failed: results.length - passed,
    results
  };
}

export function checkMetricFormulas(yearlyData: Array<{
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
}>): FormulaCheckReport {
  const results: FormulaCheckResult[] = [];
  
  for (const y of yearlyData) {
    const yearLabel = `Year ${y.year}`;

    // 1. ADR = Room Revenue / Sold Rooms
    const expectedADR = y.soldRooms > 0 ? y.revenueRooms / y.soldRooms : 0;
    results.push({
      passed: withinTolerance(expectedADR, y.adr),
      name: `${yearLabel}: ADR Formula`,
      description: "ADR = Room Revenue ÷ Rooms Sold",
      expected: expectedADR.toFixed(2),
      actual: y.adr.toFixed(2)
    });
    
    // 2. Occupancy = Sold Rooms / Available Rooms
    const expectedOccupancy = y.availableRooms > 0 ? (y.soldRooms / y.availableRooms) * 100 : 0;
    results.push({
      passed: withinTolerance(expectedOccupancy, y.occupancy),
      name: `${yearLabel}: Occupancy Formula`,
      description: "Occupancy = Rooms Sold ÷ Available Room Nights × 100",
      expected: expectedOccupancy.toFixed(1) + "%",
      actual: y.occupancy.toFixed(1) + "%"
    });
    
    // 3. RevPAR = Room Revenue / Available Rooms (or ADR * Occupancy)
    const expectedRevPAR = y.availableRooms > 0 ? y.revenueRooms / y.availableRooms : 0;
    results.push({
      passed: withinTolerance(expectedRevPAR, y.revpar),
      name: `${yearLabel}: RevPAR Formula Consistency`,
      description: "RevPAR = Room Revenue ÷ Available Rooms",
      expected: expectedRevPAR.toFixed(2),
      actual: y.revpar.toFixed(2)
    });

    // 4. USALI Waterfall: GOP -> AGOP -> NOI -> ANOI
    // GOP = Total Revenue - Operating Expenses
    const expectedGOP = y.revenueTotal - y.expenseOperating;
    results.push({
      passed: withinTolerance(expectedGOP, y.gop),
      name: `${yearLabel}: GOP Formula`,
      description: "GOP = Total Revenue - Operating Expenses",
      expected: expectedGOP.toFixed(2),
      actual: y.gop.toFixed(2)
    });

    // AGOP = GOP - Base Fee - Incentive Fee
    const expectedAGOP = y.gop - y.feeBase - y.feeIncentive;
    results.push({
      passed: withinTolerance(expectedAGOP, y.agop),
      name: `${yearLabel}: AGOP Formula`,
      description: "AGOP = GOP - Management Fees",
      expected: expectedAGOP.toFixed(2),
      actual: y.agop.toFixed(2)
    });

    // NOI = AGOP - Taxes
    const expectedNOI = y.agop - y.expenseTaxes;
    results.push({
      passed: withinTolerance(expectedNOI, y.noi),
      name: `${yearLabel}: NOI Formula`,
      description: "NOI = AGOP - Fixed Expenses",
      expected: expectedNOI.toFixed(2),
      actual: y.noi.toFixed(2)
    });

    // ANOI = NOI - FF&E
    const expectedANOI = y.noi - y.expenseFFE;
    results.push({
      passed: withinTolerance(expectedANOI, y.anoi),
      name: `${yearLabel}: ANOI Formula`,
      description: "ANOI = NOI - FF&E Reserve",
      expected: expectedANOI.toFixed(2),
      actual: y.anoi.toFixed(2)
    });

    // 5. Equity Multiple Reasonableness (if available)
    if (y.equityMultiple !== undefined && y.netIncome !== undefined) {
      const isProfitable = y.netIncome > 0;
      if (isProfitable && y.equityMultiple <= 0) {
        results.push({
          passed: false,
          name: `${yearLabel}: Equity Multiple Reasonableness`,
          description: "Equity Multiple must be > 0 for profitable years",
          expected: "> 0",
          actual: y.equityMultiple.toFixed(2)
        });
      } else {
        results.push({
          passed: true,
          name: `${yearLabel}: Equity Multiple Reasonableness`,
          description: "Equity Multiple check passed",
          expected: "Valid",
          actual: y.equityMultiple.toFixed(2)
        });
      }
    }
  }
  
  const passed = results.filter(r => r.passed).length;
  
  return {
    timestamp: new Date(),
    totalChecks: results.length,
    passed,
    failed: results.length - passed,
    results
  };
}

export function generateFormulaReport(reports: FormulaCheckReport[]): string {
  let output = "═══════════════════════════════════════════════════════════════\n";
  output += "                    FORMULA VERIFICATION REPORT\n";
  output += "═══════════════════════════════════════════════════════════════\n\n";
  
  let totalChecks = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  
  for (const report of reports) {
    totalChecks += report.totalChecks;
    totalPassed += report.passed;
    totalFailed += report.failed;
    
    if (report.failed > 0) {
      output += `\n❌ FAILURES DETECTED:\n`;
      output += "───────────────────────────────────────────────────────────────\n";
      for (const result of report.results.filter(r => !r.passed)) {
        output += `  ✗ ${result.name}\n`;
        output += `    ${result.description}\n`;
        output += `    Expected: ${result.expected}  |  Actual: ${result.actual}\n\n`;
      }
    }
  }
  
  output += "\n═══════════════════════════════════════════════════════════════\n";
  output += "                           SUMMARY\n";
  output += "───────────────────────────────────────────────────────────────\n";
  output += `  Total Checks:  ${totalChecks}\n`;
  output += `  Passed:        ${totalPassed} ✓\n`;
  output += `  Failed:        ${totalFailed} ✗\n`;
  output += `  Pass Rate:     ${((totalPassed / totalChecks) * 100).toFixed(1)}%\n`;
  output += "═══════════════════════════════════════════════════════════════\n";
  
  if (totalFailed === 0) {
    output += "\n✅ ALL FORMULA CHECKS PASSED\n";
  } else {
    output += "\n⚠️  FORMULA VERIFICATION FAILED - REVIEW REQUIRED\n";
  }
  
  return output;
}
