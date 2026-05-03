/**
 * CashFlowTab.tsx — Annual cash flow waterfall for a single property.
 *
 * Shows the path from ANOI (Adjusted Net Operating Income) down to net
 * cash flow available to equity investors:
 *
 *   ANOI (NOI minus management fees minus FF&E reserve)
 *   − Debt Service (principal + interest payments)
 *   − Income Tax
 *   = Net Cash Flow (before distributions)
 *
 * Also computes the DSCR (Debt Service Coverage Ratio) = ANOI / Debt Service.
 * Lenders typically require DSCR ≥ 1.25×, meaning ANOI must be at least
 * 25% higher than the debt service obligation. The UI highlights years
 * where DSCR falls below the required threshold.
 *
 * At the exit year, a terminal cash flow row shows the net sale proceeds:
 *   Gross Sale Price (NOI / exit cap rate)
 *   − Sales Commission
 *   − Remaining Loan Balance
 *   = Net Equity Proceeds
 */
import { formatMoney } from "@/lib/financialEngine";
import { YearlyCashFlowStatement } from "@/components/statements/YearlyCashFlowStatement";
import { DEFAULT_LTV } from "@/lib/financial/loanCalculations";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { CashFlowTabProps } from "./types";

export default function CashFlowTab({
  yearlyChartData,
  cashFlowData,
  financials,
  property,
  global,
  projectionYears,
  startYear,
  cashFlowChartRef,
  cashFlowTableRef,
}: CashFlowTabProps) {
  return (
    <div className="space-y-6">
      <div ref={cashFlowChartRef} className="relative overflow-hidden rounded-2xl sm:rounded-3xl p-3 sm:p-6 bg-card shadow-lg border border-border">
        <div className="relative">
          <h3 className="text-lg font-display text-foreground mb-4">{property.name} Cash Flow Trends ({projectionYears}-Year Projection)</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              {/* Merge income-statement chart data (NOI) with cash-flow waterfall
                  data (FCF, FCFE) so the chart shows all three lines together */}
              <LineChart data={yearlyChartData.map((d, i) => {
                return {
                  ...d,
                  FCF: cashFlowData[i]?.freeCashFlow ?? 0,
                  FCFE: cashFlowData[i]?.freeCashFlowToEquity ?? 0,
                  NetToInvestors: cashFlowData[i]?.netCashFlowToInvestors ?? 0,
                };
              })}>
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
                    const labels: Record<string, string> = { NOI: "NOI — Net Operating Income", ANOI: "ANOI — Adjusted Net Operating Income", FCF: "FCF — Free Cash Flow", FCFE: "FCFE — Free Cash Flow to Equity" };
                    return [formatMoney(value), labels[name] ?? name];
                  }}
                />
                <Legend 
                  wrapperStyle={{ color: 'hsl(var(--muted-foreground))' }}
                  iconType="circle"
                  formatter={(value: string) => {
                    const abbr: Record<string, string> = { NOI: "NOI", ANOI: "ANOI", FCF: "FCF", FCFE: "FCFE" };
                    return abbr[value] ?? value;
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="NOI" 
                  stroke="hsl(var(--line-4))" 
                  strokeWidth={3}
                  dot={{ fill: 'hsl(var(--line-4))', stroke: 'hsl(var(--card))', strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6, fill: 'hsl(var(--line-4))', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="ANOI" 
                  stroke="hsl(var(--line-1))" 
                  strokeWidth={3}
                  dot={{ fill: 'hsl(var(--line-1))', stroke: 'hsl(var(--card))', strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6, fill: 'hsl(var(--line-1))', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="FCF" 
                  stroke="hsl(var(--line-2))" 
                  strokeWidth={3}
                  dot={{ fill: 'hsl(var(--line-2))', stroke: 'hsl(var(--card))', strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6, fill: 'hsl(var(--line-2))', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="FCFE" 
                  stroke="hsl(var(--line-3))" 
                  strokeWidth={3}
                  dot={{ fill: 'hsl(var(--line-3))', stroke: 'hsl(var(--card))', strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6, fill: 'hsl(var(--line-3))', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <div ref={cashFlowTableRef}>
        <YearlyCashFlowStatement 
          data={financials} 
          property={property} 
          global={global}
          years={projectionYears} 
          startYear={startYear} 
          defaultLTV={property.acquisitionLTV ?? DEFAULT_LTV}
        />
      </div>
    </div>
  );
}
