/**
 * PortfolioResearchCard.tsx — Portfolio-level research benchmarks on the Dashboard.
 *
 * Computes room-count-weighted portfolio averages for ADR, occupancy, and
 * NOI margin, then compares against weighted averages of each property's
 * research seed ranges. Zero API calls — reads existing property data.
 */
import { useMemo } from "react";
import { Minus } from "@/components/icons/themed-icons";
import { IconBookOpen, IconTrendingUp, IconTrendingDown } from "@/components/icons";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/financialEngine";
import type { Property } from "@shared/schema";
import type { YearlyPropertyFinancials } from "@/lib/financial/yearlyAggregator";

interface BenchmarkMetric {
  label: string;
  actual: string;
  range: string;
  status: "above" | "below" | "within" | "unknown";
}

interface PortfolioResearchCardProps {
  properties: Property[];
  yearlyConsolidatedCache: YearlyPropertyFinancials[];
}

function statusIcon(status: BenchmarkMetric["status"]) {
  switch (status) {
    case "above": return <IconTrendingUp className="w-3.5 h-3.5 text-primary" />;
    case "below": return <IconTrendingDown className="w-3.5 h-3.5 text-accent-pop" />;
    case "within": return <Minus className="w-3.5 h-3.5 text-chart-1" />;
    default: return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
  }
}

function compareToRange(actual: number, low: number, high: number): BenchmarkMetric["status"] {
  if (actual > high) return "above";
  if (actual < low) return "below";
  return "within";
}

function parseRange(display: string): [number, number] | null {
  const nums = display.replace(/[^0-9.\-–]/g, " ").split(/[\s–\-]+/).map(Number).filter(n => !isNaN(n));
  return nums.length >= 2 ? [nums[0], nums[1]] : null;
}

export default function PortfolioResearchCard({ properties, yearlyConsolidatedCache }: PortfolioResearchCardProps) {
  const metrics = useMemo(() => {
    if (properties.length === 0) return [];

    const totalRooms = properties.reduce((s, p) => s + p.roomCount, 0);
    if (totalRooms === 0) return [];

    const result: BenchmarkMetric[] = [];

    // Weighted ADR
    const weightedADR = properties.reduce((s, p) => s + p.startAdr * p.roomCount, 0) / totalRooms;
    let adrLow = 0, adrHigh = 0, adrCount = 0;
    for (const p of properties) {
      const rv = p.researchValues as Record<string, { display: string; mid: number }> | null;
      if (rv?.adr) {
        const range = parseRange(rv.adr.display);
        if (range) {
          adrLow += range[0] * p.roomCount;
          adrHigh += range[1] * p.roomCount;
          adrCount += p.roomCount;
        }
      }
    }
    if (adrCount > 0) {
      result.push({
        label: "Wtd ADR",
        actual: formatMoney(weightedADR),
        range: `${formatMoney(adrLow / adrCount)}–${formatMoney(adrHigh / adrCount)}`,
        status: compareToRange(weightedADR, adrLow / adrCount, adrHigh / adrCount),
      });
    }

    // Weighted Occupancy
    const weightedOcc = properties.reduce((s, p) => s + (p.maxOccupancy ?? 0.85) * 100 * p.roomCount, 0) / totalRooms;
    let occLow = 0, occHigh = 0, occCount = 0;
    for (const p of properties) {
      const rv = p.researchValues as Record<string, { display: string; mid: number }> | null;
      if (rv?.occupancy) {
        const range = parseRange(rv.occupancy.display);
        if (range) {
          occLow += range[0] * p.roomCount;
          occHigh += range[1] * p.roomCount;
          occCount += p.roomCount;
        }
      }
    }
    if (occCount > 0) {
      result.push({
        label: "Wtd Occupancy",
        actual: `${weightedOcc.toFixed(0)}%`,
        range: `${(occLow / occCount).toFixed(0)}%–${(occHigh / occCount).toFixed(0)}%`,
        status: compareToRange(weightedOcc, occLow / occCount, occHigh / occCount),
      });
    }

    // Portfolio RevPAR (computed)
    const revPAR = weightedADR * (weightedOcc / 100);
    result.push({
      label: "Portfolio RevPAR",
      actual: formatMoney(revPAR),
      range: "Computed",
      status: "unknown",
    });

    // Portfolio NOI Margin (Year 1 from consolidated)
    if (yearlyConsolidatedCache.length > 0) {
      const yr1 = yearlyConsolidatedCache[0];
      const rev = yr1.revenueTotal ?? 0;
      const noi = yr1.noi ?? 0;
      const noiMargin = rev > 0 ? (noi / rev) * 100 : 0;
      result.push({
        label: "NOI Margin (Yr 1)",
        actual: `${noiMargin.toFixed(1)}%`,
        range: "15%–42%",
        status: compareToRange(noiMargin, 15, 42),
      });
    }

    // Weighted Cap Rate
    let capLow = 0, capHigh = 0, capCount = 0;
    const weightedCap = properties.reduce((s, p) => s + (p.exitCapRate ?? 0.085) * 100 * p.roomCount, 0) / totalRooms;
    for (const p of properties) {
      const rv = p.researchValues as Record<string, { display: string; mid: number }> | null;
      if (rv?.capRate) {
        const range = parseRange(rv.capRate.display);
        if (range) {
          capLow += range[0] * p.roomCount;
          capHigh += range[1] * p.roomCount;
          capCount += p.roomCount;
        }
      }
    }
    if (capCount > 0) {
      result.push({
        label: "Wtd Cap Rate",
        actual: `${weightedCap.toFixed(1)}%`,
        range: `${(capLow / capCount).toFixed(1)}%–${(capHigh / capCount).toFixed(1)}%`,
        status: compareToRange(weightedCap, capLow / capCount, capHigh / capCount),
      });
    }

    return result;
  }, [properties, yearlyConsolidatedCache]);

  if (metrics.length === 0) return null;

  return (
    <div className="relative overflow-hidden rounded-lg bg-card border border-border shadow-sm">
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <IconBookOpen className="w-4 h-4 text-primary" />
          <h4 className="text-sm font-display text-foreground">Portfolio Benchmarks</h4>
          <span className="text-xs text-muted-foreground ml-auto">room-weighted vs. research ranges</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2">
          {metrics.map((m) => (
            <div
              key={m.label}
              className={cn(
                "rounded-lg p-2.5 border transition-colors",
                m.status === "within" && "bg-chart-1/10 border-chart-1/20",
                m.status === "above" && "bg-primary/5 border-primary/20",
                m.status === "below" && "bg-accent-pop/10 border-accent-pop/20",
                m.status === "unknown" && "bg-muted/50 border-border/60",
              )}
            >
              <div className="flex items-center gap-1 mb-1">
                {statusIcon(m.status)}
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground truncate">{m.label}</span>
              </div>
              <div className="text-sm font-semibold font-mono text-foreground">{m.actual}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{m.range}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
