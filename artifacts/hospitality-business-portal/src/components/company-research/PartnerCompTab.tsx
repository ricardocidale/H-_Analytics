/**
 * PartnerCompTab.tsx — Partner compensation benchmarks for hotel management companies.
 *
 * Shows compensation ranges by firm type, AUM, and growth stage.
 */
import { IconUsers } from "@/components/icons";
import { SectionCard } from "../property-research/SectionCard";
import { MetricCard } from "../property-research/MetricCard";
import { companySectionColors } from "./types";

interface CompensationBenchmarks {
  gm?: string;
  director?: string;
  manager?: string;
  source?: string;
}

interface PartnerCompTabProps {
  content?: {
    compensationBenchmarks?: CompensationBenchmarks;
  };
}

const COMP_BENCHMARKS = [
  { role: "Managing Partner / CEO", startupRange: "$150K–$250K", growthRange: "$250K–$450K", matureRange: "$400K–$700K+", notes: "Includes base + bonus; may defer at startup for equity" },
  { role: "Operating Partner / COO", startupRange: "$120K–$200K", growthRange: "$200K–$350K", matureRange: "$300K–$500K", notes: "Operations lead; bonus tied to portfolio NOI growth" },
  { role: "VP of Finance / CFO", startupRange: "Outsourced", growthRange: "$150K–$250K", matureRange: "$250K–$400K", notes: "Often outsourced at startup; hired at 5+ properties" },
  { role: "VP of Revenue / CRO", startupRange: "Outsourced", growthRange: "$130K–$220K", matureRange: "$200K–$350K", notes: "Revenue management specialist; ROI typically 3-5x salary" },
  { role: "Regional Director", startupRange: "N/A", growthRange: "$100K–$160K", matureRange: "$140K–$220K", notes: "Added when geographic coverage exceeds one market" },
];

const COMP_STRUCTURES = [
  { structure: "Base + Annual Bonus", description: "60-70% base, 30-40% variable tied to portfolio performance metrics (NOI, RevPAR, EBITDA)." },
  { structure: "Carried Interest / Equity", description: "Partners may receive 10-20% carried interest in property investments; common at startup to offset lower cash comp." },
  { structure: "Per-Property Bonus", description: "$5K-$25K per new property onboarded; incentivizes pipeline development." },
  { structure: "Long-Term Incentive Plan", description: "Phantom equity or profit-sharing vesting over 3-5 years; retention tool at growth stage." },
];

export function PartnerCompTab({ content }: PartnerCompTabProps) {
  // If AI research has compensation data, overlay it
  const aiComp = content?.compensationBenchmarks;

  return (
    <div className="space-y-6">
      {aiComp && (
        <SectionCard icon={IconUsers} title="AI Research: Compensation Data" color={companySectionColors.compensation}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <MetricCard label="General Manager" value={aiComp.gm || "N/A"} color={companySectionColors.compensation} />
            <MetricCard label="Director Level" value={aiComp.director || "N/A"} color={companySectionColors.compensation} />
            <MetricCard label="Manager Level" value={aiComp.manager || "N/A"} color={companySectionColors.compensation} />
          </div>
          {aiComp.source && (
            <p className="text-xs text-muted-foreground">Source: {aiComp.source}</p>
          )}
        </SectionCard>
      )}

      <SectionCard icon={IconUsers} title="Partner Compensation by Growth Stage" color={companySectionColors.compensation}>
        <p className="text-xs text-muted-foreground mb-4">
          Total compensation ranges (base + bonus) for management company leadership by portfolio maturity.
        </p>
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted border-b border-border">
                <th className="text-left p-3 text-muted-foreground font-medium">Role</th>
                <th className="text-right p-3 text-muted-foreground font-medium">Startup</th>
                <th className="text-right p-3 text-muted-foreground font-medium">Growth</th>
                <th className="text-right p-3 text-muted-foreground font-medium">Mature</th>
              </tr>
            </thead>
            <tbody>
              {COMP_BENCHMARKS.map((c, i) => (
                <tr key={i} className="border-b border-border hover:bg-muted/50 transition-colors">
                  <td className="p-3">
                    <div className="text-foreground font-medium">{c.role}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{c.notes}</div>
                  </td>
                  <td className="p-3 text-right text-muted-foreground font-mono text-xs">{c.startupRange}</td>
                  <td className="p-3 text-right text-primary font-mono text-xs">{c.growthRange}</td>
                  <td className="p-3 text-right text-chart-1 font-mono text-xs">{c.matureRange}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard icon={IconUsers} title="Compensation Structures" color={companySectionColors.fees}>
        <div className="space-y-3">
          {COMP_STRUCTURES.map((s, i) => (
            <div key={i} className="bg-primary/5 rounded-lg p-3 border border-primary/10">
              <h5 className="text-sm font-medium text-foreground">{s.structure}</h5>
              <p className="text-xs text-muted-foreground mt-1">{s.description}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
