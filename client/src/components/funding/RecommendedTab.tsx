import { ScrollReveal, KPIGrid, InsightPanel, formatCompact } from "@/components/graphics";
import { IconWallet, IconTarget, IconDollarSign } from "@/components/icons";
import { ContentPanel } from "@/components/ui/content-panel";
import { formatMoney } from "@/lib/financialEngine";
import { analyzeFundingNeeds } from "@/lib/financial/funding-predictor";
import { NodeBox, Arrow, FlowRow } from "@/components/ui/flow-diagram";
import { CashRunwayChart, TrancheCard } from "./shared";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function RecommendedTab({ analysis, fundingLabel, chartData, gapType, projectionYears, global, marketRates }: {
  analysis: NonNullable<ReturnType<typeof analyzeFundingNeeds>>;
  fundingLabel: string;
  chartData: { month: number; withFunding: number; withoutFunding: number }[];
  gapType: string;
  projectionYears: number;
  global: any;
  marketRates: any;
}) {
  return (
    <>
      <ScrollReveal>
        <KPIGrid
          data-testid="kpi-funding-overview"
          items={[
            { label: "Capital Raise Target", value: analysis.totalRaiseNeeded, format: formatCompact },
            { label: "Tranches", value: analysis.tranches.length, sublabel: `via ${fundingLabel}` },
            { label: "Path to Breakeven", value: analysis.breakevenMonth ?? 0, sublabel: analysis.breakevenMonth !== null ? `Month ${analysis.breakevenMonth}` : "Not within projection" },
            {
              label: "Funding Gap",
              value: Math.abs(analysis.fundingGap),
              format: formatCompact,
              sublabel: analysis.fundingGap > 0 ? "Shortfall" : analysis.fundingGap < 0 ? "Surplus" : "Balanced",
              trend: gapType === "negative" ? "down" as const : gapType === "positive" ? "up" as const : undefined,
            },
          ]}
          columns={4}
          variant="glass"
        />
      </ScrollReveal>

      <ScrollReveal>
        <ContentPanel data-testid="panel-investor-thesis">
          <div className="flex items-start gap-3 mb-3">
            <IconTarget className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-lg font-display text-foreground">Investment Thesis</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Why investors fund this management company</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground/80 leading-relaxed" data-testid="text-investor-thesis">
            {analysis.investorThesis}
          </p>
        </ContentPanel>
      </ScrollReveal>

      <ScrollReveal>
        <ContentPanel data-testid="panel-capital-flow">
          <div className="flex items-start gap-3 mb-3">
            <IconWallet className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-lg font-display text-foreground">Capital Structure</h3>
              <p className="text-xs text-muted-foreground mt-0.5">How {fundingLabel} capital flows through the management company</p>
            </div>
          </div>
          <div className="bg-muted/20 rounded-lg p-4 border border-border/40 overflow-auto" data-testid="capital-structure-flow">
            <FlowRow>
              <NodeBox node={{ id: "investors", label: `${fundingLabel} Investors`, color: "blue" }} />
              <Arrow />
              <div className="flex flex-col gap-2">
                {analysis.tranches.map(t => {
                  const fmt = (v: number) => `$${(v / 1000).toFixed(0)}K`;
                  return (
                    <div key={t.index} className="flex items-center gap-1">
                      <NodeBox node={{ id: `t${t.index}`, label: `Tranche ${t.index}`, sublabel: `${fmt(t.amount)} · Month ${t.month}`, color: "blue" }} />
                      <Arrow />
                    </div>
                  );
                })}
              </div>
              <NodeBox node={{ id: "ops", label: "Operating Expenses", sublabel: `$${(analysis.monthlyBurnRate / 1000).toFixed(0)}K/mo burn`, color: "amber" }} />
              <Arrow />
              <NodeBox node={{ id: "revenue", label: "Fee Revenue", sublabel: "Ramp-Up", color: "purple" }} />
              <Arrow />
              <NodeBox node={{
                id: "breakeven",
                label: analysis.breakevenMonth !== null ? `Breakeven` : "Breakeven",
                sublabel: analysis.breakevenMonth !== null ? `Month ${analysis.breakevenMonth}` : "Not yet reached",
                color: analysis.breakevenMonth !== null ? "green" : "red",
                variant: "rounded",
              }} />
            </FlowRow>
          </div>
        </ContentPanel>
      </ScrollReveal>

      <ScrollReveal>
        <ContentPanel title="Cash Runway" subtitle="Cumulative cash position with and without funding" data-testid="panel-cash-runway">
          <CashRunwayChart chartData={chartData} analysis={analysis} />
        </ContentPanel>
      </ScrollReveal>

      <ScrollReveal>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {analysis.tranches.map((tranche) => (
            <TrancheCard key={tranche.index} tranche={tranche} totalTranches={analysis.tranches.length} />
          ))}
        </div>
      </ScrollReveal>

      {analysis.tranches.length > 1 && (
        <ScrollReveal>
          <ContentPanel title="Early-Stage Terms Comparison" data-testid="panel-terms-comparison">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Term</th>
                    {analysis.tranches.map(t => (
                      <th key={t.index} className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">
                        Tranche {t.index}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/50">
                    <td className="py-2 px-3 text-muted-foreground">Amount</td>
                    {analysis.tranches.map(t => (
                      <td key={t.index} className="py-2 px-3 text-right font-mono font-medium text-foreground">
                        {formatMoney(t.amount)}
                      </td>
                    ))}
                  </tr>
                  {analysis.tranches.some(t => t.valuationCap !== null) && (
                  <tr className="border-b border-border/50">
                    <td className="py-2 px-3 text-muted-foreground">Valuation Cap</td>
                    {analysis.tranches.map(t => (
                      <td key={t.index} className="py-2 px-3 text-right font-mono text-foreground">
                        {t.valuationCap !== null ? formatMoney(t.valuationCap) : '—'}
                      </td>
                    ))}
                  </tr>
                  )}
                  {analysis.tranches.some(t => t.discountRate !== null) && (
                  <tr className="border-b border-border/50">
                    <td className="py-2 px-3 text-muted-foreground">Discount Rate</td>
                    {analysis.tranches.map(t => (
                      <td key={t.index} className="py-2 px-3 text-right font-mono text-foreground">
                        {t.discountRate !== null ? `${(t.discountRate * 100).toFixed(1)}%` : '—'}
                      </td>
                    ))}
                  </tr>
                  )}
                  <tr className="border-b border-border/50">
                    <td className="py-2 px-3 text-muted-foreground">Timing</td>
                    {analysis.tranches.map(t => (
                      <td key={t.index} className="py-2 px-3 text-right text-foreground">
                        Month {t.month}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2 px-3 text-muted-foreground">Risk Profile</td>
                    {analysis.tranches.map(t => (
                      <td key={t.index} className="py-2 px-3 text-right text-foreground">
                        {t.index === 1 ? 'Pre-revenue (highest)' : t.index === analysis.tranches.length ? 'Revenue-generating (lowest)' : 'Early revenue (moderate)'}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </ContentPanel>
        </ScrollReveal>
      )}

      <ScrollReveal>
        <ContentPanel data-testid="panel-narrative">
          <div className="flex items-start gap-3 mb-3">
            <IconDollarSign className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-lg font-display text-foreground">Capital Strategy</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Engine-computed analysis of the capital raise</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground/80 leading-relaxed" data-testid="text-narrative">
            {analysis.narrativeSummary}
          </p>
        </ContentPanel>
      </ScrollReveal>

      <ScrollReveal>
        <InsightPanel
          data-testid="insights-funding"
          title="Risk Factors & Milestones"
          insights={[
            {
              text: `Net burn rate during ramp-up: ${formatMoney(analysis.monthlyBurnRate)}/month`,
              type: "warning" as const,
            },
            {
              text: analysis.breakevenMonth !== null
                ? `Operating breakeven at month ${analysis.breakevenMonth} with ${analysis.propertiesAtBreakeven} propert${analysis.propertiesAtBreakeven === 1 ? 'y' : 'ies'} in the portfolio`
                : `Company does not reach operating breakeven within the ${projectionYears}-year projection`,
              type: analysis.breakevenMonth !== null ? "positive" as const : "negative" as const,
            },
            {
              text: `Peak cash deficit without funding: ${formatMoney(analysis.peakCashDeficit)}`,
              type: "negative" as const,
            },
            {
              text: analysis.fundingGap <= 0
                ? `Configured ${fundingLabel} of ${formatMoney(analysis.currentFunding)} covers the raise (${formatMoney(Math.abs(analysis.fundingGap))} surplus)`
                : `Configured ${fundingLabel} of ${formatMoney(analysis.currentFunding)} leaves a ${formatMoney(analysis.fundingGap)} shortfall — increase the raise or reduce operating expenses`,
              type: analysis.fundingGap <= 0 ? "positive" as const : "negative" as const,
            },
          ]}
        />
      </ScrollReveal>
    </>
  );
}
