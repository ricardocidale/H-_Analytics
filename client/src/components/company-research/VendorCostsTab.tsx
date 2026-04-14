/**
 * VendorCostsTab.tsx — Vendor cost and markup analysis for centralized services.
 *
 * Shows industry markup ranges, effective margins, and vendor cost waterfalls
 * using deterministic tools from calc/research.
 */
import { useMemo } from "react";
import { IconPackage } from "@/components/icons";
import { SectionCard } from "../property-research/SectionCard";
import { companySectionColors } from "./types";
import { computeMarkupWaterfall } from "@calc/research/markup-waterfall";

const SERVICE_TYPES = ["marketing", "technology_reservations", "accounting", "revenue_management", "procurement", "hr", "design", "general_management"];
const LABELS: Record<string, string> = {
  marketing: "Marketing & Digital",
  technology_reservations: "Technology & Reservations",
  accounting: "Accounting & Finance",
  revenue_management: "Revenue Management",
  procurement: "Procurement & Purchasing",
  hr: "HR & Training",
  design: "Design & Renovation",
  general_management: "General Management",
};

interface VendorCostsTabProps {
  content: any;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function VendorCostsTab({ content }: VendorCostsTabProps) {
  const sampleVendorCost = 10_000;

  const waterfalls = useMemo(() =>
    SERVICE_TYPES.map(type => {
      const w = computeMarkupWaterfall({ vendorCost: sampleVendorCost, markupPct: 0.20, serviceType: type });
      return { type, label: LABELS[type] || type, ...w };
    }),
  []);

  return (
    <div className="space-y-6">
      <SectionCard icon={IconPackage} title="Industry Markup Ranges by Service Type" color={companySectionColors.benchmarks}>
        <p className="text-xs text-muted-foreground mb-4">
          Standard vendor markup percentages and effective margins for hospitality management company services.
        </p>
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted border-b border-border">
                <th className="text-left p-3 text-muted-foreground font-medium">Service</th>
                <th className="text-right p-3 text-muted-foreground font-medium">Low Markup</th>
                <th className="text-right p-3 text-muted-foreground font-medium">Mid Markup</th>
                <th className="text-right p-3 text-muted-foreground font-medium">High Markup</th>
                <th className="text-right p-3 text-muted-foreground font-medium">Eff. Margin (Mid)</th>
              </tr>
            </thead>
            <tbody>
              {waterfalls.map(w => {
                const midMargin = w.industryMarkupRange
                  ? (w.industryMarkupRange.mid / (1 + w.industryMarkupRange.mid) * 100).toFixed(1)
                  : "—";
                return (
                  <tr key={w.type} className="border-b border-border hover:bg-muted/50 transition-colors">
                    <td className="p-3 text-foreground font-medium">{w.label}</td>
                    <td className="p-3 text-right text-muted-foreground font-mono">
                      {w.industryMarkupRange ? `${(w.industryMarkupRange.low * 100).toFixed(0)}%` : "—"}
                    </td>
                    <td className="p-3 text-right text-primary font-mono font-medium">
                      {w.industryMarkupRange ? `${(w.industryMarkupRange.mid * 100).toFixed(0)}%` : "—"}
                    </td>
                    <td className="p-3 text-right text-muted-foreground font-mono">
                      {w.industryMarkupRange ? `${(w.industryMarkupRange.high * 100).toFixed(0)}%` : "—"}
                    </td>
                    <td className="p-3 text-right text-chart-1 font-mono">{midMargin}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard icon={IconPackage} title="Waterfall Example: $10K Vendor Cost at 20% Markup" color={companySectionColors.fees}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-muted rounded-lg p-3 border border-border text-center">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Vendor Cost</div>
            <div className="text-lg font-semibold font-mono text-foreground">${sampleVendorCost.toLocaleString()}</div>
          </div>
          <div className="bg-chart-1/10 rounded-lg p-3 border border-chart-1/20 text-center">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Markup (20%)</div>
            <div className="text-lg font-semibold font-mono text-chart-1">${(sampleVendorCost * 0.2).toLocaleString()}</div>
          </div>
          <div className="bg-primary/5 rounded-lg p-3 border border-primary/20 text-center">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Fee Charged</div>
            <div className="text-lg font-semibold font-mono text-foreground">${(sampleVendorCost * 1.2).toLocaleString()}</div>
          </div>
          <div className="bg-primary/10 rounded-lg p-3 border border-primary/20 text-center">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Eff. Margin</div>
            <div className="text-lg font-semibold font-mono text-primary">16.7%</div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          With a 20% cost-plus markup, for every $1.00 the company pays a vendor it charges $1.20, yielding a 16.7% effective margin on fee revenue.
        </p>
      </SectionCard>
    </div>
  );
}
