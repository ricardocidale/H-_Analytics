/**
 * OverheadBenchmarksTab.tsx — G&A overhead benchmarks for management companies.
 *
 * Shows fixed and variable overhead norms at different portfolio scales,
 * using the company assumption seed defaults as baseline benchmarks.
 */
import { IconBuilding2 } from "@/components/icons";
import { SectionCard } from "../property-research/SectionCard";
import { MetricCard } from "../property-research/MetricCard";
import { companySectionColors } from "./types";

interface OverheadBenchmarksTabProps {
  content: any;
}

const OVERHEAD_BENCHMARKS = [
  { category: "Office Lease", range: "$24K–$48K/yr", note: "Scales with team size; shared or virtual offices at small scale" },
  { category: "Professional Services", range: "$18K–$36K/yr", note: "Legal, accounting, audit; increases with property count and regulatory complexity" },
  { category: "Technology Infrastructure", range: "$12K–$24K/yr", note: "Cloud PMS, BI tools, cybersecurity; per-seat licensing adds to cost" },
  { category: "Travel per Client", range: "$8K–$18K/yr per property", note: "Owner meetings, site visits, brand audits; higher for remote properties" },
  { category: "IT/Licensing per Client", range: "$2K–$5K/yr per property", note: "PMS, RMS, channel manager licenses allocated per property" },
  { category: "Marketing (% of fee revenue)", range: "3%–8%", note: "Brand marketing, digital advertising, PR; higher at startup stage" },
  { category: "Misc Operations (% of fee revenue)", range: "2%–5%", note: "Catch-all for admin, training materials, supplies" },
];

const SCALE_BENCHMARKS = [
  { stage: "Startup (1–3 properties)", gaPct: "35–50%", staffFTE: "2–3", notes: "High overhead-to-revenue ratio; founder-led, lean team" },
  { stage: "Growth (4–8 properties)", gaPct: "20–30%", staffFTE: "4–6", notes: "Economies of scale emerging; specialist hires (revenue mgr, marketer)" },
  { stage: "Mature (9+ properties)", gaPct: "12–20%", staffFTE: "7–12", notes: "Full functional team; overhead ratio stabilizes" },
];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function OverheadBenchmarksTab({ content }: OverheadBenchmarksTabProps) {
  return (
    <div className="space-y-6">
      <SectionCard icon={IconBuilding2} title="Fixed & Variable Overhead Benchmarks" color={companySectionColors.compensation}>
        <p className="text-xs text-muted-foreground mb-4">
          Typical G&A cost ranges for boutique hotel management companies.
        </p>
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted border-b border-border">
                <th className="text-left p-3 text-muted-foreground font-medium">Category</th>
                <th className="text-right p-3 text-muted-foreground font-medium">Range</th>
                <th className="text-left p-3 text-muted-foreground font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {OVERHEAD_BENCHMARKS.map((b, i) => (
                <tr key={i} className="border-b border-border hover:bg-muted/50 transition-colors">
                  <td className="p-3 text-foreground font-medium">{b.category}</td>
                  <td className="p-3 text-right text-primary font-mono font-medium whitespace-nowrap">{b.range}</td>
                  <td className="p-3 text-muted-foreground text-xs">{b.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard icon={IconBuilding2} title="Overhead by Portfolio Scale" color={companySectionColors.benchmarks}>
        <p className="text-xs text-muted-foreground mb-4">
          How G&A overhead ratio and staffing change as the portfolio grows.
        </p>
        <div className="space-y-4">
          {SCALE_BENCHMARKS.map((s, i) => (
            <div key={i} className="bg-card rounded-lg border border-border p-4">
              <h4 className="text-sm font-medium text-foreground mb-2">{s.stage}</h4>
              <div className="grid grid-cols-3 gap-3">
                <MetricCard label="G&A % of Revenue" value={s.gaPct} color={companySectionColors.compensation} />
                <MetricCard label="Staff FTE" value={s.staffFTE} color={companySectionColors.benchmarks} />
                <MetricCard label="Key Insight" value={s.notes} color={companySectionColors.sources} />
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
