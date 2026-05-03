import { useMemo } from "react";
import { Minus } from "@/components/icons/themed-icons";
import { IconBookOpen, IconTrendingUp, IconTrendingDown } from "@/components/icons";
import { cn } from "@/lib/utils";
import {
  COMPANY_SEED_RANGES,
  TOTAL_BASE_FEE_RANGE,
  NET_MARGIN_RANGE,
  GA_OVERHEAD_RANGE,
  STAFF_COST_RANGE,
} from "@shared/companyBenchmarks";
import type { GlobalResponse } from "@/lib/api/types";

interface BenchmarkRow {
  label: string;
  actual: string;
  range: string;
  source: string;
  status: "above" | "below" | "within" | "unknown";
}

interface CompanyBenchmarkPanelProps {
  global: GlobalResponse;
  yearlyChartData: { Revenue: number; Expenses: number; NetIncome: number }[];
  financials: { staffCompensation: number; totalRevenue: number }[];
}

function statusIcon(status: BenchmarkRow["status"]) {
  switch (status) {
    case "above": return <IconTrendingUp className="w-3.5 h-3.5 text-primary" />;
    case "below": return <IconTrendingDown className="w-3.5 h-3.5 text-muted-foreground" />;
    case "within": return <Minus className="w-3.5 h-3.5 text-primary" />;
    default: return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
  }
}

function compareToRange(actual: number, low: number, high: number): BenchmarkRow["status"] {
  if (actual > high) return "above";
  if (actual < low) return "below";
  return "within";
}

function fmtRange(low: number, high: number, suffix = "%"): string {
  return `${low}${suffix}–${high}${suffix}`;
}

export default function CompanyBenchmarkPanel({ global, yearlyChartData, financials }: CompanyBenchmarkPanelProps) {
  const rows = useMemo(() => {
    if (!global) return [];

    const result: BenchmarkRow[] = [];

    const baseFeePercent = (global.baseManagementFee ?? 0) * 100;
    result.push({
      label: "Base Mgmt Fee",
      actual: `${baseFeePercent.toFixed(1)}%`,
      range: fmtRange(+TOTAL_BASE_FEE_RANGE.low.toFixed(1), +TOTAL_BASE_FEE_RANGE.high.toFixed(1)),
      source: TOTAL_BASE_FEE_RANGE.source,
      status: compareToRange(baseFeePercent, TOTAL_BASE_FEE_RANGE.low, TOTAL_BASE_FEE_RANGE.high),
    });

    const incentiveFeePercent = (global.incentiveManagementFee ?? 0) * 100;
    const incSeed = COMPANY_SEED_RANGES.incentiveFee;
    result.push({
      label: "Incentive Fee",
      actual: `${incentiveFeePercent.toFixed(1)}%`,
      range: fmtRange(incSeed.low, incSeed.high),
      source: incSeed.source,
      status: compareToRange(incentiveFeePercent, incSeed.low, incSeed.high),
    });

    if (yearlyChartData.length > 0) {
      const yr1 = yearlyChartData[0];

      if (yr1.Revenue > 0) {
        const overheadRatio = (yr1.Expenses / yr1.Revenue) * 100;
        result.push({
          label: "G&A Overhead (Yr 1)",
          actual: `${overheadRatio.toFixed(1)}%`,
          range: fmtRange(GA_OVERHEAD_RANGE.low, GA_OVERHEAD_RANGE.high),
          source: GA_OVERHEAD_RANGE.source,
          status: compareToRange(overheadRatio, GA_OVERHEAD_RANGE.low, GA_OVERHEAD_RANGE.high),
        });

        const yr1Financials = financials.slice(0, 12);
        const yr1StaffComp = yr1Financials.reduce((a, m) => a + m.staffCompensation, 0);
        const staffRatio = yr1.Revenue > 0 ? (yr1StaffComp / yr1.Revenue) * 100 : 0;
        if (staffRatio > 0) {
          result.push({
            label: "Staff Cost Ratio",
            actual: `${staffRatio.toFixed(1)}%`,
            range: fmtRange(STAFF_COST_RANGE.low, STAFF_COST_RANGE.high),
            source: STAFF_COST_RANGE.source,
            status: compareToRange(staffRatio, STAFF_COST_RANGE.low, STAFF_COST_RANGE.high),
          });
        }

        const netMargin = (yr1.NetIncome / yr1.Revenue) * 100;
        result.push({
          label: "Net Margin (Yr 1)",
          actual: `${netMargin.toFixed(1)}%`,
          range: fmtRange(NET_MARGIN_RANGE.low, NET_MARGIN_RANGE.high),
          source: NET_MARGIN_RANGE.source,
          status: compareToRange(netMargin, NET_MARGIN_RANGE.low, NET_MARGIN_RANGE.high),
        });
      }
    }

    return result;
  }, [global, yearlyChartData, financials]);

  if (rows.length === 0) return null;

  return (
    <div className="relative overflow-hidden rounded-lg bg-card border border-border shadow-sm" data-testid="company-benchmark-panel">
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <IconBookOpen className="w-4 h-4 text-primary" />
          <h4 className="text-sm font-display text-foreground">Market Benchmarks</h4>
          <span className="text-xs text-muted-foreground ml-auto">vs. industry ranges</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {rows.map((row) => (
            <div
              key={row.label}
              data-testid={`benchmark-card-${row.label.toLowerCase().replace(/\s+/g, '-')}`}
              className={cn(
                "rounded-lg p-2.5 border transition-colors",
                row.status === "within" && "bg-primary/5 border-primary/20",
                row.status === "above" && "bg-primary/10 border-primary/30",
                row.status === "below" && "bg-muted/50 border-border/60",
                row.status === "unknown" && "bg-muted/50 border-border/60",
              )}
            >
              <div className="flex items-center gap-1 mb-1">
                {statusIcon(row.status)}
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground truncate">{row.label}</span>
              </div>
              <div className="text-sm font-semibold font-mono text-foreground">{row.actual}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{row.range}</div>
              <div className="text-[10px] text-muted-foreground/70 italic truncate">{row.source}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
