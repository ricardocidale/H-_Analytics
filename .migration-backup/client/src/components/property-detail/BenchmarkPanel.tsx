/**
 * BenchmarkPanel.tsx — Inline research benchmarks on the PropertyDetail page.
 *
 * Shows a compact comparison of the property's actual metrics against
 * research-seeded or AI-generated market ranges. Uses data already stored
 * in the property's researchValues — zero API calls, zero latency.
 *
 * Toggled via a "Benchmarks" button in the property detail header.
 */
import { useMemo } from "react";
import { Minus } from "@/components/icons/themed-icons";
import { IconBookOpen, IconTrendingUp, IconTrendingDown } from "@/components/icons";
import type { PropertyResponse } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/financialEngine";

interface BenchmarkRow {
  label: string;
  actual: string;
  range: string;
  source: string;
  status: "above" | "below" | "within" | "unknown";
}

interface BenchmarkPanelProps {
  property: PropertyResponse;
  yearlyChartData: { Revenue: number; GOP: number; ANOI: number }[];
}

function statusIcon(status: BenchmarkRow["status"]) {
  switch (status) {
    case "above": return <IconTrendingUp className="w-3.5 h-3.5 text-primary" />;
    case "below": return <IconTrendingDown className="w-3.5 h-3.5 text-accent-pop" />;
    case "within": return <Minus className="w-3.5 h-3.5 text-chart-1" />;
    default: return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
  }
}

function compareToRange(actual: number, low: number, high: number): BenchmarkRow["status"] {
  if (actual > high) return "above";
  if (actual < low) return "below";
  return "within";
}

export default function BenchmarkPanel({ property, yearlyChartData }: BenchmarkPanelProps) {
  const rows = useMemo(() => {
    const rv = property?.researchValues as Record<string, { display: string; mid: number }> | null;
    if (!rv) return [];

    const result: BenchmarkRow[] = [];

    // ADR
    if (rv.adr) {
      const nums = rv.adr.display.replace(/[^0-9.\-–]/g, ' ').split(/[\s–\-]+/).map(Number).filter(n => !isNaN(n));
      const [low, high] = nums.length >= 2 ? [nums[0], nums[1]] : [rv.adr.mid * 0.85, rv.adr.mid * 1.15];
      result.push({
        label: "ADR",
        actual: formatMoney(property.startAdr),
        range: rv.adr.display,
        source: "Seed",
        status: compareToRange(property.startAdr, low, high),
      });
    }

    // Occupancy
    if (rv.occupancy) {
      const occ = (property.maxOccupancy ?? 0.85) * 100;
      const nums = rv.occupancy.display.replace(/[^0-9.\-–]/g, ' ').split(/[\s–\-]+/).map(Number).filter(n => !isNaN(n));
      const [low, high] = nums.length >= 2 ? [nums[0], nums[1]] : [rv.occupancy.mid * 0.9, rv.occupancy.mid * 1.1];
      result.push({
        label: "Max Occupancy",
        actual: `${occ.toFixed(0)}%`,
        range: rv.occupancy.display,
        source: "Seed",
        status: compareToRange(occ, low, high),
      });
    }

    // NOI Margin (computed from Year 1 data)
    if (yearlyChartData.length > 0) {
      const yr1 = yearlyChartData[0];
      const noiMargin = yr1.Revenue > 0 ? (yr1.ANOI / yr1.Revenue) * 100 : 0;
      result.push({
        label: "ANOI Margin (Yr 1)",
        actual: `${noiMargin.toFixed(1)}%`,
        range: "15%–42%",
        source: "Industry",
        status: compareToRange(noiMargin, 15, 42),
      });
    }

    // RevPAR (computed)
    if (property.startAdr && property.maxOccupancy) {
      const revpar = property.startAdr * (property.maxOccupancy ?? 0.85);
      result.push({
        label: "RevPAR (at max occ)",
        actual: formatMoney(revpar),
        range: "Computed",
        source: "—",
        status: "unknown",
      });
    }

    // Cap Rate
    if (rv.capRate) {
      const propCap = (property.exitCapRate ?? 0.085) * 100;
      const nums = rv.capRate.display.replace(/[^0-9.\-–]/g, ' ').split(/[\s–\-]+/).map(Number).filter(n => !isNaN(n));
      const [low, high] = nums.length >= 2 ? [nums[0], nums[1]] : [rv.capRate.mid * 0.9, rv.capRate.mid * 1.1];
      result.push({
        label: "Exit Cap Rate",
        actual: `${propCap.toFixed(1)}%`,
        range: rv.capRate.display,
        source: "Seed",
        status: compareToRange(propCap, low, high),
      });
    }

    // Land Value
    if (rv.landValue) {
      const lv = (property.landValuePercent ?? 0.2) * 100;
      const nums = rv.landValue.display.replace(/[^0-9.\-–]/g, ' ').split(/[\s–\-]+/).map(Number).filter(n => !isNaN(n));
      const [low, high] = nums.length >= 2 ? [nums[0], nums[1]] : [rv.landValue.mid * 0.85, rv.landValue.mid * 1.15];
      result.push({
        label: "Land Value %",
        actual: `${lv.toFixed(0)}%`,
        range: rv.landValue.display,
        source: "Seed",
        status: compareToRange(lv, low, high),
      });
    }

    return result;
  }, [property, yearlyChartData]);

  if (rows.length === 0) return null;

  return (
    <div className="relative overflow-hidden rounded-lg bg-card border border-border shadow-sm">
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <IconBookOpen className="w-4 h-4 text-primary" />
          <h4 className="text-sm font-display text-foreground">Market Benchmarks</h4>
          <span className="text-xs text-muted-foreground ml-auto">vs. research ranges</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {rows.map((row) => (
            <div
              key={row.label}
              className={cn(
                "rounded-lg p-2.5 border transition-colors",
                row.status === "within" && "bg-chart-1/10 border-chart-1/20",
                row.status === "above" && "bg-primary/5 border-primary/20",
                row.status === "below" && "bg-accent-pop/10 border-accent-pop/20",
                row.status === "unknown" && "bg-muted/50 border-border/60",
              )}
            >
              <div className="flex items-center gap-1 mb-1">
                {statusIcon(row.status)}
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground truncate">{row.label}</span>
              </div>
              <div className="text-sm font-semibold font-mono text-foreground">{row.actual}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{row.range}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
