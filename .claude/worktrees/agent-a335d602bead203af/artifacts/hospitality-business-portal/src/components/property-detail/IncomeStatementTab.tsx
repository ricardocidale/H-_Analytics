/**
 * IncomeStatementTab.tsx — Multi-year USALI income statement for a property.
 *
 * Renders the hotel's projected income statement following the USALI
 * (Uniform System of Accounts for the Lodging Industry) format:
 *
 *   Revenue:
 *     Rooms revenue (ADR × Occupancy × Room Count × 365)
 *     + F&B revenue + Event revenue + Other revenue
 *     = Total Revenue
 *
 *   Departmental Expenses:
 *     Rooms expense + F&B expense + Other dept expense
 *     = Total Departmental Profit
 *
 *   Undistributed Expenses:
 *     A&G + Sales & Marketing + POM + Utilities
 *     = GOP (Gross Operating Profit)
 *   Fixed Charges (Property Tax)
 *     = NOI (Net Operating Income)
 *   Management Fees (base + incentive)
 *   FF&E Reserve
 *     = ANOI (Adjusted Net Operating Income)
 *
 * Each year is a column; the component also shows the "stabilized year"
 * (when occupancy reaches its long-term target) with a visual highlight.
 */
import { useState, useMemo } from "react";
import { formatMoney } from "@/lib/financialEngine";
import { YearlyIncomeStatement } from "@/components/statements/YearlyIncomeStatement";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import { ChevronsUpDown } from "@/components/icons/themed-icons";
import WaterfallChart, { type WaterfallItem } from "@/components/charts/WaterfallChart";
import type { IncomeStatementTabProps } from "./types";

export default function IncomeStatementTab({
  yearlyChartData,
  yearlyDetails,
  financials,
  property,
  global,
  projectionYears,
  startYear,
  incomeChartRef,
  incomeTableRef,
  incomeAllExpanded,
}: IncomeStatementTabProps) {
  const [localAllExpanded, setLocalAllExpanded] = useState(false);
  const [showWaterfall, setShowWaterfall] = useState(false);
  const [waterfallYear, setWaterfallYear] = useState(0);
  const effectiveAllExpanded = incomeAllExpanded || localAllExpanded;

  const waterfallData = useMemo((): { items: WaterfallItem[]; totalRevenue: number } => {
    const yd = yearlyDetails?.[waterfallYear];
    if (!yd) return { items: [], totalRevenue: 0 };

    const totalRev = yd.revenueTotal;
    const deptExpenses = yd.expenseRooms + yd.expenseFB + yd.expenseEvents + yd.expenseOther;
    const undistributed = yd.expenseAdmin + yd.expenseMarketing + yd.expensePropertyOps +
      yd.expenseUtilitiesVar + yd.expenseUtilitiesFixed + yd.expenseIT + yd.expenseInsurance + yd.expenseOtherCosts;
    const mgmtFees = yd.feeBase + yd.feeIncentive;
    const fixedCharges = yd.expenseTaxes;
    const ffe = yd.expenseFFE;

    const items: WaterfallItem[] = [
      { label: "Total Revenue", value: totalRev, type: "subtotal" },
      { label: "Dept. Expenses", value: -deptExpenses, type: "negative" },
      { label: "Undist. Expenses", value: -undistributed, type: "negative" },
      { label: "GOP", value: yd.gop, type: "subtotal" },
      { label: "Mgmt Fees", value: -mgmtFees, type: "negative" },
      { label: "AGOP", value: yd.agop, type: "subtotal" },
      { label: "Fixed Charges", value: -fixedCharges, type: "negative" },
      { label: "NOI", value: yd.noi, type: "subtotal" },
      { label: "FF&E Reserve", value: -ffe, type: "negative" },
      { label: "ANOI", value: yd.anoi, type: "subtotal" },
    ];

    return { items, totalRevenue: totalRev };
  }, [yearlyDetails, waterfallYear]);

  return (
    <div className="space-y-6">
      <div ref={incomeChartRef} className="relative overflow-hidden rounded-2xl sm:rounded-3xl p-3 sm:p-6 bg-card shadow-lg border border-border">
        <div className="relative">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-display text-foreground">
              {showWaterfall ? `${property.name} Revenue-to-ANOI Bridge` : `${property.name} Income Statement Trends (${projectionYears}-Year Projection)`}
            </h3>
            <div className="flex items-center gap-2">
              {showWaterfall && (
                <select
                  value={waterfallYear}
                  onChange={(e) => setWaterfallYear(Number(e.target.value))}
                  className="text-sm border border-border rounded-md px-2 py-1 bg-background text-foreground"
                  data-testid="select-waterfall-year"
                >
                  {Array.from({ length: projectionYears }, (_, i) => (
                    <option key={i} value={i}>Year {startYear + i}</option>
                  ))}
                </select>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowWaterfall(!showWaterfall)}
                className="text-xs h-7 px-3"
                data-testid="button-toggle-waterfall"
              >
                {showWaterfall ? "Line Chart" : "Waterfall"}
              </Button>
            </div>
          </div>
          {showWaterfall ? (
            <div className="h-[350px]" data-testid="chart-waterfall">
              <WaterfallChart
                data={waterfallData.items}
                totalRevenue={waterfallData.totalRevenue}
              />
            </div>
          ) : (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={yearlyChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis 
                    dataKey="year" 
                    stroke="hsl(var(--foreground))" 
                    fontSize={12}
                    tickLine={false}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                  />
                  <YAxis 
                    stroke="hsl(var(--foreground))" 
                    fontSize={12}
                    tickLine={false}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                    tickFormatter={(value) => `$${(value / 1000000).toFixed(1)}M`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      borderColor: 'hsl(var(--border))',
                      borderRadius: '12px',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                      color: 'hsl(var(--foreground))',
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}
                    formatter={(value: number, name: string) => {
                      const labels: Record<string, string> = { Revenue: "Revenue — Total Revenue", GOP: "GOP — Gross Operating Profit", AGOP: "AGOP — Adjusted Gross Operating Profit", NOI: "NOI — Net Operating Income", ANOI: "ANOI — Adjusted Net Operating Income" };
                      return [formatMoney(value), labels[name] ?? name];
                    }}
                  />
                  <Legend 
                    wrapperStyle={{ color: 'hsl(var(--muted-foreground))' }}
                    iconType="circle"
                    formatter={(value: string) => {
                      const abbr: Record<string, string> = { Revenue: "Revenue", GOP: "GOP", AGOP: "AGOP", NOI: "NOI", ANOI: "ANOI" };
                      return abbr[value] ?? value;
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="Revenue" 
                    stroke="hsl(var(--line-1))" 
                    strokeWidth={3}
                    dot={{ fill: 'hsl(var(--line-1))', stroke: 'hsl(var(--card))', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, fill: 'hsl(var(--line-1))', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="GOP" 
                    stroke="hsl(var(--line-2))" 
                    strokeWidth={3}
                    dot={{ fill: 'hsl(var(--line-2))', stroke: 'hsl(var(--card))', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, fill: 'hsl(var(--line-2))', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="AGOP" 
                    stroke="hsl(var(--chart-1))"
                    strokeWidth={3}
                    dot={{ fill: 'hsl(var(--chart-1))', stroke: 'hsl(var(--card))', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, fill: 'hsl(var(--chart-1))', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="NOI" 
                    stroke="hsl(var(--line-3))" 
                    strokeWidth={3}
                    dot={{ fill: 'hsl(var(--line-3))', stroke: 'hsl(var(--card))', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, fill: 'hsl(var(--line-3))', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="ANOI" 
                    stroke="hsl(var(--line-4))" 
                    strokeWidth={3}
                    dot={{ fill: 'hsl(var(--line-4))', stroke: 'hsl(var(--card))', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, fill: 'hsl(var(--line-4))', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
      <div ref={incomeTableRef}>
        <div className="flex justify-end mb-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocalAllExpanded(!localAllExpanded)}
            className="text-xs text-muted-foreground h-7 px-2"
            data-testid="button-toggle-all-property-is"
          >
            <ChevronsUpDown className="h-3.5 w-3.5 mr-1" />
            {effectiveAllExpanded ? "Collapse All Formulas" : "Expand All Formulas"}
          </Button>
        </div>
        <YearlyIncomeStatement data={financials} years={projectionYears} startYear={startYear} property={property} global={global} allExpanded={effectiveAllExpanded} />
      </div>
    </div>
  );
}
