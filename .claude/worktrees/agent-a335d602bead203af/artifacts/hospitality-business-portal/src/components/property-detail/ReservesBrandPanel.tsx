/**
 * ReservesBrandPanel.tsx — "Reserves & Brand Costs" deep-dive panel
 * (Task #808). Renders for boutique-hotel-class properties under the
 * BenchmarkPanel slot on PropertyDetail and exposes:
 *
 *   1. FF&E reserve adequacy vs. USALI 4% benchmark — header badge plus
 *      a 10-year reserve projection chart.
 *   2. Brand-fee stack — franchise / royalty / marketing / loyalty /
 *      reservation / tech, each with $/% per revenue.
 *   3. HMA terms — base & incentive fees, term, termination notice.
 *   4. Capital events timeline — projected PIPs and the post-Surfside
 *      coastal-FL milestone callout when in scope.
 *   5. Condo / mixed-use exposure.
 *
 * Every figure is paired with an `InfoTooltip` containing the source +
 * the first-order IRR-impact sentence served by the calc bundle. The
 * AnalystButton routes through the property-level Risk Intelligence
 * specialist so the user can refresh the underlying assumptions.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import type { PropertyResponse } from "@/lib/api/types";
import { formatMoney } from "@/lib/financialEngine";
import { cn } from "@/lib/utils";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { AnalystButton } from "@/components/intelligence/AnalystButton";
import { useAnalystRefresh } from "@/components/analyst/useAnalystRefresh";

interface BrandFeeLine {
  key: string;
  label: string;
  ratePctOfRoomRevenue: number;
  annualDollars: number;
  source: "property-override" | "factory-default";
  irrImpactBps: number;
  irrImpactSentence: string;
}

interface CapexYearProjection {
  year: number;
  contribution: number;
  spending: number;
  endingBalance: number;
}

interface FfeReserveAdequacy {
  effectiveReserveRate: number;
  benchmarkRate: number;
  ratioToBenchmark: number;
  badge: "above" | "at" | "near" | "below" | "critical";
  benchmarkSource: string;
  yearlyProjections: CapexYearProjection[];
  fiveYearEndingBalance: number;
  tenYearEndingBalance: number;
  underfundingRisk: "adequate" | "marginal" | "underfunded" | "critical";
  irrImpactBps: number;
  irrImpactSentence: string;
}

interface HmaTerms {
  baseFeeRate: number;
  incentiveFeeRate: number;
  termYears: number;
  terminationNoticeMonths: number;
  termSource: "property-override" | "factory-default";
  termRemainingYears: number | null;
  terminationCost: number | null;
  terminationFeeMonths: number | null;
  terminationCostSource: "property-override" | "factory-default";
}

interface CapitalEvent {
  yearOffset: number;
  fiscalYear: number;
  label: string;
  estimatedCost: number;
  category: "pip" | "milestone" | "user-defined";
  source: string;
  irrImpactBps: number;
  irrImpactSentence: string;
  isSurfsideCallout?: boolean;
}

interface CondoExposure {
  duesPctRevenue: number;
  annualDollars: number;
  pendingSpecialAssessments: number;
  notes: string | null;
  hasExposure: boolean;
}

interface ReservesBrandBundle {
  ffe_reserve_adequacy: FfeReserveAdequacy;
  brand_fee_stack: {
    lines: BrandFeeLine[];
    totalRate: number;
    totalAnnualDollars: number;
    totalIrrImpactBps: number;
  };
  hma_terms: HmaTerms;
  capital_events: {
    events: CapitalEvent[];
    surfsideApplies: boolean;
    surfsideMilestoneYear: number | null;
  };
  condo_exposure: CondoExposure;
  meta: {
    benchmarkSource: string;
    pipCycleYears: number;
    generatedAt: string;
  };
}

interface ReservesBrandResponse {
  propertyId: number;
  propertyName: string;
  hospitalityType: string;
  annualRevenue: number;
  bundle: ReservesBrandBundle;
}

interface ReservesBrandPanelProps {
  property: PropertyResponse;
}

const BADGE_LABEL: Record<FfeReserveAdequacy["badge"], string> = {
  above: "Above USALI",
  at: "At USALI",
  near: "Near USALI",
  below: "Below USALI",
  critical: "Critically underfunded",
};

const BADGE_CLASS: Record<FfeReserveAdequacy["badge"], string> = {
  above: "bg-chart-1/15 text-chart-1 border-chart-1/30",
  at: "bg-chart-1/10 text-chart-1 border-chart-1/30",
  near: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30 dark:text-yellow-400",
  below: "bg-accent-pop/15 text-accent-pop border-accent-pop/30",
  critical: "bg-red-500/15 text-red-600 border-red-500/30 dark:text-red-400",
};

function formatPct(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

function formatBps(bps: number): string {
  const sign = bps > 0 ? "+" : "";
  return `${sign}${bps.toFixed(0)} bps`;
}

function sourceLabel(source: "property-override" | "factory-default"): string {
  return source === "property-override" ? "Property override" : "Factory default";
}

export default function ReservesBrandPanel({ property }: ReservesBrandPanelProps) {
  const { data, isLoading, isError, refetch } = useQuery<ReservesBrandResponse>({
    queryKey: ["/api/properties", property.id, "reserves-brand-bundle"],
    queryFn: async () => {
      const res = await fetch(`/api/properties/${property.id}/reserves-brand-bundle`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Failed to load reserves & brand bundle (${res.status})`);
      return res.json();
    },
  });

  const analyst = useAnalystRefresh({
    scope: "global-assumptions",
    specialistId: "property.risk-intelligence",
    invalidateKeys: [["/api/properties", property.id, "reserves-brand-bundle"]],
  });

  const chartData = useMemo(() => {
    if (!data?.bundle.ffe_reserve_adequacy.yearlyProjections) return [];
    const benchmarkAnnual =
      data.annualRevenue * data.bundle.ffe_reserve_adequacy.benchmarkRate;
    return data.bundle.ffe_reserve_adequacy.yearlyProjections.map((p) => ({
      year: `Yr ${p.year}`,
      Contribution: Math.round(p.contribution),
      Spending: Math.round(p.spending),
      EndingBalance: Math.round(p.endingBalance),
      Benchmark: Math.round(benchmarkAnnual),
    }));
  }, [data]);

  if (isLoading) {
    return (
      <div
        className="rounded-lg border bg-card p-6 text-sm text-muted-foreground"
        data-testid="panel-reserves-brand-loading"
      >
        Loading reserves &amp; brand-cost bundle…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div
        className="rounded-lg border bg-card p-6"
        data-testid="panel-reserves-brand-error"
      >
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Could not load reserves &amp; brand-cost bundle.
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-xs underline text-primary"
            data-testid="button-reserves-brand-retry"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { bundle, annualRevenue } = data;
  const adequacy = bundle.ffe_reserve_adequacy;
  const stack = bundle.brand_fee_stack;
  const hma = bundle.hma_terms;
  const events = bundle.capital_events;
  const condo = bundle.condo_exposure;

  return (
    <section
      className="rounded-lg border bg-card"
      data-testid="panel-reserves-brand"
    >
      {/* ── Header ──────────────────────────────────────── */}
      <header className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            Reserves &amp; Brand Costs
            <InfoTooltip
              text="Boutique-hotel deep-dive: FF&E reserve adequacy vs. USALI 4%, brand-fee stack, HMA terms, upcoming capital events, and condo/mixed-use exposure."
            />
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Benchmark source: {bundle.meta.benchmarkSource}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
              BADGE_CLASS[adequacy.badge],
            )}
            data-testid={`badge-ffe-adequacy-${adequacy.badge}`}
          >
            {BADGE_LABEL[adequacy.badge]} ({(adequacy.ratioToBenchmark * 100).toFixed(0)}%)
          </span>
          <AnalystButton
            onClick={() => analyst.triggerRefresh()}
            isRunning={analyst.running}
            size="sm"
            suffix="Risk"
            tooltip="Have the Risk Intelligence specialist refresh reserves, brand-fee, and capital-event assumptions for this property."
            dataTestId="button-analyst-reserves-brand"
          />
        </div>
      </header>

      {/* ── FF&E reserve adequacy + chart ──────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 px-5 py-4 border-b">
        <div className="space-y-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground flex items-center">
              Effective FF&amp;E reserve rate
              <InfoTooltip
                text={`Property's modeled FF&E reserve as % of total revenue. ${adequacy.irrImpactSentence}`}
                formula="ffeReserveContribution / annualRevenue"
              />
            </div>
            <div
              className="text-2xl font-semibold"
              data-testid="text-ffe-effective-rate"
            >
              {formatPct(adequacy.effectiveReserveRate)}
            </div>
            <div className="text-xs text-muted-foreground">
              vs. {formatPct(adequacy.benchmarkRate)} USALI benchmark
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground flex items-center">
              5-yr ending reserve balance
              <InfoTooltip
                text={`Cumulative reserve balance after 5 years of contributions and projected FF&E spending. ${adequacy.irrImpactSentence}`}
              />
            </div>
            <div
              className="text-lg font-medium"
              data-testid="text-ffe-balance-5yr"
            >
              {formatMoney(adequacy.fiveYearEndingBalance)}
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground flex items-center">
              10-yr ending reserve balance
              <InfoTooltip
                text={`Cumulative reserve balance after 10 years. ${adequacy.irrImpactSentence}`}
              />
            </div>
            <div
              className="text-lg font-medium"
              data-testid="text-ffe-balance-10yr"
            >
              {formatMoney(adequacy.tenYearEndingBalance)}
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            IRR sensitivity: <span className="font-medium">{formatBps(adequacy.irrImpactBps)}</span> for every
            1% under-reserve vs. USALI.
          </div>
        </div>

        <div className="lg:col-span-2 h-64" data-testid="chart-ffe-reserve">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="year" className="text-xs" />
              <YAxis
                className="text-xs"
                tickFormatter={(v) => formatMoney(v as number)}
                width={80}
              />
              <RechartsTooltip
                formatter={(value: number) => formatMoney(value)}
                contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine
                y={Math.round(annualRevenue * adequacy.benchmarkRate)}
                stroke="hsl(var(--accent-pop))"
                strokeDasharray="4 4"
                label={{ value: "USALI 4%", fontSize: 11, fill: "hsl(var(--accent-pop))" }}
              />
              <Bar dataKey="Contribution" fill="hsl(var(--chart-1))" />
              <Bar dataKey="Spending" fill="hsl(var(--chart-2))" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Brand-fee stack ───────────────────────────── */}
      <div className="px-5 py-4 border-b">
        <div className="flex items-baseline justify-between mb-3">
          <h4 className="text-sm font-semibold flex items-center">
            Brand-fee stack
            <InfoTooltip
              text="Sum of franchise, royalty, marketing, loyalty, reservation, and brand-tech fees expressed as % of room revenue."
            />
          </h4>
          <div className="text-xs text-muted-foreground">
            Total: <span className="font-semibold text-foreground" data-testid="text-brand-stack-total-rate">
              {formatPct(stack.totalRate)}
            </span>{" "}
            ≈{" "}
            <span className="font-semibold text-foreground" data-testid="text-brand-stack-total-dollars">
              {formatMoney(stack.totalAnnualDollars)}
            </span>{" "}
            / yr
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-muted-foreground border-b">
                <th className="text-left py-2 font-medium">Fee</th>
                <th className="text-right py-2 font-medium">Rate</th>
                <th className="text-right py-2 font-medium">Annual $</th>
                <th className="text-right py-2 font-medium">IRR drag</th>
                <th className="text-left py-2 font-medium pl-4">Source</th>
              </tr>
            </thead>
            <tbody>
              {stack.lines.map((line) => (
                <tr
                  key={line.key}
                  className="border-b last:border-0"
                  data-testid={`row-brand-fee-${line.key}`}
                >
                  <td className="py-2 flex items-center">
                    {line.label}
                    <InfoTooltip text={line.irrImpactSentence} light />
                  </td>
                  <td className="py-2 text-right font-mono" data-testid={`text-brand-fee-rate-${line.key}`}>
                    {formatPct(line.ratePctOfRoomRevenue)}
                  </td>
                  <td className="py-2 text-right font-mono" data-testid={`text-brand-fee-dollars-${line.key}`}>
                    {formatMoney(line.annualDollars)}
                  </td>
                  <td className="py-2 text-right font-mono text-muted-foreground">
                    {formatBps(line.irrImpactBps)}
                  </td>
                  <td className="py-2 pl-4 text-xs text-muted-foreground">
                    {sourceLabel(line.source)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          Total brand-fee IRR drag (first-order):{" "}
          <span className="font-medium text-foreground">
            {formatBps(stack.totalIrrImpactBps)}
          </span>
        </div>
      </div>

      {/* ── HMA terms ─────────────────────────────────── */}
      <div className="px-5 py-4 border-b">
        <h4 className="text-sm font-semibold flex items-center mb-3">
          HMA terms
          <InfoTooltip
            text="Hotel Management Agreement key economics. Term and notice come from the property record; defaults are flagged when the override is missing."
          />
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground flex items-center">
              Base mgmt fee
              <InfoTooltip
                text="Base management fee as % of total revenue, paid to the operator regardless of performance."
              />
            </div>
            <div className="text-lg font-medium" data-testid="text-hma-base-fee">
              {formatPct(hma.baseFeeRate)}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground flex items-center">
              Incentive fee
              <InfoTooltip
                text="Incentive management fee as % of GOP above an owner's-priority hurdle. A 1% increase in incentive fee typically reduces IRR by ~5–10 bps."
              />
            </div>
            <div className="text-lg font-medium" data-testid="text-hma-incentive-fee">
              {formatPct(hma.incentiveFeeRate)}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground flex items-center">
              Term
              <InfoTooltip
                text={`Length of the HMA in years (${sourceLabel(hma.termSource)}). Long terms reduce flexibility; short terms increase repositioning risk.`}
              />
            </div>
            <div className="text-lg font-medium" data-testid="text-hma-term-years">
              {hma.termYears} yrs
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground flex items-center">
              Termination notice
              <InfoTooltip
                text="Months of notice required to terminate the HMA. Short notice windows are owner-friendly; long windows protect the operator."
              />
            </div>
            <div className="text-lg font-medium" data-testid="text-hma-notice-months">
              {hma.terminationNoticeMonths} mo
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground flex items-center">
              Term remaining
              <InfoTooltip
                text="Years left on the HMA at the current fiscal year. A short remaining term increases re-flag / repositioning optionality at exit."
              />
            </div>
            <div className="text-lg font-medium" data-testid="text-hma-term-remaining">
              {hma.termRemainingYears !== null ? `${hma.termRemainingYears} yrs` : "—"}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground flex items-center">
              Termination cost
              <InfoTooltip
                text={`Buyout = (annual revenue × base mgmt fee) ÷ 12 × ${hma.terminationFeeMonths ?? "?"} mo (${sourceLabel(hma.terminationCostSource)}). A higher buyout depresses exit IRR if the next owner re-flags.`}
              />
            </div>
            <div className="text-lg font-medium" data-testid="text-hma-termination-cost">
              {hma.terminationCost !== null ? formatMoney(hma.terminationCost) : "—"}
            </div>
          </div>
        </div>
      </div>

      {/* ── Capital events timeline ───────────────────── */}
      <div className="px-5 py-4 border-b">
        <div className="flex items-baseline justify-between mb-3">
          <h4 className="text-sm font-semibold flex items-center">
            Upcoming capital events
            <InfoTooltip
              text={`Projected PIPs on a ${bundle.meta.pipCycleYears}-yr cycle plus any user-supplied schedule. Surfside coastal-FL milestone is added when in scope.`}
            />
          </h4>
          {events.surfsideApplies && events.surfsideMilestoneYear !== null && (
            <span
              className="inline-flex items-center rounded-full border border-accent-pop/40 bg-accent-pop/10 text-accent-pop px-2.5 py-0.5 text-xs font-medium"
              data-testid="badge-surfside-callout"
            >
              Surfside milestone — Yr {events.surfsideMilestoneYear}
            </span>
          )}
        </div>
        {events.events.length === 0 ? (
          <p className="text-xs text-muted-foreground" data-testid="text-no-capital-events">
            No capital events projected in the hold period.
          </p>
        ) : (
          <ol className="space-y-2">
            {events.events.map((ev, idx) => (
              <li
                key={`${ev.fiscalYear}-${ev.category}-${idx}`}
                className={cn(
                  "flex items-start gap-3 rounded-md border px-3 py-2",
                  ev.isSurfsideCallout
                    ? "border-accent-pop/40 bg-accent-pop/5"
                    : "border-border bg-background/40",
                )}
                data-testid={`row-capital-event-${ev.fiscalYear}-${ev.category}`}
              >
                <div className="text-xs font-mono w-16 text-muted-foreground pt-0.5">
                  {ev.fiscalYear}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium flex items-center">
                    {ev.label}
                    <InfoTooltip
                      text={`Source: ${ev.source}. ${ev.irrImpactSentence}`}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Est. {formatMoney(ev.estimatedCost)} · IRR drag {formatBps(ev.irrImpactBps)}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* ── Condo / mixed-use exposure ────────────────── */}
      <div className="px-5 py-4">
        <h4 className="text-sm font-semibold flex items-center mb-3">
          Condo / mixed-use exposure
          <InfoTooltip
            text="HOA / condo-association dues paid by the hotel as a % of total revenue, plus free-form notes about shared-facility risk, voting rights, or special assessments."
          />
        </h4>
        {!condo.hasExposure ? (
          <p className="text-xs text-muted-foreground" data-testid="text-no-condo-exposure">
            No condo or mixed-use exposure recorded for this property.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Dues % of revenue
              </div>
              <div className="text-lg font-medium" data-testid="text-condo-dues-rate">
                {formatPct(condo.duesPctRevenue)}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Annual dues
              </div>
              <div className="text-lg font-medium" data-testid="text-condo-dues-dollars">
                {formatMoney(condo.annualDollars)}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground flex items-center">
                Pending special assessments
                <InfoTooltip
                  text="Outstanding special assessments levied by the condo association — typically post-Surfside structural repairs in coastal FL. Lump-sum cash drag at the next assessment date; reduces near-term cash-on-cash."
                />
              </div>
              <div className="text-lg font-medium" data-testid="text-condo-special-assessments">
                {condo.pendingSpecialAssessments > 0
                  ? formatMoney(condo.pendingSpecialAssessments)
                  : "—"}
              </div>
            </div>
            <div className="sm:col-span-1">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Notes
              </div>
              <p className="text-xs text-muted-foreground mt-1" data-testid="text-condo-notes">
                {condo.notes || "—"}
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
