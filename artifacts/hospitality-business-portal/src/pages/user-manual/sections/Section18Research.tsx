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
          <h4 className="font-semibold text-foreground mb-2">Research Badges</h4>
          <p className="mb-3">
            Every assumption field that has AI research available displays a <span className="font-medium text-foreground">Research Badge</span> —
            a small label showing the recommended market range. Badges appear next to the field label and provide
            quick access to intelligence without leaving the edit form.
          </p>
          <div className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-2">
            <p className="text-xs"><span className="font-medium text-foreground">Yellow pill badge:</span> <span className="text-muted-foreground">Shows the AI-recommended range (e.g., "55%–70%"). Hover for source and date, click to auto-fill the recommended value.</span></p>
            <p className="text-xs"><span className="font-medium text-foreground">Blue GAAP badge:</span> <span className="text-muted-foreground">Shows the GAAP or IRS rule governing this field. Hover to see the accounting standard and its implications. Always visible.</span></p>
            <p className="text-xs"><span className="font-medium text-foreground">Guidance arrow:</span> <span className="text-muted-foreground">Click the arrow icon next to any badge to open the Guidance Side Sheet with full details — P25/P50/P75 ranges, peer comparisons, methodology trail, and impact analysis.</span></p>
            <p className="text-xs"><span className="font-medium text-foreground">Gray badge:</span> <span className="text-muted-foreground">Not yet reviewed. Press the Analyst button to get guidance for this field.</span></p>
          </div>
          <h5 className="font-medium text-foreground text-xs mt-3">Range Badge Colors</h5>
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-1.5 mt-1">
            <p className="text-xs"><span className="font-medium text-foreground">Green:</span> <span className="text-muted-foreground">Your current value falls within the AI-researched range — your assumption is well-supported by market data.</span></p>
            <p className="text-xs"><span className="font-medium text-foreground">Yellow:</span> <span className="text-muted-foreground">Your value is near the edge of the researched range — consider reviewing against comparable properties.</span></p>
            <p className="text-xs"><span className="font-medium text-foreground">Red:</span> <span className="text-muted-foreground">Your value falls outside the researched range — this assumption may need adjustment or additional justification.</span></p>
            <p className="text-xs"><span className="font-medium text-foreground">Gray:</span> <span className="text-muted-foreground">Not yet reviewed. Press the Analyst button to get guidance.</span></p>
          </div>
        </div>

        <div>
          <h4 className="font-semibold text-foreground mb-2">Confidence Indicators</h4>
          <p className="mb-3">
            Each range badge includes a <span className="font-medium text-foreground">conviction level</span> (High, Moderate, or Developing)
            based on three factors:
          </p>
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-1.5">
            <p className="text-xs"><span className="font-medium text-foreground">Comparable count:</span> <span className="text-muted-foreground">More matching properties in the comp set increases confidence.</span></p>
            <p className="text-xs"><span className="font-medium text-foreground">Data freshness:</span> <span className="text-muted-foreground">Recent data from the last 30 days scores higher than older benchmarks.</span></p>
            <p className="text-xs"><span className="font-medium text-foreground">Source quality:</span> <span className="text-muted-foreground">Primary industry sources (STR, CBRE, HVS) carry more weight than secondary or scraped data.</span></p>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            The conviction level helps you gauge how much to trust the recommended range. High conviction means
            strong market evidence; Developing means the recommendation is based on limited or extrapolated data.
          </p>
        </div>

        <div>
          <h4 className="font-semibold text-foreground mb-2">Review Status</h4>
          <p className="mb-3">
            Analyst guidance has a limited shelf life. The app tracks how recently each assumption was reviewed and signals
            when it should be refreshed through a color-coded <span className="font-medium text-foreground">review status indicator</span>.
          </p>
          <div className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-2">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />
              <p className="text-xs"><span className="font-medium text-foreground">Up to date (green):</span> <span className="text-muted-foreground">Analyst review is current. No action needed.</span></p>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
              <p className="text-xs"><span className="font-medium text-foreground">Due for review (amber):</span> <span className="text-muted-foreground">Assumptions have changed or time has passed since the last review. Market conditions may have shifted — consider asking the analysts again.</span></p>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
              <p className="text-xs"><span className="font-medium text-foreground">Not yet reviewed (red):</span> <span className="text-muted-foreground">The Analyst hasn't reviewed these assumptions yet. Press the Analyst button to get guidance.</span></p>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
              <p className="text-xs"><span className="font-medium text-foreground">Reviewing (blue):</span> <span className="text-muted-foreground">The Analyst is currently reviewing assumptions for this property. Results will appear automatically when complete.</span></p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            The <span className="font-medium text-foreground">Review Status Bar</span> at the top of property and company
            assumption pages shows the overall review status at a glance — green when all reviews are current,
            amber when some reviews are due, red when assumptions haven't been reviewed yet, and blue when The Analyst is actively reviewing.
          </p>
          <h5 className="font-medium text-foreground text-xs mt-3">Review Thresholds</h5>
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-1.5 mt-1">
            <p className="text-xs"><span className="font-medium text-foreground">0–30 days:</span> <span className="text-muted-foreground">Analyst review is current (green). No action needed.</span></p>
            <p className="text-xs"><span className="font-medium text-foreground">30–90 days:</span> <span className="text-muted-foreground">Due for review (amber). Market conditions may have shifted — consider pressing the Analyst button to refresh.</span></p>
            <p className="text-xs"><span className="font-medium text-foreground">90+ days:</span> <span className="text-muted-foreground">Overdue (red). Guidance is likely outdated and should be refreshed before making investment decisions.</span></p>
          </div>
        </div>

        <div>
          <h4 className="font-semibold text-foreground mb-2">What Triggers Staleness</h4>
          <p className="mb-2">
            Research can become stale in two ways: by aging past the configured threshold, or when you change
            a <span className="font-medium text-foreground">key assumption</span> that invalidates previous research:
          </p>
          <div className="space-y-1.5 ml-1">
            <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Star rating change</span> — Luxury vs. Upper Upscale comparables are entirely different markets</p>
            <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Business model change</span> — Hotel, Lodge, and VRBO/STR have different expense structures and benchmarks</p>
            <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Hospitality type change</span> — Boutique vs. Extended Stay vs. Resort triggers new comp sets</p>
            <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Room count change</span> — A 10-room inn has different benchmarks than a 150-room hotel</p>
            <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Location change</span> — Market-level data is location-specific</p>
            <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">ADR change</span> — Significant rate changes may move the property into a different comp tier</p>
            <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Revenue share change</span> — Altering F&B or Events shares affects operating expense benchmarks</p>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            When a key assumption changes, the system marks all related research as stale. If the estimated
            refresh time is under 30 seconds, the system auto-regenerates in the background. Otherwise, the
            admin is notified to schedule a refresh.
          </p>
        </div>

        <div>
          <h4 className="font-semibold text-foreground mb-2">Applying Research Recommendations</h4>
          <p className="mb-2">
            Research never overwrites your values automatically. You always choose whether to accept a recommendation:
          </p>
          <div className="space-y-1.5 ml-1">
            <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">1. Review the badge</span> — The yellow pill next to the field label shows the AI-recommended range</p>
            <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">2. Click to apply</span> — Click the badge to auto-fill the P50 (median) value into the field</p>
            <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">3. Open the Guidance Sheet</span> — Click the arrow icon for full details: P25/P50/P75 ranges, peer comparisons, the relaxation trail, and impact analysis showing how the change would affect downstream metrics</p>
            <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">4. Choose your action</span> — Apply P25 (conservative), P50 (median), or P75 (aggressive); Pin (keep your current value); or Dismiss (hide the recommendation)</p>
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
              { q: "What data sources does the AI use?", a: "The system considers property characteristics, location data, comparable hotel sets, industry benchmarks, STR data, and any additional sources configured for your organization." },
              { q: "Why do some assumptions show as 'stale'?", a: "Research becomes stale when it exceeds the configured freshness threshold. A stale badge means the data may be outdated and should be refreshed." },
              { q: "What does the relaxation trail mean?", a: "The relaxation trail shows how the AI widened its search when exact comparables weren't available. Each step records what criteria was relaxed (geography, property type, or size range) so you can judge how closely the data matches your property." },
              { q: "Why is my property rated lower than others?", a: "Star ratings reflect data availability, not property quality. A property in a less-documented market may receive fewer stars because there are fewer comparable data points available, even though the research is still valuable." },
              { q: "Can I see the raw AI prompt?", a: "The full prompt and context pack can be previewed before running research to verify the AI receives the right information. Contact your administrator for access." },
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
