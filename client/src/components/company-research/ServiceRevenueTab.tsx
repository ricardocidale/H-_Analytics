/**
 * ServiceRevenueTab.tsx — Service revenue benchmarks for the management company.
 *
 * Shows what to charge for each service type based on industry data.
 * Uses deterministic tools from calc/research for fee range computations.
 */
import { useMemo } from "react";
import { IconDollarSign } from "@/components/icons";
import { SectionCard } from "../property-research/SectionCard";
import { MetricCard } from "../property-research/MetricCard";
import { companySectionColors } from "./types";
import { computeServiceFee } from "@calc/research/service-fee";

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

interface ServiceRevenueTabProps {
  content: any;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ServiceRevenueTab({ content }: ServiceRevenueTabProps) {
  const sampleRevenue = 1_500_000;

  const benchmarks = useMemo(() =>
    SERVICE_TYPES.map(type => ({
      type,
      label: LABELS[type] || type,
      ...computeServiceFee({ propertyRevenue: sampleRevenue, serviceType: type }),
    })),
  []);

  return (
    <div className="space-y-6">
      <SectionCard icon={IconDollarSign} title="Service Fee Benchmarks" color={companySectionColors.fees}>
        <p className="text-xs text-muted-foreground mb-4">
          Industry fee ranges per service type, computed at $1.5M sample property revenue.
        </p>
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted border-b border-border">
                <th className="text-left p-3 text-muted-foreground font-medium">Service</th>
                <th className="text-right p-3 text-muted-foreground font-medium">Low Rate</th>
                <th className="text-right p-3 text-muted-foreground font-medium">Mid Rate</th>
                <th className="text-right p-3 text-muted-foreground font-medium">High Rate</th>
                <th className="text-right p-3 text-muted-foreground font-medium">Annual Fee (Mid)</th>
              </tr>
            </thead>
            <tbody>
              {benchmarks.map(b => (
                <tr key={b.type} className="border-b border-border hover:bg-muted/50 transition-colors">
                  <td className="p-3 text-foreground font-medium">{b.label}</td>
                  <td className="p-3 text-right text-muted-foreground font-mono">{(b.lowRate * 100).toFixed(1)}%</td>
                  <td className="p-3 text-right text-primary font-mono font-medium">{(b.midRate * 100).toFixed(1)}%</td>
                  <td className="p-3 text-right text-muted-foreground font-mono">{(b.highRate * 100).toFixed(1)}%</td>
                  <td className="p-3 text-right text-foreground font-mono">${b.midFee.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {benchmarks.map(b => (
        <div key={b.type} className="bg-card rounded-lg border border-border p-4">
          <h4 className="text-sm font-medium text-foreground mb-2">{b.label}</h4>
          <div className="grid grid-cols-3 gap-3 mb-2">
            <MetricCard label="Low" value={`${(b.lowRate * 100).toFixed(1)}% ($${b.lowFee.toLocaleString()})`} color={companySectionColors.fees} />
            <MetricCard label="Mid" value={`${(b.midRate * 100).toFixed(1)}% ($${b.midFee.toLocaleString()})`} color={companySectionColors.fees} />
            <MetricCard label="High" value={`${(b.highRate * 100).toFixed(1)}% ($${b.highFee.toLocaleString()})`} color={companySectionColors.fees} />
          </div>
          <p className="text-xs text-muted-foreground">{b.notes}</p>
        </div>
      ))}
    </div>
  );
}
