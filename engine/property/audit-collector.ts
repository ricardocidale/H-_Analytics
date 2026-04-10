import type { MonthlyFinancials } from "../types";
import type { YearlyPropertyFinancials } from "../aggregation/yearlyAggregator";

export interface AuditEntry {
  step: number;
  module: string;
  label: string;
  formula: string;
  inputs: Record<string, number>;
  output: number;
  note?: string;
}

export class AuditCollector {
  private entries: AuditEntry[] = [];
  private stepCounter = 0;

  record(module: string, label: string, formula: string, inputs: Record<string, number>, output: number): void {
    this.entries.push({
      step: this.stepCounter++,
      module,
      label,
      formula,
      inputs,
      output,
    });
  }

  getEntries(): AuditEntry[] {
    return this.entries;
  }

  get totalSteps(): number {
    return this.entries.length;
  }

  collectFromMonthly(monthly: MonthlyFinancials[], propertyName: string): void {
    for (let i = 0; i < monthly.length; i++) {
      const m = monthly[i];
      if (m.revenueTotal === 0 && m.noi === 0) continue;

      const monthLabel = `M${i + 1}`;
      const mod = `${propertyName}/${monthLabel}`;

      this.record(mod, "Revenue: Rooms", "soldRooms × ADR", { soldRooms: m.soldRooms, adr: m.adr }, m.revenueRooms);
      this.record(mod, "Revenue: Events", "revenueRooms × eventShare", { revenueRooms: m.revenueRooms }, m.revenueEvents);
      this.record(mod, "Revenue: F&B", "revenueRooms × fbShare × cateringBoost", { revenueRooms: m.revenueRooms }, m.revenueFB);
      this.record(mod, "Revenue: Other", "revenueRooms × otherShare", { revenueRooms: m.revenueRooms }, m.revenueOther);
      this.record(mod, "Revenue: Total", "rooms + events + fb + other", {
        rooms: m.revenueRooms, events: m.revenueEvents, fb: m.revenueFB, other: m.revenueOther,
      }, m.revenueTotal);

      this.record(mod, "GOP", "revenueTotal - totalOperatingExpenses", { revenueTotal: m.revenueTotal, totalOperatingExpenses: m.revenueTotal - m.gop }, m.gop);
      this.record(mod, "AGOP", "GOP - feeBase - feeIncentive", { gop: m.gop, feeBase: m.feeBase, feeIncentive: m.feeIncentive }, m.agop);
      this.record(mod, "NOI", "AGOP - expenseTaxes", { agop: m.agop, expenseTaxes: m.expenseTaxes }, m.noi);
      this.record(mod, "ANOI", "NOI - expenseFFE", { noi: m.noi, expenseFFE: m.expenseFFE }, m.anoi);

      this.record(mod, "Interest Expense", "debtOutstanding × monthlyRate", { debtOutstanding: m.debtOutstanding }, m.interestExpense);
      this.record(mod, "Depreciation", "buildingValue / depreciationYears / 12", {}, m.depreciationExpense);
      this.record(mod, "Net Income", "ANOI - interest - depreciation - incomeTax", {
        anoi: m.anoi, interestExpense: m.interestExpense, depreciation: m.depreciationExpense, incomeTax: m.incomeTax,
      }, m.netIncome);

      this.record(mod, "Operating Cash Flow", "netIncome + depreciation", { netIncome: m.netIncome, depreciation: m.depreciationExpense }, m.operatingCashFlow);
      this.record(mod, "Financing Cash Flow", "-principalPayment", { principalPayment: m.principalPayment }, m.financingCashFlow);
      this.record(mod, "Ending Cash", "cumulative cash balance", {}, m.endingCash);
    }
  }

  collectFromYearly(yearly: YearlyPropertyFinancials[], propertyName: string): void {
    for (const y of yearly) {
      const mod = `${propertyName}/Year${y.year + 1}`;

      this.record(mod, "Annual Revenue", "Σ monthly revenue", {}, y.revenueTotal);
      this.record(mod, "Annual GOP", "Σ monthly GOP", {}, y.gop);
      this.record(mod, "Annual NOI", "Σ monthly NOI", {}, y.noi);
      this.record(mod, "Annual ANOI", "Σ monthly ANOI", {}, y.anoi);
      this.record(mod, "Annual Net Income", "Σ monthly netIncome", {}, y.netIncome);
      this.record(mod, "Annual Ending Cash", "final month ending cash", {}, y.endingCash);
    }
  }
}
