import { ScrollReveal, KPIGrid, formatCompact } from "@/components/graphics";
import { IconAlertTriangle, IconBarChart3 } from "@/components/icons";
import { ContentPanel } from "@/components/ui/content-panel";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "@/components/icons/themed-icons";
import { formatMoney } from "@/lib/financialEngine";
import { analyzeFundingNeeds } from "@/lib/financial/funding-predictor";
import { DEFAULT_CAPITAL_RAISE_VALUATION_CAP, DEFAULT_CAPITAL_RAISE_DISCOUNT_RATE } from "@shared/constants";
import { StatRow, CashRunwayChart } from "./shared";

export function CurrentPlanTab({ analysis, fundingLabel, global, chartData, navigate }: {
  analysis: NonNullable<ReturnType<typeof analyzeFundingNeeds>>;
  fundingLabel: string;
  global: any;
  chartData: { month: number; withFunding: number; withoutFunding: number }[];
  navigate: (to: string) => void;
}) {
  const t1Amount = global.capitalRaise1Amount ?? 0;
  const t2Amount = global.capitalRaise2Amount ?? 0;
  const configuredTotal = t1Amount + t2Amount;
  const t1Date = global.capitalRaise1Date ?? "—";
  const t2Date = global.capitalRaise2Date ?? "—";
  const valCap = global.capitalRaiseValuationCap ?? DEFAULT_CAPITAL_RAISE_VALUATION_CAP;
  const discRate = global.capitalRaiseDiscountRate ?? DEFAULT_CAPITAL_RAISE_DISCOUNT_RATE;
  const gap = analysis.totalRaiseNeeded - configuredTotal;
  const coveragePct = analysis.totalRaiseNeeded > 0 ? Math.min(100, configuredTotal / analysis.totalRaiseNeeded * 100) : 100;

  return (
    <>
      <ScrollReveal>
        <KPIGrid
          data-testid="kpi-current-plan"
          items={[
            { label: "Configured Capital", value: configuredTotal, format: formatCompact },
            { label: "Engine Recommendation", value: analysis.totalRaiseNeeded, format: formatCompact },
            {
              label: "Coverage",
              value: Math.round(coveragePct),
              format: (v: number) => `${v}%`,
              sublabel: gap > 0 ? `${formatMoney(gap)} shortfall` : gap < 0 ? `${formatMoney(Math.abs(gap))} surplus` : "Fully covered",
              trend: gap > 0 ? "down" as const : gap <= 0 ? "up" as const : undefined,
            },
            { label: "Runway", value: analysis.monthsOfRunway, format: (v: number) => `${v} mo`, sublabel: analysis.monthsOfRunway >= 24 ? "Healthy" : analysis.monthsOfRunway >= 12 ? "Adequate" : "At risk" },
          ]}
          columns={4}
          variant="glass"
        />
      </ScrollReveal>

      {gap > 0 && (
        <ScrollReveal>
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3" data-testid="alert-funding-gap">
            <IconAlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive">Funding Gap: {formatMoney(gap)}</p>
              <p className="text-xs text-destructive/80 mt-1">
                Your configured capital raise ({fundingLabel}) totals {formatMoney(configuredTotal)}, but the engine recommends {formatMoney(analysis.totalRaiseNeeded)} to reach operating breakeven with adequate reserves. Consider increasing tranche amounts or reducing operating expenses.
              </p>
            </div>
          </div>
        </ScrollReveal>
      )}

      <ScrollReveal>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ContentPanel data-testid="panel-tranche1-config">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-bold text-primary">1</span>
              </div>
              <div>
                <h4 className="text-sm font-display text-foreground">Capital Raise 1</h4>
                <p className="text-xs text-muted-foreground">Initial capital deployment</p>
              </div>
            </div>
            <div className="space-y-0">
              <StatRow label="Amount" value={formatMoney(t1Amount)} />
              <StatRow label="Target Date" value={t1Date} />
              {valCap > 0 && <StatRow label="Valuation Cap" value={formatMoney(valCap)} />}
              {discRate > 0 && <StatRow label="Discount Rate" value={`${(discRate * 100).toFixed(1)}%`} />}
            </div>
            {analysis.tranches[0] && (
              <div className="mt-3 pt-3 border-t border-border/40">
                <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wider mb-1">Engine recommends</p>
                <p className="text-xs text-muted-foreground">
                  {formatMoney(analysis.tranches[0].amount)} at month {analysis.tranches[0].month}
                  {analysis.tranches[0].valuationCap !== null ? ` with ${formatMoney(analysis.tranches[0].valuationCap)} cap` : ''}
                  {analysis.tranches[0].discountRate !== null ? ` / ${(analysis.tranches[0].discountRate * 100).toFixed(1)}% discount` : ''}
                </p>
              </div>
            )}
          </ContentPanel>

          <ContentPanel data-testid="panel-tranche2-config">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-bold text-primary">2</span>
              </div>
              <div>
                <h4 className="text-sm font-display text-foreground">Capital Raise 2</h4>
                <p className="text-xs text-muted-foreground">Growth-phase capital</p>
              </div>
            </div>
            <div className="space-y-0">
              <StatRow label="Amount" value={formatMoney(t2Amount)} />
              <StatRow label="Target Date" value={t2Date} />
              {valCap > 0 && <StatRow label="Valuation Cap" value={formatMoney(valCap)} />}
              {discRate > 0 && <StatRow label="Discount Rate" value={`${(discRate * 100).toFixed(1)}%`} />}
            </div>
            {analysis.tranches[1] && (
              <div className="mt-3 pt-3 border-t border-border/40">
                <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wider mb-1">Engine recommends</p>
                <p className="text-xs text-muted-foreground">
                  {formatMoney(analysis.tranches[1].amount)} at month {analysis.tranches[1].month}
                  {analysis.tranches[1].valuationCap !== null ? ` with ${formatMoney(analysis.tranches[1].valuationCap)} cap` : ''}
                  {analysis.tranches[1].discountRate !== null ? ` / ${(analysis.tranches[1].discountRate * 100).toFixed(1)}% discount` : ''}
                </p>
              </div>
            )}
          </ContentPanel>
        </div>
      </ScrollReveal>

      <ScrollReveal>
        <ContentPanel title="Cash Runway — Current Plan" subtitle="Projected cash position using your configured funding" data-testid="panel-current-runway">
          <CashRunwayChart chartData={chartData} analysis={analysis} />
        </ContentPanel>
      </ScrollReveal>

      <ScrollReveal>
        <ContentPanel data-testid="panel-gap-analysis">
          <div className="flex items-start gap-3 mb-3">
            <IconBarChart3 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-lg font-display text-foreground">Gap Analysis</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Your plan vs. the engine recommendation</p>
            </div>
          </div>
          <div className="space-y-0">
            <StatRow label="Your Total Raise" value={formatMoney(configuredTotal)} />
            <StatRow label="Engine Target" value={formatMoney(analysis.totalRaiseNeeded)} />
            <StatRow label="Difference" value={gap > 0 ? `-${formatMoney(gap)}` : gap < 0 ? `+${formatMoney(Math.abs(gap))}` : "—"} />
            <StatRow label="Coverage Ratio" value={`${coveragePct.toFixed(1)}%`} />
            <StatRow label={`${fundingLabel} Label`} value={fundingLabel} />
          </div>
          <div className="mt-4">
            <Button
              variant="link"
              size="sm"
              onClick={() => navigate("/admin")}
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors h-auto p-0"
              data-testid="link-edit-assumptions"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Edit funding assumptions in Company Assumptions
            </Button>
          </div>
        </ContentPanel>
      </ScrollReveal>
    </>
  );
}
