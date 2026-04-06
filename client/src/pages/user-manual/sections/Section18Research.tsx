import { SectionCard } from "@/components/ui/section-card";
import { IconBookOpen } from "@/components/icons";

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
      icon={IconBookOpen}
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
          <h4 className="font-semibold text-foreground mb-2">Context Packs</h4>
          <p className="mb-2">
            Before any AI research runs, the system assembles a <span className="font-medium text-foreground">context pack</span> —
            a structured bundle of everything the AI needs to produce accurate results. Context packs include:
          </p>
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-1.5">
            <p className="text-xs"><span className="font-medium text-foreground">Property profile:</span> <span className="text-muted-foreground">Name, location, market, room count, property type, ADR, and classification</span></p>
            <p className="text-xs"><span className="font-medium text-foreground">Comparable set:</span> <span className="text-muted-foreground">Similar properties matched by location, size, and type for benchmarking</span></p>
            <p className="text-xs"><span className="font-medium text-foreground">Market data:</span> <span className="text-muted-foreground">Regional occupancy, rate trends, supply changes, and economic indicators</span></p>
            <p className="text-xs"><span className="font-medium text-foreground">Historical performance:</span> <span className="text-muted-foreground">Prior-year actuals and assumptions for trend analysis</span></p>
            <p className="text-xs"><span className="font-medium text-foreground">Business constraints:</span> <span className="text-muted-foreground">Admin-defined rules and bounds that guide the AI's recommendations</span></p>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            The richer the context pack, the more precise the AI's recommendations. Admins can review context packs
            in the QA Sandbox before running research.
          </p>
        </div>

        <div>
          <h4 className="font-semibold text-foreground mb-2">Progressive Relaxation</h4>
          <p className="mb-2">
            When the AI cannot find enough comparable data for a property, it uses <span className="font-medium text-foreground">progressive relaxation</span> —
            a step-by-step widening of search criteria to ensure every property gets meaningful results:
          </p>
          <div className="space-y-1.5 ml-1">
            <div className="flex items-start gap-2">
              <span className="mt-1 w-4 h-4 rounded-full bg-emerald-500/15 flex items-center justify-center text-emerald-600 dark:text-emerald-400 text-[10px] font-bold shrink-0">1</span>
              <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Exact match</span> — Search for properties with the same type, size, and market</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-1 w-4 h-4 rounded-full bg-blue-500/15 flex items-center justify-center text-blue-600 dark:text-blue-400 text-[10px] font-bold shrink-0">2</span>
              <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Widen geography</span> — Expand to neighboring markets or the broader region</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-1 w-4 h-4 rounded-full bg-amber-500/15 flex items-center justify-center text-amber-600 dark:text-amber-400 text-[10px] font-bold shrink-0">3</span>
              <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Relax property type</span> — Include similar property categories (e.g., boutique to full-service)</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-1 w-4 h-4 rounded-full bg-red-500/15 flex items-center justify-center text-red-600 dark:text-red-400 text-[10px] font-bold shrink-0">4</span>
              <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Broaden size range</span> — Widen room-count tolerance to capture more comparables</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Each relaxation step is recorded in a <span className="font-medium text-foreground">relaxation trail</span>, visible
            in the research transparency panel on each property's research page. The trail shows exactly how the
            AI adapted its search, and the star rating reflects the quality of data found at each stage.
          </p>
        </div>

        <div>
          <h4 className="font-semibold text-foreground mb-2">Confidence & Star Rating System</h4>
          <p className="mb-3">
            Every research result receives a quality rating from 1 to 5 stars. This <span className="font-medium text-foreground">confidence score</span> indicates
            how much high-quality evidence supported the AI's conclusions. Higher stars mean more reliable data
            and less estimation:
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
          <p className="text-xs text-muted-foreground mt-2">
            When progressive relaxation is used, star ratings tend to decrease because the data is less directly
            comparable. A 3-star result with relaxation is still valuable — it means the AI found reasonable
            proxies even when exact comparables were unavailable.
          </p>
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
            <p className="text-xs"><span className="font-medium text-foreground">Scenario comparison:</span> <span className="text-muted-foreground">"Compare revenue between Base Case and Upside for my coastal properties"</span></p>
          </div>
          <div className="mt-3 space-y-2">
            <h5 className="font-medium text-foreground text-xs">Additional Features</h5>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-1.5">
              <p className="text-xs"><span className="font-medium text-foreground">Email summaries:</span> <span className="text-muted-foreground">Ask Rebecca to email you a summary of any analysis or research finding directly to your inbox</span></p>
              <p className="text-xs"><span className="font-medium text-foreground">Feedback loop:</span> <span className="text-muted-foreground">Rate Rebecca's responses with thumbs up/down to help improve future answers</span></p>
              <p className="text-xs"><span className="font-medium text-foreground">Conversation history:</span> <span className="text-muted-foreground">Rebecca remembers the context of your current session — ask follow-up questions naturally</span></p>
            </div>
          </div>
        </div>

        <div>
          <h4 className="font-semibold text-foreground mb-2">Research Transparency Panel</h4>
          <p>
            Every research result page includes a collapsible <span className="font-medium text-foreground">Methodology</span> panel
            that shows exactly how the research was generated. This includes the AI model used, the date of the
            last run, the star rating, the relaxation trail (if any search criteria were widened), and a list
            of the data sources consulted. Open this panel anytime you want to understand or verify the basis
            of an AI recommendation.
          </p>
        </div>

        <div>
          <h4 className="font-semibold text-foreground mb-2">Research FAQ</h4>
          <div className="space-y-3">
            {[
              { q: "How often should I refresh research?", a: "For active properties, monthly refreshes keep your assumptions current. Tier 2 refreshes are quick and cost-effective for routine updates." },
              { q: "Can research overwrite my manual edits?", a: "No. Research values appear as suggested badges on assumption fields. You always choose whether to accept them. Manual values are never overwritten automatically." },
              { q: "What data sources does the AI use?", a: "The system considers property characteristics, location data, comparable hotel sets, industry benchmarks, STR data, and any custom sources your admin has configured in the Source Registry." },
              { q: "Why do some assumptions show as 'stale'?", a: "Research becomes stale when it exceeds the configured freshness threshold (set by your admin in Pipeline Policies). A stale badge means the data may be outdated and should be refreshed." },
              { q: "What does the relaxation trail mean?", a: "The relaxation trail shows how the AI widened its search when exact comparables weren't available. Each step records what criteria was relaxed (geography, property type, or size range) so you can judge how closely the data matches your property." },
              { q: "Why is my property rated lower than others?", a: "Star ratings reflect data availability, not property quality. A property in a less-documented market may receive fewer stars because there are fewer comparable data points available, even though the research is still valuable." },
              { q: "Can I see the raw AI prompt?", a: "Admins can preview the full prompt and context pack in the QA Sandbox (Admin > QA Sandbox) before running research. This helps verify that the AI receives the right information." },
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
