import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PRIORITY_LABELS, type Priority } from "@/components/admin/icp-config";

export function fmt$(n: number): string {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n}`;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const colors: Record<Priority, string> = {
    must: "bg-primary/15 text-primary border-primary/20",
    major: "bg-chart-1/15 text-chart-1 border-chart-1/20",
    nice: "bg-accent-pop/15 text-accent-pop border-accent-pop/20",
    no: "bg-destructive/15 text-destructive border-destructive/20",
  };
  return (
    <Badge variant="outline" className={`text-[10px] ${colors[priority]}`}>
      {PRIORITY_LABELS[priority]}
    </Badge>
  );
}

export function DataCard({ label, value, badge }: { label: string; value: string; badge?: React.ReactNode }) {
  return (
    <Card className="bg-muted/30 border-border p-3 space-y-1">
      <div className="flex items-center gap-2">
        <p className="label-text text-muted-foreground uppercase tracking-wide text-[11px]">{label}</p>
        {badge}
      </div>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </Card>
  );
}

export function SectionHeading({ icon: Icon, title }: { icon: React.ComponentType<any>; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-primary" />
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
    </div>
  );
}

export const BENCHMARK_SOURCES = [
  {
    name: "HVS Management Agreement Study",
    description: "Industry-standard benchmarks for hotel management agreements — base fees, incentive fees, contract terms, and operator compensation structures.",
  },
  {
    name: "USALI (Uniform System of Accounts for the Lodging Industry)",
    description: "Standardized chart of accounts and departmental operating expense ratios for hotel financial reporting and benchmarking.",
  },
  {
    name: "CBRE Hotels Research",
    description: "Cap rate surveys, lending benchmarks, transaction data, and market-level performance metrics for hotel real estate.",
  },
  {
    name: "STR (Smith Travel Research)",
    description: "Occupancy, ADR, RevPAR trends, ramp-up benchmarks, and competitive set performance data for the lodging industry.",
  },
];
