import { ArrowUpDown } from "@/components/icons/themed-icons";
import { IconTrendingUp, IconTrendingDown } from "@/components/icons";
import { formatMoney } from "@/lib/financialEngine";
import type { ScenarioResult } from "./types";

interface SensitivityComparisonTableProps {
  baseResult: ScenarioResult;
  adjustedResult: ScenarioResult;
}

export function SensitivityComparisonTable({ baseResult, adjustedResult }: SensitivityComparisonTableProps) {
  const rows = [
    { label: "Total Revenue", base: baseResult.totalRevenue, adj: adjustedResult.totalRevenue, fmt: "money" as const },
    { label: "Total ANOI", base: baseResult.totalNOI, adj: adjustedResult.totalNOI, fmt: "money" as const },
    { label: "ANOI Margin", base: baseResult.avgNOIMargin, adj: adjustedResult.avgNOIMargin, fmt: "pct" as const },
    { label: "Total Cash Flow", base: baseResult.totalCashFlow, adj: adjustedResult.totalCashFlow, fmt: "money" as const },
    { label: "Exit Value", base: baseResult.exitValue, adj: adjustedResult.exitValue, fmt: "money" as const },
    { label: "Levered IRR", base: baseResult.irr * 100, adj: adjustedResult.irr * 100, fmt: "pct" as const },
  ];

  return (
    <div className="bg-card/80 rounded-lg p-6 border border-primary/10 shadow-[0_2px_8px_rgba(var(--primary-rgb,159,188,164),0.08)]">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
          <ArrowUpDown className="w-5 h-5 text-secondary" />
        </div>
        <div>
          <h3 className="text-lg font-display font-bold text-foreground" data-testid="text-comparison-title">
            Base vs. Adjusted Scenario
          </h3>
          <p className="text-xs text-muted-foreground">Side-by-side comparison of your current adjustments</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="table-comparison">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 font-medium text-muted-foreground">Metric</th>
              <th className="text-right py-3 px-4 font-medium text-muted-foreground">Base Case</th>
              <th className="text-right py-3 px-4 font-medium text-muted-foreground">Adjusted</th>
              <th className="text-right py-3 px-4 font-medium text-muted-foreground">Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const delta = row.adj - row.base;
              const deltaPct = row.base !== 0 ? (delta / Math.abs(row.base)) * 100 : 0;
              return (
                <tr key={row.label} className="border-b border-border hover:bg-muted/50 transition-colors">
                  <td className="py-3 px-4 font-medium text-foreground">{row.label}</td>
                  <td className="py-3 px-4 text-right font-mono text-muted-foreground">
                    {row.fmt === "money" ? formatMoney(row.base) : `${row.base.toFixed(1)}%`}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-semibold text-foreground">
                    {row.fmt === "money" ? formatMoney(row.adj) : `${row.adj.toFixed(1)}%`}
                  </td>
                  <td className={`py-3 px-4 text-right font-mono font-semibold ${
                    delta > 0 ? "text-secondary" : delta < 0 ? "text-destructive" : "text-muted-foreground"
                  }`}>
                    <div className="flex items-center justify-end gap-1">
                      {delta > 0 ? (
                        <IconTrendingUp className="w-3.5 h-3.5" />
                      ) : delta < 0 ? (
                        <IconTrendingDown className="w-3.5 h-3.5" />
                      ) : null}
                      <span>
                        {row.fmt === "money"
                          ? `${delta >= 0 ? "+" : ""}${formatMoney(delta)}`
                          : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}pp`}
                      </span>
                      <span className="text-xs text-muted-foreground ml-1">
                        ({deltaPct >= 0 ? "+" : ""}{deltaPct.toFixed(1)}%)
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
