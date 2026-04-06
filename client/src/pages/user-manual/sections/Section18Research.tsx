import { SectionCard } from "@/components/ui/section-card";
import { IconBot } from "@/components/icons";

interface SectionProps {
  expanded: boolean;
  onToggle: () => void;
  sectionRef: (el: HTMLDivElement | null) => void;
}

export default function Section18Research({ expanded, onToggle, sectionRef }: SectionProps) {
  return (
    <SectionCard
      id="research-intelligence"
      title="18. Research & Intelligence"
      icon={IconBot}
      variant="light"
      expanded={expanded}
      onToggle={onToggle}
      sectionRef={sectionRef}
    >
      <div className="space-y-6 text-sm text-foreground/90 leading-relaxed">
        <div>
          <h4 className="font-semibold text-foreground mb-2">How Research Works</h4>
          <p>
            H+ Analytics uses a tiered AI research system to gather market intelligence for every property
            and the management company. Research is generated from multiple data sources and synthesized
            into actionable assumption guidance.
          </p>
        </div>

        <div className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-3">
          <h5 className="font-medium text-foreground text-xs uppercase tracking-wider">Research Tiers</h5>
          <div className="space-y-2">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center text-primary text-xs font-bold shrink-0">0</span>
              <div>
                <span className="font-medium text-foreground">Baseline (Tier 0)</span>
                <p className="text-muted-foreground text-xs mt-0.5">System defaults and seed values. No AI involvement — these are the starting point for every assumption.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 w-6 h-6 rounded-md bg-blue-500/15 flex items-center justify-center text-blue-600 dark:text-blue-400 text-xs font-bold shrink-0">1</span>
              <div>
                <span className="font-medium text-foreground">Full Research (Tier 1)</span>
                <p className="text-muted-foreground text-xs mt-0.5">Comprehensive AI analysis using all available context — property details, market data, comparable sets, and benchmark databases.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 w-6 h-6 rounded-md bg-emerald-500/15 flex items-center justify-center text-emerald-600 dark:text-emerald-400 text-xs font-bold shrink-0">2</span>
              <div>
                <span className="font-medium text-foreground">Quick Refresh (Tier 2)</span>
                <p className="text-muted-foreground text-xs mt-0.5">Targeted update of specific assumptions using the latest data. Faster and more cost-effective than full research.</p>
              </div>
            </div>
          </div>
        </div>

        <div>
          <h4 className="font-semibold text-foreground mb-2">Star Rating System</h4>
          <p className="mb-3">
            Every research result receives a quality rating from 1 to 5 stars, indicating how much
            high-quality evidence supported the AI's conclusions:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { stars: 5, label: "Excellent", desc: "Multiple independent sources confirm the value" },
              { stars: 4, label: "Good", desc: "Strong evidence from reliable sources" },
              { stars: 3, label: "Fair", desc: "Moderate evidence; some extrapolation used" },
              { stars: 2, label: "Limited", desc: "Few sources; significant estimation involved" },
              { stars: 1, label: "Estimate", desc: "Insufficient data; value is a best-guess estimate" },
            ].map(r => (
              <div key={r.stars} className="flex items-start gap-2 rounded-lg border border-border/40 bg-card/50 p-2.5">
                <span className="text-amber-500 text-sm whitespace-nowrap">{"★".repeat(r.stars)}{"☆".repeat(5 - r.stars)}</span>
                <div>
                  <span className="font-medium text-xs text-foreground">{r.label}</span>
                  <p className="text-[11px] text-muted-foreground">{r.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h4 className="font-semibold text-foreground mb-2">Rebecca — Your AI Research Assistant</h4>
          <p className="mb-2">
            Rebecca is the built-in AI chat assistant that helps you understand your financial data.
            She can answer questions about any property, compare scenarios, explain assumptions,
            and walk you through research findings.
          </p>
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-1.5">
            <p className="text-xs"><span className="font-medium text-foreground">Ask about research:</span> <span className="text-muted-foreground">"What were the key findings for Hotel Marina?"</span></p>
            <p className="text-xs"><span className="font-medium text-foreground">Compare properties:</span> <span className="text-muted-foreground">"How does occupancy compare between my downtown hotels?"</span></p>
            <p className="text-xs"><span className="font-medium text-foreground">Explain assumptions:</span> <span className="text-muted-foreground">"Why is the ADR for Property X set to $180?"</span></p>
            <p className="text-xs"><span className="font-medium text-foreground">Financial analysis:</span> <span className="text-muted-foreground">"Show me the NOI trend for the portfolio"</span></p>
          </div>
        </div>

        <div>
          <h4 className="font-semibold text-foreground mb-2">Research FAQ</h4>
          <div className="space-y-3">
            {[
              { q: "How often should I refresh research?", a: "For active properties, monthly refreshes keep your assumptions current. Tier 2 refreshes are quick and cost-effective for routine updates." },
              { q: "Can research overwrite my manual edits?", a: "No. Research values appear as suggested badges on assumption fields. You always choose whether to accept them. Manual values are never overwritten automatically." },
              { q: "What data sources does the AI use?", a: "The system considers property characteristics, location data, comparable hotel sets, industry benchmarks, STR data, and any custom sources your admin has configured." },
              { q: "Why do some assumptions show as 'stale'?", a: "Research becomes stale when it exceeds the configured freshness threshold (set by your admin in Pipeline Policies). A stale badge means the data may be outdated and should be refreshed." },
            ].map((item, i) => (
              <div key={i} className="rounded-lg border border-border/40 bg-card/50 p-3">
                <p className="font-medium text-xs text-foreground mb-1">{item.q}</p>
                <p className="text-xs text-muted-foreground">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
