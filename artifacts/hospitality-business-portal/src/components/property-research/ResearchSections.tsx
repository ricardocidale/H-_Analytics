/**
 * ResearchSections.tsx — Renders all AI-generated research for a property.
 *
 * Takes the parsed research JSON (produced by useResearchStream) and maps
 * each category to a SectionCard + MetricCard layout:
 *
 *   • Market Overview       – macro market data, tourism stats, demand drivers
 *   • ADR Analysis          – nightly-rate benchmarks vs. comp set
 *   • Occupancy Analysis    – seasonal occupancy patterns, ramp-up timing
 *   • Events & Demand       – local events that drive transient/group demand
 *   • Cap Rate Analysis     – capitalization rate comps for the submarket
 *   • Competitive Landscape – identified competitor properties
 *   • Risk Factors          – market, operational, and regulatory risks
 *   • Stabilization         – expected timeline to reach stabilized occupancy
 *   • Land Value            – underlying land valuation for the basis split
 *   • Catering              – F&B / wedding / event revenue potential
 *   • Operating Costs       – USALI-based operating cost benchmarks
 *   • Property Value Costs  – property tax rate analysis
 *   • Management Fees       – management and service fee benchmarks
 *   • Income Tax            – income tax rate analysis
 *   • Sources               – citations for the AI-generated data
 *
 * Each section is conditionally rendered only if the research JSON includes
 * data for that category; sections stream in progressively as the LLM
 * generates more content.
 */
import { IconTrendingUp, IconBuilding2, IconCalendar, IconUsers, IconAlertTriangle, IconBookOpen, IconTarget, IconClock, IconShield, IconMountain, IconUtensilsCrossed, IconWallet, IconHome, IconBriefcase, IconReceipt, IconCalculator } from "@/components/icons";
import { SectionCard } from "./SectionCard";
import { MetricCard } from "./MetricCard";
import { sectionColors } from "./types";

interface KeyMetric { label: string; value: string; source?: string; }
interface StabilizationPhase { phase: string; duration: string; description: string; occupancyTarget?: string; }
interface AdrComparable { name: string; adr: string; type: string; }
interface SeasonalEntry { season: string; occupancy: string; notes: string; }
interface CapRateComparable { name: string; capRate: string; saleYear: string | number; notes: string; }
interface CompetitorEntry { name: string; rooms: string | number; adr: string; positioning: string; }
interface RiskEntry { risk: string; mitigation: string; }
interface RatedItem { recommendedRate?: string; confidence?: string; rationale?: string; industryRange?: string; }

interface PropertyResearchContent {
  marketOverview?: { summary?: string; keyMetrics?: KeyMetric[] };
  stabilizationTimeline?: { summary?: string; phases?: StabilizationPhase[]; totalMonths?: string };
  adrAnalysis?: { marketAverage?: string; boutiqueRange?: string; recommendedRange?: string; confidence?: string; rationale?: string; comparables?: AdrComparable[] };
  occupancyAnalysis?: { marketAverage?: string; rampUpTimeline?: string; confidence?: string; seasonalPattern?: SeasonalEntry[] };
  eventDemand?: { corporateEvents?: string; exoticEvents?: string; wellnessRetreats?: string; weddingsPrivate?: string; estimatedEventRevShare?: string; keyDrivers?: string[] };
  cateringAnalysis?: { recommendedBoostPercent?: string; marketRange?: string; confidence?: string; rationale?: string; eventMixBreakdown?: { fullyCatered?: string; partiallyCatered?: string; noCatering?: string }; factors?: string[] };
  capRateAnalysis?: { marketRange?: string; boutiqueRange?: string; recommendedRange?: string; confidence?: string; rationale?: string; comparables?: CapRateComparable[] };
  landValueAllocation?: { recommendedPercent?: string; marketRange?: string; assessmentMethod?: string; confidence?: string; rationale?: string; factors?: string[] };
  operatingCostAnalysis?: { totalOperatingCostRatio?: string; roomRevenueBased?: { housekeeping?: RatedItem; fbCostOfSales?: RatedItem }; totalRevenueBased?: Record<string, RatedItem>; sources?: string[] };
  propertyValueCostAnalysis?: { propertyTaxes?: RatedItem };
  managementServiceFeeAnalysis?: Record<string, RatedItem | undefined>;
  incomeTaxAnalysis?: { recommendedRate?: string; confidence?: string; effectiveRange?: string; calculationMethodology?: string; rateBreakdown?: { federal?: string; state?: string; local?: string }; rationale?: string; factors?: string[] };
  competitiveSet?: CompetitorEntry[];
  risks?: RiskEntry[];
  sources?: string[];
}

export function ResearchSections({ content }: { content: PropertyResearchContent }) {
  return (
    <div className="space-y-5">
      {content.marketOverview && (
        <SectionCard icon={IconBuilding2} title="Market Overview" color={sectionColors.market}>
          <p className="text-sm text-foreground leading-relaxed mb-5">{content.marketOverview.summary}</p>
          {content.marketOverview.keyMetrics && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {content.marketOverview.keyMetrics.map((m: KeyMetric, i: number) => (
                <MetricCard key={i} label={m.label} value={m.value} source={m.source} color={sectionColors.market} />
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {content.stabilizationTimeline && (
        <SectionCard icon={IconClock} title="Stabilization Timeline" color={sectionColors.stabilization}>
          <p className="text-sm text-foreground leading-relaxed mb-5">{content.stabilizationTimeline.summary}</p>
          {content.stabilizationTimeline.phases && content.stabilizationTimeline.phases.length > 0 && (
            <div className="space-y-3">
              {content.stabilizationTimeline.phases.map((phase: StabilizationPhase, i: number) => (
                <div key={i} className="flex gap-4 items-start">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-accent-pop/15 border-2 border-accent-pop/30 flex items-center justify-center">
                    <span className="text-sm font-bold text-accent-pop">{i + 1}</span>
                  </div>
                  <div className="flex-1 rounded-xl bg-accent-pop/10 border border-accent-pop/20 p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-foreground">{phase.phase}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-accent-pop/20 text-accent-pop font-medium">{phase.duration}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{phase.description}</p>
                    {phase.occupancyTarget && (
                      <p className="text-xs text-accent-pop mt-1 font-medium">Target Occupancy: {phase.occupancyTarget}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {content.stabilizationTimeline.totalMonths && (
            <div className="mt-4 rounded-xl bg-accent-pop/15 border border-accent-pop/30 p-4 text-center">
              <p className="text-xs text-accent-pop uppercase tracking-wider font-medium mb-1">Estimated Time to Stabilization</p>
              <p className="text-2xl font-bold text-accent-pop">{content.stabilizationTimeline.totalMonths}</p>
            </div>
          )}
        </SectionCard>
      )}

      {content.adrAnalysis && (
        <SectionCard icon={IconTrendingUp} title="ADR Analysis" color={sectionColors.adr}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
            <MetricCard label="Market Average ADR" value={content.adrAnalysis.marketAverage || "N/A"} color={sectionColors.adr} />
            <MetricCard label="Boutique Range" value={content.adrAnalysis.boutiqueRange || "N/A"} color={sectionColors.adr} />
            <MetricCard label="Recommended Range" value={content.adrAnalysis.recommendedRange || "N/A"} color={sectionColors.adr} confidence={content.adrAnalysis.confidence} />
          </div>
          {content.adrAnalysis.rationale && (
            <div className="bg-chart-1/10 rounded-xl p-4 border-l-4 border-chart-1/40 mb-5">
              <p className="text-sm text-foreground leading-relaxed">{content.adrAnalysis.rationale}</p>
            </div>
          )}
          {content.adrAnalysis.comparables && content.adrAnalysis.comparables.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-3">Comparable Properties</h4>
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-chart-1/8">
                      <th className="text-left p-3 text-muted-foreground font-semibold">Property</th>
                      <th className="text-right p-3 text-muted-foreground font-semibold">ADR</th>
                      <th className="text-left p-3 text-muted-foreground font-semibold">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {content.adrAnalysis.comparables.map((c, i: number) => (
                      <tr key={i} className="border-t border-border hover:bg-chart-1/5 transition-colors">
                        <td className="p-3 text-foreground font-medium">{c.name}</td>
                        <td className="p-3 text-right font-semibold text-chart-1">{c.adr}</td>
                        <td className="p-3 text-muted-foreground">{c.type}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </SectionCard>
      )}

      {content.occupancyAnalysis && (
        <SectionCard icon={IconCalendar} title="Occupancy Analysis" color={sectionColors.occupancy}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
            <MetricCard label="Market Average" value={content.occupancyAnalysis.marketAverage || "N/A"} color={sectionColors.occupancy} confidence={content.occupancyAnalysis.confidence} />
            <MetricCard label="Ramp-Up Timeline" value={content.occupancyAnalysis.rampUpTimeline || "N/A"} color={sectionColors.occupancy} />
          </div>
          {content.occupancyAnalysis.seasonalPattern && content.occupancyAnalysis.seasonalPattern.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-3">Seasonal Pattern</h4>
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-chart-3/8">
                      <th className="text-left p-3 text-muted-foreground font-semibold">Season</th>
                      <th className="text-right p-3 text-muted-foreground font-semibold">Occupancy</th>
                      <th className="text-left p-3 text-muted-foreground font-semibold">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {content.occupancyAnalysis.seasonalPattern.map((s: SeasonalEntry, i: number) => (
                      <tr key={i} className="border-t border-border hover:bg-chart-3/5 transition-colors">
                        <td className="p-3 text-foreground font-medium">{s.season}</td>
                        <td className="p-3 text-right font-semibold text-chart-3">{s.occupancy}</td>
                        <td className="p-3 text-muted-foreground">{s.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </SectionCard>
      )}

      {content.eventDemand && (
        <SectionCard icon={IconUsers} title="Event & Experience Demand" color={sectionColors.events}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
            {content.eventDemand.corporateEvents && (
              <div className="rounded-xl border border-accent-pop/20 bg-accent-pop/10 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-accent-pop/20 text-accent-pop font-semibold uppercase tracking-wider">Corporate</span>
                </div>
                <p className="text-sm text-foreground leading-relaxed">{content.eventDemand.corporateEvents}</p>
              </div>
            )}
            {content.eventDemand.exoticEvents && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-destructive/20 text-destructive font-semibold uppercase tracking-wider">Exotic & Unique</span>
                </div>
                <p className="text-sm text-foreground leading-relaxed">{content.eventDemand.exoticEvents}</p>
              </div>
            )}
            {content.eventDemand.wellnessRetreats && (
              <div className="rounded-xl border border-accent-pop-2/20 bg-accent-pop-2/10 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-accent-pop-2/20 text-accent-pop-2 font-semibold uppercase tracking-wider">Wellness</span>
                </div>
                <p className="text-sm text-foreground leading-relaxed">{content.eventDemand.wellnessRetreats}</p>
              </div>
            )}
            {content.eventDemand.weddingsPrivate && (
              <div className="rounded-xl border border-line-5/20 bg-line-5/10 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-line-5/20 text-line-5 font-semibold uppercase tracking-wider">Weddings & Private</span>
                </div>
                <p className="text-sm text-foreground leading-relaxed">{content.eventDemand.weddingsPrivate}</p>
              </div>
            )}
          </div>
          {content.eventDemand.estimatedEventRevShare && (
            <div className="rounded-xl bg-accent-pop/15 border border-accent-pop/30 p-3 text-center mb-5">
              <p className="text-xs text-accent-pop uppercase tracking-wider font-medium mb-0.5">Estimated Event Revenue Share</p>
              <p className="text-lg font-bold text-accent-pop">{content.eventDemand.estimatedEventRevShare}</p>
            </div>
          )}
          {content.eventDemand.keyDrivers && content.eventDemand.keyDrivers.length > 0 && (
            <div className="bg-muted rounded-xl p-4 border border-border">
              <h4 className="text-sm font-semibold text-foreground mb-3">Key Demand Drivers</h4>
              <ul className="space-y-2">
                {content.eventDemand.keyDrivers.map((d: string, i: number) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2.5">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-accent-pop/15 flex items-center justify-center mt-0.5">
                      <span className="text-xs font-bold text-accent-pop">{i + 1}</span>
                    </span>
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </SectionCard>
      )}

      {content.cateringAnalysis && (
        <SectionCard icon={IconUtensilsCrossed} title="Catering & F&B Boost Analysis" color={sectionColors.catering}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
            <MetricCard label="Recommended Boost" value={content.cateringAnalysis.recommendedBoostPercent || "N/A"} color={sectionColors.catering} confidence={content.cateringAnalysis.confidence} />
            <MetricCard label="Market Range" value={content.cateringAnalysis.marketRange || "N/A"} color={sectionColors.catering} />
            <div className="rounded-xl p-4 border border-chart-3/20 bg-chart-3/10">
              <p className="text-xs font-medium uppercase tracking-wider mb-1.5 text-muted-foreground">Formula</p>
              <p className="text-sm font-mono text-foreground">Total F&B = Base F&B × (1 + Boost%)</p>
            </div>
          </div>
          {content.cateringAnalysis.rationale && (
            <div className="bg-muted rounded-xl p-4 border border-border mb-5">
              <h4 className="text-sm font-semibold text-foreground mb-2">Rationale</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">{content.cateringAnalysis.rationale}</p>
            </div>
          )}
          {content.cateringAnalysis.eventMixBreakdown && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
              {content.cateringAnalysis.eventMixBreakdown.fullyCatered && (
                <div className="rounded-xl border border-chart-3/20 bg-chart-3/10 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-chart-3/20 text-chart-3 font-semibold uppercase tracking-wider">Fully Catered</span>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed">{content.cateringAnalysis.eventMixBreakdown.fullyCatered}</p>
                </div>
              )}
              {content.cateringAnalysis.eventMixBreakdown.partiallyCatered && (
                <div className="rounded-xl border border-chart-3/20 bg-chart-3/10 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-chart-3/20 text-chart-3 font-semibold uppercase tracking-wider">Partially Catered</span>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed">{content.cateringAnalysis.eventMixBreakdown.partiallyCatered}</p>
                </div>
              )}
              {content.cateringAnalysis.eventMixBreakdown.noCatering && (
                <div className="rounded-xl border border-border bg-muted p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-foreground font-semibold uppercase tracking-wider">No Catering</span>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed">{content.cateringAnalysis.eventMixBreakdown.noCatering}</p>
                </div>
              )}
            </div>
          )}
          {content.cateringAnalysis.factors && content.cateringAnalysis.factors.length > 0 && (
            <div className="bg-muted rounded-xl p-4 border border-border">
              <h4 className="text-sm font-semibold text-foreground mb-3">Key Factors</h4>
              <ul className="space-y-2">
                {content.cateringAnalysis.factors.map((f: string, i: number) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2.5">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-chart-3/15 flex items-center justify-center mt-0.5">
                      <span className="text-xs font-bold text-chart-3">{i + 1}</span>
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </SectionCard>
      )}

      {content.capRateAnalysis && (
        <SectionCard icon={IconTarget} title="Cap Rate Analysis" color={sectionColors.capRate}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
            <MetricCard label="Market Range" value={content.capRateAnalysis.marketRange || "N/A"} color={sectionColors.capRate} />
            <MetricCard label="Boutique Range" value={content.capRateAnalysis.boutiqueRange || "N/A"} color={sectionColors.capRate} />
            <MetricCard label="Recommended Range" value={content.capRateAnalysis.recommendedRange || "N/A"} color={sectionColors.capRate} confidence={content.capRateAnalysis.confidence} />
          </div>
          {content.capRateAnalysis.rationale && (
            <div className="bg-accent-pop-2/10 rounded-xl p-4 border-l-4 border-accent-pop-2/40 mb-5">
              <p className="text-sm text-foreground leading-relaxed" data-testid="text-cap-rate-rationale">{content.capRateAnalysis.rationale}</p>
            </div>
          )}
          {content.capRateAnalysis.comparables && content.capRateAnalysis.comparables.length > 0 && (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-accent-pop-2/8">
                    <th className="text-left p-3 text-muted-foreground font-semibold">Property</th>
                    <th className="text-right p-3 text-muted-foreground font-semibold">Cap Rate</th>
                    <th className="text-right p-3 text-muted-foreground font-semibold">Sale Year</th>
                    <th className="text-left p-3 text-muted-foreground font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {content.capRateAnalysis.comparables.map((c, i: number) => (
                    <tr key={i} className="border-t border-border hover:bg-accent-pop-2/5 transition-colors" data-testid={`row-cap-rate-comp-${i}`}>
                      <td className="p-3 text-foreground font-medium">{c.name}</td>
                      <td className="p-3 text-right font-semibold text-accent-pop-2">{c.capRate}</td>
                      <td className="p-3 text-right text-muted-foreground">{c.saleYear}</td>
                      <td className="p-3 text-muted-foreground">{c.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      {content.landValueAllocation && (
        <SectionCard icon={IconMountain} title="Land Value Allocation" color={sectionColors.landValue}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
            <MetricCard label="Recommended Land %" value={content.landValueAllocation.recommendedPercent || "N/A"} color={sectionColors.landValue} confidence={content.landValueAllocation.confidence} />
            <MetricCard label="Market Range" value={content.landValueAllocation.marketRange || "N/A"} color={sectionColors.landValue} />
            <MetricCard label="Assessment Method" value={content.landValueAllocation.assessmentMethod || "N/A"} color={sectionColors.landValue} />
          </div>
          {content.landValueAllocation.rationale && (
            <div className="bg-muted rounded-xl p-4 border-l-4 border-muted-foreground/40 mb-5">
              <p className="text-sm text-foreground leading-relaxed">{content.landValueAllocation.rationale}</p>
            </div>
          )}
          {content.landValueAllocation.factors && content.landValueAllocation.factors.length > 0 && (
            <div className="bg-muted rounded-xl p-4 border border-border">
              <h4 className="text-sm font-semibold text-foreground mb-3">Key Factors</h4>
              <ul className="space-y-2">
                {content.landValueAllocation.factors.map((f: string, i: number) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2.5">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-muted flex items-center justify-center mt-0.5">
                      <span className="text-xs font-bold text-muted-foreground">{i + 1}</span>
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </SectionCard>
      )}

      {content.operatingCostAnalysis && (
        <SectionCard icon={IconWallet} title="Operating Cost Analysis" color={sectionColors.operatingCosts}>
          {content.operatingCostAnalysis.totalOperatingCostRatio && (
            <div className="rounded-xl bg-line-3/15 border border-line-3/30 p-3 text-center mb-5">
              <p className="text-xs text-line-3 uppercase tracking-wider font-medium mb-0.5">Total Operating Cost Ratio</p>
              <p className="text-2xl font-bold text-line-3">{content.operatingCostAnalysis.totalOperatingCostRatio}</p>
            </div>
          )}
          {content.operatingCostAnalysis.roomRevenueBased && (
            <div className="mb-5">
              <h4 className="text-sm font-semibold text-foreground mb-3">Room Revenue-Based Costs</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {content.operatingCostAnalysis.roomRevenueBased.housekeeping && (
                  <div className={`rounded-xl p-4 border ${sectionColors.operatingCosts.border} ${sectionColors.operatingCosts.bg}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Housekeeping</p>
                      {content.operatingCostAnalysis.roomRevenueBased.housekeeping.industryRange && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-line-3/15 text-line-3 font-medium">{content.operatingCostAnalysis.roomRevenueBased.housekeeping.industryRange}</span>
                      )}
                    </div>
                    <MetricCard label="Recommended Rate" value={content.operatingCostAnalysis.roomRevenueBased.housekeeping.recommendedRate || "N/A"} color={sectionColors.operatingCosts} confidence={content.operatingCostAnalysis.roomRevenueBased.housekeeping.confidence} />
                    {content.operatingCostAnalysis.roomRevenueBased.housekeeping.rationale && (
                      <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{content.operatingCostAnalysis.roomRevenueBased.housekeeping.rationale}</p>
                    )}
                  </div>
                )}
                {content.operatingCostAnalysis.roomRevenueBased.fbCostOfSales && (
                  <div className={`rounded-xl p-4 border ${sectionColors.operatingCosts.border} ${sectionColors.operatingCosts.bg}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">F&B Cost of Sales</p>
                      {content.operatingCostAnalysis.roomRevenueBased.fbCostOfSales.industryRange && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-line-3/15 text-line-3 font-medium">{content.operatingCostAnalysis.roomRevenueBased.fbCostOfSales.industryRange}</span>
                      )}
                    </div>
                    <MetricCard label="Recommended Rate" value={content.operatingCostAnalysis.roomRevenueBased.fbCostOfSales.recommendedRate || "N/A"} color={sectionColors.operatingCosts} confidence={content.operatingCostAnalysis.roomRevenueBased.fbCostOfSales.confidence} />
                    {content.operatingCostAnalysis.roomRevenueBased.fbCostOfSales.rationale && (
                      <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{content.operatingCostAnalysis.roomRevenueBased.fbCostOfSales.rationale}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          {content.operatingCostAnalysis.totalRevenueBased && (
            <div className="mb-5">
              <h4 className="text-sm font-semibold text-foreground mb-3">Total Revenue-Based Costs</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {Object.entries(content.operatingCostAnalysis.totalRevenueBased).map(([key, item]: [string, any]) => (
                  <div key={key} className={`rounded-xl p-4 border ${sectionColors.operatingCosts.border} ${sectionColors.operatingCosts.bg}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())}</p>
                      {item.industryRange && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-line-3/15 text-line-3 font-medium">{item.industryRange}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-base font-semibold text-foreground">{item.recommendedRate || "N/A"}</p>
                      {item.confidence && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${sectionColors.operatingCosts.badge}`}>{item.confidence}</span>
                      )}
                    </div>
                    {item.rationale && (
                      <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{item.rationale}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {content.operatingCostAnalysis.sources && content.operatingCostAnalysis.sources.length > 0 && (
            <div className="bg-muted rounded-xl p-4 border border-border">
              <h4 className="text-sm font-semibold text-foreground mb-3">Sources</h4>
              <ul className="space-y-1">
                {content.operatingCostAnalysis.sources.map((s: string, i: number) => (
                  <li key={i} className="text-xs text-muted-foreground">{i + 1}. {s}</li>
                ))}
              </ul>
            </div>
          )}
        </SectionCard>
      )}

      {content.propertyValueCostAnalysis && (
        <SectionCard icon={IconHome} title="Property Value Cost Analysis" color={sectionColors.propertyValueCosts}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
            {content.propertyValueCostAnalysis.propertyTaxes && (
              <div>
                <MetricCard label="Property Tax Rate" value={content.propertyValueCostAnalysis.propertyTaxes.recommendedRate || "N/A"} color={sectionColors.propertyValueCosts} confidence={content.propertyValueCostAnalysis.propertyTaxes.confidence} />
                {content.propertyValueCostAnalysis.propertyTaxes.industryRange && (
                  <p className="text-xs text-muted-foreground mt-2 ml-1">Industry Range: {content.propertyValueCostAnalysis.propertyTaxes.industryRange}</p>
                )}
                {content.propertyValueCostAnalysis.propertyTaxes.rationale && (
                  <div className="bg-muted rounded-xl p-4 border-l-4 border-muted-foreground/40 mt-3">
                    <p className="text-sm text-foreground leading-relaxed">{content.propertyValueCostAnalysis.propertyTaxes.rationale}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {content.managementServiceFeeAnalysis && (
        <SectionCard icon={IconBriefcase} title="Management & Service Fee Analysis" color={sectionColors.managementFees}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
            {content.managementServiceFeeAnalysis.baseFee && (
              <MetricCard label="Base Management Fee" value={content.managementServiceFeeAnalysis.baseFee.recommendedRate || "N/A"} color={sectionColors.managementFees} confidence={content.managementServiceFeeAnalysis.baseFee.confidence} />
            )}
            {content.managementServiceFeeAnalysis.incentiveFee && (
              <MetricCard label="Incentive Fee" value={content.managementServiceFeeAnalysis.incentiveFee.recommendedRate || "N/A"} color={sectionColors.managementFees} confidence={content.managementServiceFeeAnalysis.incentiveFee.confidence} />
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
            {content.managementServiceFeeAnalysis.accounting && (
              <MetricCard label="Accounting" value={content.managementServiceFeeAnalysis.accounting.recommendedRate || "N/A"} color={sectionColors.managementFees} confidence={content.managementServiceFeeAnalysis.accounting.confidence} />
            )}
            {content.managementServiceFeeAnalysis.techPlatform && (
              <MetricCard label="Tech Platform" value={content.managementServiceFeeAnalysis.techPlatform.recommendedRate || "N/A"} color={sectionColors.managementFees} confidence={content.managementServiceFeeAnalysis.techPlatform.confidence} />
            )}
            {content.managementServiceFeeAnalysis.assetManagement && (
              <MetricCard label="Asset Management" value={content.managementServiceFeeAnalysis.assetManagement.recommendedRate || "N/A"} color={sectionColors.managementFees} confidence={content.managementServiceFeeAnalysis.assetManagement.confidence} />
            )}
          </div>
          {Object.entries(content.managementServiceFeeAnalysis).map(([key, item]: [string, any]) => {
            if (!item || typeof item !== "object" || !item.rationale) return null;
            return (
              <div key={key} className="bg-accent-pop-2/10 rounded-xl p-4 border-l-4 border-accent-pop-2/40 mb-3">
                <p className="text-xs font-semibold text-accent-pop-2 uppercase tracking-wider mb-1">{key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())}</p>
                <p className="text-sm text-foreground leading-relaxed">{item.rationale}</p>
                {item.industryRange && (
                  <p className="text-xs text-accent-pop-2 mt-1.5 font-medium">Industry Range: {item.industryRange}</p>
                )}
              </div>
            );
          })}
        </SectionCard>
      )}

      {content.incomeTaxAnalysis && (
        <SectionCard icon={IconReceipt} title="Income Tax Analysis" color={sectionColors.incomeTax}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
            <MetricCard label="Recommended Tax Rate" value={content.incomeTaxAnalysis.recommendedRate || "N/A"} color={sectionColors.incomeTax} confidence={content.incomeTaxAnalysis.confidence} />
            {content.incomeTaxAnalysis.effectiveRange && (
              <MetricCard label="Effective Range" value={content.incomeTaxAnalysis.effectiveRange} color={sectionColors.incomeTax} />
            )}
          </div>
          {content.incomeTaxAnalysis.calculationMethodology && (
            <div className="bg-accent-pop/10 rounded-xl p-4 border-l-4 border-accent-pop/40 mb-5">
              <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                <IconCalculator className="h-4 w-4 text-accent-pop" />
                How Income Tax Is Calculated
              </h4>
              <p className="text-sm text-foreground leading-relaxed">{content.incomeTaxAnalysis.calculationMethodology}</p>
            </div>
          )}
          {content.incomeTaxAnalysis.rateBreakdown && (
            <div className="grid grid-cols-3 gap-3 mb-5">
              {content.incomeTaxAnalysis.rateBreakdown.federal && (
                <div className="bg-destructive/10 rounded-lg p-3 text-center border border-destructive/15">
                  <div className="text-xs text-muted-foreground mb-1">Federal</div>
                  <div className="text-sm font-semibold text-destructive">{content.incomeTaxAnalysis.rateBreakdown.federal}</div>
                </div>
              )}
              {content.incomeTaxAnalysis.rateBreakdown.state && (
                <div className="bg-destructive/10 rounded-lg p-3 text-center border border-destructive/15">
                  <div className="text-xs text-muted-foreground mb-1">State</div>
                  <div className="text-sm font-semibold text-destructive">{content.incomeTaxAnalysis.rateBreakdown.state}</div>
                </div>
              )}
              {content.incomeTaxAnalysis.rateBreakdown.local && (
                <div className="bg-destructive/10 rounded-lg p-3 text-center border border-destructive/15">
                  <div className="text-xs text-muted-foreground mb-1">Local</div>
                  <div className="text-sm font-semibold text-destructive">{content.incomeTaxAnalysis.rateBreakdown.local}</div>
                </div>
              )}
            </div>
          )}
          {content.incomeTaxAnalysis.rationale && (
            <div className="bg-destructive/10 rounded-xl p-4 border-l-4 border-destructive/40 mb-5">
              <p className="text-sm text-foreground leading-relaxed">{content.incomeTaxAnalysis.rationale}</p>
            </div>
          )}
          {content.incomeTaxAnalysis.factors && content.incomeTaxAnalysis.factors.length > 0 && (
            <div className="bg-muted rounded-xl p-4 border border-border">
              <h4 className="text-sm font-semibold text-foreground mb-3">Key Factors</h4>
              <ul className="space-y-2">
                {content.incomeTaxAnalysis.factors.map((f: string, i: number) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2.5">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-destructive/15 flex items-center justify-center mt-0.5">
                      <span className="text-xs font-bold text-destructive">{i + 1}</span>
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </SectionCard>
      )}

      {content.competitiveSet && content.competitiveSet.length > 0 && (
        <SectionCard icon={IconBuilding2} title="Competitive Set" color={sectionColors.competitive}>
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary/10">
                  <th className="text-left p-3 text-muted-foreground font-semibold">Property</th>
                  <th className="text-right p-3 text-muted-foreground font-semibold">Rooms</th>
                  <th className="text-right p-3 text-muted-foreground font-semibold">ADR</th>
                  <th className="text-left p-3 text-muted-foreground font-semibold">Positioning</th>
                </tr>
              </thead>
              <tbody>
                {content.competitiveSet.map((c: CompetitorEntry, i: number) => (
                  <tr key={i} className="border-t border-border hover:bg-primary/10 transition-colors">
                    <td className="p-3 text-foreground font-medium">{c.name}</td>
                    <td className="p-3 text-right text-muted-foreground">{c.rooms}</td>
                    <td className="p-3 text-right font-semibold text-primary">{c.adr}</td>
                    <td className="p-3 text-muted-foreground">{c.positioning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {content.risks && content.risks.length > 0 && (
        <SectionCard icon={IconAlertTriangle} title="Risks & Mitigations" color={sectionColors.risks}>
          <div className="space-y-3">
            {content.risks.map((r: RiskEntry, i: number) => (
              <div key={i} className="rounded-xl overflow-hidden border border-border">
                <div className="bg-destructive/10 px-4 py-3 border-b border-destructive/15">
                  <div className="flex items-center gap-2">
                    <IconShield className="w-4 h-4 text-destructive" />
                    <p className="text-sm text-foreground font-semibold">{r.risk}</p>
                  </div>
                </div>
                <div className="bg-card px-4 py-3">
                  <p className="text-sm text-muted-foreground leading-relaxed">{r.mitigation}</p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {content.sources && content.sources.length > 0 && (
        <SectionCard icon={IconBookOpen} title="Sources" color={sectionColors.sources}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {content.sources.map((s: string, i: number) => (
              <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground bg-muted rounded-lg p-2.5 border border-border">
                <span className="text-muted-foreground font-semibold">{i + 1}.</span>
                <span>{s}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
