import React, { useMemo, useRef } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronDown, ChevronsUpDown } from "@/components/icons/themed-icons";
import { formatMoney } from "@/lib/financialEngine";
import { CalcDetailsProvider } from "@/components/financial-table";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { FinancialChart } from "@/components/ui/financial-chart";
import { DashboardTabProps } from "./types";
import { useExpandableRows } from "./useExpandableRows";

export function IncomeStatementTab({ financials, properties, projectionYears, getFiscalYear, showCalcDetails }: DashboardTabProps) {
  const {
    allPropertyYearlyIS,
    yearlyConsolidatedCache,
  } = financials;

  const IS_ROW_KEYS = useMemo(() => [
    "metrics", "revenue", "deptExpenses", "undistExpenses",
    "gop", "fees", "agop", "fixed", "noi", "ffe", "anoi",
    "debtService", "netIncome",
  ], []);
  const { expandedRows, expandedFormulas, toggleRow, toggleFormula, toggleAll, allRowsExpanded } = useExpandableRows(IS_ROW_KEYS);
  const tabContentRef = useRef<HTMLDivElement>(null);

  const chartData = useMemo(() => {
    return Array.from({ length: projectionYears }, (_, i) => {
      const c = yearlyConsolidatedCache[i];
      return {
        year: getFiscalYear(i),
        Revenue: c?.revenueTotal ?? 0,
        GOP: c?.gop ?? 0,
        AGOP: c?.agop ?? 0,
        NOI: c?.noi ?? 0,
        ANOI: c?.anoi ?? 0,
      };
    });
  }, [yearlyConsolidatedCache, projectionYears, getFiscalYear]);

  const generateIncomeStatementData = (overrideExpanded?: Set<string>, excludeFormulas?: boolean) => {
    const activeExpanded = overrideExpanded ?? expandedRows;
    const years = Array.from({ length: projectionYears }, (_, i) => getFiscalYear(i));
    const rows: { category: string; values: number[]; displayValues?: string[]; isHeader?: boolean; indent?: number; rowId?: string; isFormula?: boolean; formulaId?: string; tooltip?: string; isBold?: boolean }[] = [];
    
    const c = (i: number) => yearlyConsolidatedCache[i];
    const p = (idx: number, i: number) => allPropertyYearlyIS[idx]?.[i];

    const pushRow = (row: typeof rows[0]) => {
      if (excludeFormulas && row.isFormula) return;
      rows.push(row);
    };

    rows.push({ category: "Operational Metrics", values: years.map(() => 0), displayValues: years.map(() => ""), isHeader: true, rowId: "metrics" });
    if (activeExpanded.has("metrics")) {
      rows.push({
        category: "Total Rooms Available",
        values: years.map((_, i) => c(i)?.availableRooms ?? 0),
        indent: 1,
        displayValues: years.map((_, i) => (c(i)?.availableRooms ?? 0).toLocaleString("en-US"))
      });

      const adrVals = years.map((_, i) => {
        const sold = c(i)?.soldRooms ?? 0;
        return sold > 0 ? (c(i)?.revenueRooms ?? 0) / sold : 0;
      });
      rows.push({
        category: "ADR (Effective)",
        values: adrVals,
        indent: 1,
        displayValues: adrVals.map(v => v > 0 ? formatMoney(v) : "-")
      });
      pushRow({
        category: "= Room Revenue ÷ Sold Rooms",
        values: adrVals,
        indent: 1,
        isFormula: true,
        displayValues: years.map((_, i) => {
          const sold = c(i)?.soldRooms ?? 0;
          const rev = c(i)?.revenueRooms ?? 0;
          return sold > 0 ? `${formatMoney(rev)} ÷ ${sold.toLocaleString("en-US")}` : "-";
        })
      });

      const occVals = years.map((_, i) => {
        const sold = c(i)?.soldRooms ?? 0;
        const avail = c(i)?.availableRooms ?? 0;
        return avail > 0 ? sold / avail : 0;
      });
      rows.push({
        category: "Occupancy",
        values: occVals,
        indent: 1,
        displayValues: occVals.map(v => `${(v * 100).toFixed(1)}%`)
      });
      pushRow({
        category: "= Sold Rooms ÷ Available Rooms",
        values: occVals,
        indent: 1,
        isFormula: true,
        displayValues: years.map((_, i) => {
          const sold = c(i)?.soldRooms ?? 0;
          const avail = c(i)?.availableRooms ?? 0;
          return avail > 0 ? `${sold.toLocaleString("en-US")} ÷ ${avail.toLocaleString("en-US")}` : "-";
        })
      });

      const revparVals = years.map((_, i) => {
        const rev = c(i)?.revenueRooms ?? 0;
        const avail = c(i)?.availableRooms ?? 0;
        return avail > 0 ? rev / avail : 0;
      });
      rows.push({
        category: "RevPAR",
        values: revparVals,
        indent: 1,
        displayValues: revparVals.map(v => v > 0 ? formatMoney(v) : "-")
      });
      pushRow({
        category: "= Room Revenue ÷ Available Rooms",
        values: revparVals,
        indent: 1,
        isFormula: true,
        displayValues: years.map((_, i) => {
          const rev = c(i)?.revenueRooms ?? 0;
          const avail = c(i)?.availableRooms ?? 0;
          return avail > 0 ? `${formatMoney(rev)} ÷ ${avail.toLocaleString("en-US")}` : "-";
        })
      });

      const trevparVals = years.map((_, i) => {
        const rev = c(i)?.revenueTotal ?? 0;
        const avail = c(i)?.availableRooms ?? 0;
        return avail > 0 ? rev / avail : 0;
      });
      rows.push({
        category: "TRevPAR",
        values: trevparVals,
        indent: 1,
        displayValues: trevparVals.map(v => v > 0 ? formatMoney(v) : "-"),
        tooltip: "Total Revenue Per Available Room. Measures total revenue efficiency across all departments."
      });
      pushRow({
        category: "= Total Revenue ÷ Available Rooms",
        values: trevparVals,
        indent: 1,
        isFormula: true,
        displayValues: years.map((_, i) => {
          const rev = c(i)?.revenueTotal ?? 0;
          const avail = c(i)?.availableRooms ?? 0;
          return avail > 0 ? `${formatMoney(rev)} ÷ ${avail.toLocaleString("en-US")}` : "-";
        })
      });

      const gopparVals = years.map((_, i) => {
        const gop = c(i)?.gop ?? 0;
        const avail = c(i)?.availableRooms ?? 0;
        return avail > 0 ? gop / avail : 0;
      });
      rows.push({
        category: "GOPPAR",
        values: gopparVals,
        indent: 1,
        displayValues: gopparVals.map(v => v > 0 ? formatMoney(v) : "-"),
        tooltip: "Gross Operating Profit Per Available Room. Key USALI profitability metric."
      });
      pushRow({
        category: "= GOP ÷ Available Rooms",
        values: gopparVals,
        indent: 1,
        isFormula: true,
        displayValues: years.map((_, i) => {
          const gop = c(i)?.gop ?? 0;
          const avail = c(i)?.availableRooms ?? 0;
          return avail > 0 ? `${formatMoney(gop)} ÷ ${avail.toLocaleString("en-US")}` : "-";
        })
      });

      const gopMarginVals = years.map((_, i) => {
        const gop = c(i)?.gop ?? 0;
        const rev = c(i)?.revenueTotal ?? 0;
        return rev > 0 ? gop / rev : 0;
      });
      rows.push({
        category: "GOP Margin",
        values: gopMarginVals,
        indent: 1,
        displayValues: gopMarginVals.map(v => `${(v * 100).toFixed(1)}%`),
        tooltip: "Gross Operating Profit as a percentage of Total Revenue."
      });

      const noiMarginVals = years.map((_, i) => {
        const noiVal = c(i)?.noi ?? 0;
        const rev = c(i)?.revenueTotal ?? 0;
        return rev > 0 ? noiVal / rev : 0;
      });
      rows.push({
        category: "NOI Margin",
        values: noiMarginVals,
        indent: 1,
        displayValues: noiMarginVals.map(v => `${(v * 100).toFixed(1)}%`),
        tooltip: "Net Operating Income as a percentage of Total Revenue."
      });

      pushRow({
        category: "Cross-check: ADR × Occupancy = RevPAR",
        values: revparVals,
        indent: 1,
        isFormula: true,
        displayValues: years.map((_, i) => {
          const sold = c(i)?.soldRooms ?? 0;
          const avail = c(i)?.availableRooms ?? 0;
          const rev = c(i)?.revenueRooms ?? 0;
          const adr = sold > 0 ? rev / sold : 0;
          const occ = avail > 0 ? sold / avail : 0;
          return avail > 0 ? `${formatMoney(adr)} × ${(occ * 100).toFixed(1)}%` : "-";
        })
      });
    }

    rows.push({ category: "Total Revenue", values: years.map((_, i) => c(i)?.revenueTotal ?? 0), isHeader: true, rowId: "revenue" });
    if (activeExpanded.has("revenue")) {
      rows.push({ category: "Room Revenue", values: years.map((_, i) => c(i)?.revenueRooms ?? 0), indent: 1, tooltip: "Income from guest room bookings. Calculated as Room Count × Days × ADR × Occupancy." });
      rows.push({ category: "Event Revenue", values: years.map((_, i) => c(i)?.revenueEvents ?? 0), indent: 1, tooltip: "Income from conferences, weddings, and banquet bookings." });
      rows.push({ category: "F&B Revenue", values: years.map((_, i) => c(i)?.revenueFB ?? 0), indent: 1, tooltip: "Income from restaurants, bars, room service, and catering." });
      rows.push({ category: "Other Revenue", values: years.map((_, i) => c(i)?.revenueOther ?? 0), indent: 1, tooltip: "Income from spa, parking, retail, and ancillary services." });
      pushRow({ category: "= Rooms + Events + F&B + Other", values: years.map((_, i) => c(i)?.revenueTotal ?? 0), indent: 1, isFormula: true });

      properties.forEach((prop, idx) => {
        rows.push({
          category: prop.name,
          values: years.map((_, i) => p(idx, i)?.revenueTotal ?? 0),
          indent: 2
        });
      });
    }

    const deptExpTotal = (i: number) => {
      const data = c(i);
      if (!data) return 0;
      return data.expenseRooms + data.expenseFB + data.expenseEvents + data.expenseOther;
    };

    rows.push({
      category: "Departmental Expenses",
      values: years.map((_, i) => deptExpTotal(i)),
      isHeader: true,
      rowId: "deptExpenses",
      tooltip: "Direct costs attributable to revenue-generating departments (Rooms, F&B, Events, Other)."
    });

    if (activeExpanded.has("deptExpenses")) {
      rows.push({ category: "Room Expense", values: years.map((_, i) => c(i)?.expenseRooms ?? 0), indent: 1, tooltip: "Direct costs of room operations: housekeeping, laundry, amenities, front desk." });
      rows.push({ category: "F&B Expense", values: years.map((_, i) => c(i)?.expenseFB ?? 0), indent: 1, tooltip: "Food & Beverage cost of goods sold and labor." });
      rows.push({ category: "Event Expense", values: years.map((_, i) => c(i)?.expenseEvents ?? 0), indent: 1, tooltip: "Direct costs for conferences, banquets, and event services." });
      rows.push({ category: "Other Departmental Expense", values: years.map((_, i) => c(i)?.expenseOther ?? 0), indent: 1, tooltip: "Spa, parking, retail, and other departmental costs." });
      pushRow({ category: "= Room + F&B + Event + Other dept expenses", values: years.map((_, i) => deptExpTotal(i)), indent: 1, isFormula: true });
    }

    const undistExpTotal = (i: number) => {
      const data = c(i);
      if (!data) return 0;
      return data.expenseMarketing + data.expensePropertyOps + data.expenseAdmin +
        data.expenseIT + data.expenseInsurance +
        data.expenseUtilitiesVar + data.expenseUtilitiesFixed + data.expenseOtherCosts;
    };

    rows.push({
      category: "Undistributed Operating Expenses",
      values: years.map((_, i) => undistExpTotal(i)),
      isHeader: true,
      rowId: "undistExpenses",
      tooltip: "Overhead costs not directly tied to a single department (USALI Schedule)."
    });

    if (activeExpanded.has("undistExpenses")) {
      rows.push({ category: "Marketing & Sales", values: years.map((_, i) => c(i)?.expenseMarketing ?? 0), indent: 1 });
      rows.push({ category: "Property Operations & Maintenance", values: years.map((_, i) => c(i)?.expensePropertyOps ?? 0), indent: 1 });
      rows.push({ category: "Admin & General", values: years.map((_, i) => c(i)?.expenseAdmin ?? 0), indent: 1 });
      rows.push({ category: "IT & Technology", values: years.map((_, i) => c(i)?.expenseIT ?? 0), indent: 1 });
      rows.push({ category: "Insurance", values: years.map((_, i) => c(i)?.expenseInsurance ?? 0), indent: 1 });
      rows.push({ category: "Utilities", values: years.map((_, i) => (c(i)?.expenseUtilitiesVar ?? 0) + (c(i)?.expenseUtilitiesFixed ?? 0)), indent: 1 });
      rows.push({ category: "Other Undistributed", values: years.map((_, i) => c(i)?.expenseOtherCosts ?? 0), indent: 1 });
      pushRow({ category: "= Sum of undistributed operating expenses", values: years.map((_, i) => undistExpTotal(i)), indent: 1, isFormula: true });
    }

    rows.push({ category: "Gross Operating Profit (GOP)", values: years.map((_, i) => c(i)?.gop ?? 0), isHeader: true, rowId: "gop" });
    if (activeExpanded.has("gop")) {
      pushRow({ category: "= Total Revenue − Departmental Expenses − Undistributed Expenses", values: years.map((_, i) => c(i)?.gop ?? 0), indent: 1, isFormula: true });

      const gopMarginVals = years.map((_, i) => {
        const gop = c(i)?.gop ?? 0;
        const rev = c(i)?.revenueTotal ?? 0;
        return rev > 0 ? gop / rev : 0;
      });
      rows.push({
        category: "GOP Margin",
        values: gopMarginVals,
        indent: 1,
        displayValues: gopMarginVals.map(v => `${(v * 100).toFixed(1)}%`),
      });

      properties.forEach((prop, idx) => {
        rows.push({
          category: prop.name,
          values: years.map((_, i) => p(idx, i)?.gop ?? 0),
          indent: 2
        });
      });
    }

    rows.push({ category: "Management Fees", values: years.map((_, i) => (c(i)?.feeBase ?? 0) + (c(i)?.feeIncentive ?? 0)), isHeader: true, rowId: "fees" });
    if (activeExpanded.has("fees")) {
      rows.push({ category: "Base Fee", values: years.map((_, i) => c(i)?.feeBase ?? 0), indent: 1, tooltip: "Management base fee, typically a percentage of Total Revenue." });
      const catSet = new Set<string>();
      for (const yc of yearlyConsolidatedCache) for (const k of Object.keys(yc?.serviceFeesByCategory ?? {})) catSet.add(k);
      catSet.forEach(cat => {
        rows.push({ category: cat, values: years.map((_, i) => c(i)?.serviceFeesByCategory?.[cat] ?? 0), indent: 2 });
      });
      rows.push({ category: "Incentive Fee", values: years.map((_, i) => c(i)?.feeIncentive ?? 0), indent: 1, tooltip: "Incentive fee based on a percentage of GOP exceeding a threshold." });
      pushRow({ category: "= Base Fee (% of Revenue) + Incentive Fee (% of GOP)", values: years.map((_, i) => (c(i)?.feeBase ?? 0) + (c(i)?.feeIncentive ?? 0)), indent: 1, isFormula: true });
    }

    rows.push({
      category: "Adjusted Gross Operating Profit (AGOP)",
      values: years.map((_, i) => c(i)?.agop ?? 0),
      isHeader: true,
      rowId: "agop",
      tooltip: "GOP after deducting management fees. Key USALI profitability subtotal."
    });
    if (activeExpanded.has("agop")) {
      pushRow({ category: "= GOP − Base Fee − Incentive Fee", values: years.map((_, i) => c(i)?.agop ?? 0), indent: 1, isFormula: true });

      const agopMarginVals = years.map((_, i) => {
        const agop = c(i)?.agop ?? 0;
        const rev = c(i)?.revenueTotal ?? 0;
        return rev > 0 ? agop / rev : 0;
      });
      rows.push({
        category: "AGOP Margin",
        values: agopMarginVals,
        indent: 1,
        displayValues: agopMarginVals.map(v => `${(v * 100).toFixed(1)}%`),
      });

      properties.forEach((prop, idx) => {
        rows.push({
          category: prop.name,
          values: years.map((_, i) => p(idx, i)?.agop ?? 0),
          indent: 2
        });
      });
    }

    rows.push({ category: "Fixed Charges", values: years.map((_, i) => (c(i)?.expenseTaxes ?? 0)), isHeader: true, rowId: "fixed" });
    if (activeExpanded.has("fixed")) {
      rows.push({ category: "Property Taxes", values: years.map((_, i) => c(i)?.expenseTaxes ?? 0), indent: 1, tooltip: "Annual property tax based on assessed property value." });
      pushRow({ category: "= Property Taxes (assessed on property value)", values: years.map((_, i) => (c(i)?.expenseTaxes ?? 0)), indent: 1, isFormula: true });
    }

    rows.push({
      category: "Net Operating Income (NOI)",
      values: years.map((_, i) => c(i)?.noi ?? 0),
      isHeader: true,
      rowId: "noi",
      tooltip: "AGOP minus fixed charges. Primary measure of property operating performance."
    });
    if (activeExpanded.has("noi")) {
      pushRow({ category: "= AGOP − Fixed Charges (Property Taxes)", values: years.map((_, i) => c(i)?.noi ?? 0), indent: 1, isFormula: true });

      const noiMarginVals = years.map((_, i) => {
        const noiVal = c(i)?.noi ?? 0;
        const rev = c(i)?.revenueTotal ?? 0;
        return rev > 0 ? noiVal / rev : 0;
      });
      rows.push({
        category: "NOI Margin",
        values: noiMarginVals,
        indent: 1,
        displayValues: noiMarginVals.map(v => `${(v * 100).toFixed(1)}%`),
      });

      properties.forEach((prop, idx) => {
        rows.push({
          category: prop.name,
          values: years.map((_, i) => p(idx, i)?.noi ?? 0),
          indent: 1
        });
      });
    }

    rows.push({ category: "FF&E Reserve", values: years.map((_, i) => c(i)?.expenseFFE ?? 0), isHeader: true, rowId: "ffe" });
    if (activeExpanded.has("ffe")) {
      const ffeRateVals = years.map((_, i) => {
        const ffe = c(i)?.expenseFFE ?? 0;
        const rev = c(i)?.revenueTotal ?? 0;
        return rev > 0 ? ffe / rev : 0;
      });
      rows.push({
        category: "FF&E % of Revenue",
        values: ffeRateVals,
        indent: 1,
        displayValues: ffeRateVals.map(v => `${(v * 100).toFixed(1)}%`),
        tooltip: "FF&E reserve as a percentage of total revenue."
      });
      pushRow({ category: "= Reserve for Furniture, Fixtures & Equipment (% of Revenue)", values: years.map((_, i) => c(i)?.expenseFFE ?? 0), indent: 1, isFormula: true });
    }

    rows.push({ category: "Adjusted NOI (ANOI)", values: years.map((_, i) => c(i)?.anoi ?? 0), isHeader: true, rowId: "anoi" });
    if (activeExpanded.has("anoi")) {
      pushRow({ category: "= NOI − FF&E Reserve", values: years.map((_, i) => c(i)?.anoi ?? 0), indent: 1, isFormula: true });

      const anoiMarginVals = years.map((_, i) => {
        const anoiVal = c(i)?.anoi ?? 0;
        const rev = c(i)?.revenueTotal ?? 0;
        return rev > 0 ? anoiVal / rev : 0;
      });
      rows.push({
        category: "ANOI Margin",
        values: anoiMarginVals,
        indent: 1,
        displayValues: anoiMarginVals.map(v => `${(v * 100).toFixed(1)}%`),
      });

      properties.forEach((prop, idx) => {
        rows.push({
          category: prop.name,
          values: years.map((_, i) => p(idx, i)?.anoi ?? 0),
          indent: 1
        });
      });
    }

    const totalDebtService = (i: number) => c(i)?.debtPayment ?? 0;

    rows.push({
      category: "Debt Service",
      values: years.map((_, i) => totalDebtService(i)),
      isHeader: true,
      rowId: "debtService",
      tooltip: "Total debt service: interest expense plus principal repayment."
    });
    if (activeExpanded.has("debtService")) {
      rows.push({ category: "Interest Expense", values: years.map((_, i) => c(i)?.interestExpense ?? 0), indent: 1, tooltip: "Interest on outstanding debt." });
      rows.push({ category: "Principal Payment", values: years.map((_, i) => c(i)?.principalPayment ?? 0), indent: 1, tooltip: "Scheduled principal repayment on loans." });
      pushRow({ category: "= Interest + Principal", values: years.map((_, i) => totalDebtService(i)), indent: 1, isFormula: true });

      const dscrVals = years.map((_, i) => {
        const anoiVal = c(i)?.anoi ?? 0;
        const ds = totalDebtService(i);
        return ds > 0 ? anoiVal / ds : 0;
      });
      rows.push({
        category: "DSCR",
        values: dscrVals,
        indent: 1,
        displayValues: dscrVals.map(v => v > 0 ? `${v.toFixed(2)}x` : "-"),
        tooltip: "Debt Service Coverage Ratio = ANOI ÷ Total Debt Service."
      });
    }

    rows.push({
      category: "Net Income",
      values: years.map((_, i) => c(i)?.netIncome ?? 0),
      isHeader: true,
      rowId: "netIncome",
      tooltip: "Bottom-line profit after all charges including depreciation and income tax."
    });
    if (activeExpanded.has("netIncome")) {
      rows.push({ category: "Depreciation", values: years.map((_, i) => c(i)?.depreciationExpense ?? 0), indent: 1, tooltip: "Non-cash depreciation of property improvements and FF&E." });
      rows.push({ category: "Income Tax", values: years.map((_, i) => c(i)?.incomeTax ?? 0), indent: 1, tooltip: "Federal/state income tax after NOL carryforward." });
      rows.push({ category: "Cash Flow", values: years.map((_, i) => c(i)?.cashFlow ?? 0), indent: 1, isBold: true, tooltip: "Cash available after all operating expenses, debt service, and taxes." });
      pushRow({ category: "= ANOI − Interest Expense − Depreciation − Income Tax", values: years.map((_, i) => c(i)?.netIncome ?? 0), indent: 1, isFormula: true });
    }

    return { years, rows };
  };

  const { years, rows } = generateIncomeStatementData();

  return (
    <div className="space-y-6">
      <div data-export-section="income-statement-chart">
      <FinancialChart
        data={chartData}
        series={["revenue", "gop", "agop", "noi", "anoi"]}
        title={`Income Statement Trends (${projectionYears}-Year Projection)`}
        id="dashboard-income-chart"
      />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center gap-3">
            <CardTitle>Consolidated Income Statement</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleAll}
              className="text-xs text-muted-foreground h-7 px-2"
              data-testid="button-toggle-all-is"
            >
              <ChevronsUpDown className="h-3.5 w-3.5 mr-1" />
              {allRowsExpanded ? "Collapse All" : "Expand All"}
            </Button>
          </div>
        </CardHeader>
        <CardContent ref={tabContentRef} data-export-section="income-statement-table">
          <CalcDetailsProvider show={showCalcDetails}>
            <div className="rounded-md border overflow-hidden overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[200px] sticky left-0 bg-muted/50 z-10">Category</TableHead>
                    {years.map(year => (
                      <TableHead key={year} className="text-right">{year}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, idx) => {
                    if (row.isFormula) {
                      const fId = row.formulaId ?? `formula-${idx}`;
                      const isOpen = expandedFormulas.has(fId);
                      return (
                        <React.Fragment key={idx}>
                          <TableRow
                            className="bg-primary/5 cursor-pointer hover:bg-primary/10"
                            onClick={() => toggleFormula(fId)}
                            data-expandable-row="true"
                          >
                            <TableCell
                              className="sticky left-0 bg-primary/5 z-10 py-1 text-sm text-muted-foreground"
                              style={{ paddingLeft: `${(row.indent ?? 1) * 1.5 + 1}rem` }}
                            >
                              <div className="flex items-center gap-1.5">
                                {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                <span className="italic">Formula</span>
                              </div>
                            </TableCell>
                            {row.values.map((val, vIdx) => (
                              <TableCell key={vIdx} className="text-right font-mono text-sm text-muted-foreground py-1">
                                {row.displayValues?.[vIdx] ?? formatMoney(val)}
                              </TableCell>
                            ))}
                          </TableRow>
                          {isOpen && (
                            <TableRow className="bg-primary/[0.03]" data-expandable-row="true">
                              <TableCell
                                className="sticky left-0 bg-primary/[0.03] z-10 py-1 text-sm text-muted-foreground italic"
                                style={{ paddingLeft: `${(row.indent ?? 1) * 1.5 + 1 + 1.25}rem` }}
                              >
                                {row.category}
                              </TableCell>
                              {row.values.map((val, vIdx) => (
                                <TableCell key={vIdx} className="text-right font-mono text-sm text-muted-foreground py-1">
                                  {row.displayValues?.[vIdx] ?? formatMoney(val)}
                                </TableCell>
                              ))}
                            </TableRow>
                          )}
                        </React.Fragment>
                      );
                    }
                    return (
                      <TableRow 
                        key={idx} 
                        className={row.isHeader ? "bg-muted/30 font-medium cursor-pointer hover:bg-muted/50" : row.isBold ? "font-semibold" : ""}
                        onClick={() => row.rowId && toggleRow(row.rowId)}
                        style={{ cursor: row.rowId ? 'pointer' : 'default' }}
                      >
                        <TableCell 
                          className="sticky left-0 bg-card z-10"
                          style={{ paddingLeft: row.indent ? `${row.indent * 1.5 + 1}rem` : '1rem' }}
                        >
                          <div className="flex items-center gap-2">
                            {row.rowId && (
                              expandedRows.has(row.rowId) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
                            )}
                            {row.category}
                            {row.tooltip && <InfoTooltip text={row.tooltip} />}
                          </div>
                        </TableCell>
                        {row.values.map((val, vIdx) => (
                          <TableCell key={vIdx} className="text-right font-mono">
                            {row.displayValues?.[vIdx] ?? formatMoney(val)}
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CalcDetailsProvider>
        </CardContent>
      </Card>
    </div>
  );
}
