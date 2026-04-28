/**
 * ExitScenariosSection.tsx — Task #807.
 *
 * "When should we sell?" section on the PropertyDetail page. For one property,
 * shows three scenarios (Pessimistic / Base / Optimistic) × four hold horizons
 * (3 / 5 / 7 / 10 years), each with sale price, itemized selling-cost
 * breakdown on hover, real loan balance from amortization, total cash invested
 * (including any years of negative operating cash flow), profit/loss,
 * annualized ROI, breakeven hold period, an early-exit-risk callout, and a
 * small terminal-value-vs-cumulative-cost area chart per scenario.
 *
 * Source-of-truth math lives in `calc/analysis/exit-scenarios.ts`. This
 * component is presentation only — it formats numbers and labels them with
 * the canonical hospitality field labels from `shared/field-registry.ts`.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Tooltip as UiTooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconAlertTriangle } from "@/components/icons";
import {
  fetchPropertyExitScenarios,
  buildExitScenariosQueryKey,
} from "@/hooks/useServerFinancials";
import { formatMoney } from "@/lib/financialEngine";
import { cn } from "@/lib/utils";
import { FIELD_REGISTRY } from "@shared/field-registry";
import type { PropertyResponse, GlobalResponse } from "@/lib/api/types";
import type { ExitScenarioResult } from "../../../../calc/analysis/exit-scenarios";

interface Props {
  property: PropertyResponse;
  global: GlobalResponse;
}

function fieldLabel(propertyField: string, fallback: string): string {
  return FIELD_REGISTRY.find((f) => f.propertyField === propertyField)?.label ?? fallback;
}

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function profitClass(value: number): string {
  if (value > 0) return "text-chart-1 font-medium";
  if (value < 0) return "text-accent-pop font-medium";
  return "text-foreground";
}

const SCENARIO_COLORS: Record<string, { stroke: string; fill: string; chip: string }> = {
  pessimistic: { stroke: "hsl(var(--line-2))", fill: "hsl(var(--line-2))", chip: "bg-accent-pop/10 text-accent-pop" },
  base: { stroke: "hsl(var(--line-1))", fill: "hsl(var(--line-1))", chip: "bg-primary/10 text-primary" },
  optimistic: { stroke: "hsl(var(--line-3))", fill: "hsl(var(--line-3))", chip: "bg-chart-1/10 text-chart-1" },
};

function SellingCostsCell({
  total,
  breakdown,
}: {
  total: number;
  breakdown: ExitScenarioResult["horizons"][number]["sellingCosts"];
}) {
  return (
    <UiTooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="cursor-help underline decoration-dotted decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
          data-testid={`text-selling-costs-${total.toFixed(0)}`}
        >
          {formatMoney(total)}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <div className="text-xs space-y-1">
          <div className="font-semibold mb-1">Selling cost breakdown</div>
          <div className="grid grid-cols-2 gap-x-3">
            <span className="text-muted-foreground">{fieldLabel("dispositionCommission", "Disposition Commission")}</span>
            <span className="text-right">{formatMoney(breakdown.brokerCommission)}</span>
            <span className="text-muted-foreground">Transfer / doc tax</span>
            <span className="text-right">{formatMoney(breakdown.transferTax)}</span>
            <span className="text-muted-foreground">Prepayment / defeasance</span>
            <span className="text-right">{formatMoney(breakdown.prepaymentPenalty)}</span>
            <span className="text-muted-foreground">FF&amp;E disposition</span>
            <span className="text-right">{formatMoney(breakdown.ffeDisposition)}</span>
            <span className="font-semibold">Total</span>
            <span className="text-right font-semibold">{formatMoney(breakdown.total)}</span>
          </div>
          <div className="text-[10px] text-muted-foreground pt-1">
            Rates: {formatPct(breakdown.rates.brokerRate)} broker · {formatPct(breakdown.rates.transferTaxRate)} transfer ·{" "}
            {breakdown.rates.prepaymentPenaltyRate > 0 ? `${formatPct(breakdown.rates.prepaymentPenaltyRate)} penalty · ` : ""}
            {formatPct(breakdown.rates.ffeDispositionRate)} FF&amp;E
          </div>
        </div>
      </TooltipContent>
    </UiTooltip>
  );
}

function ScenarioCard({ scenario }: { scenario: ExitScenarioResult }) {
  const colors = SCENARIO_COLORS[scenario.scenario.key]!;
  const chartData = useMemo(
    () =>
      scenario.chartSeries.map((p) => ({
        year: `Yr ${p.year}`,
        TerminalValue: p.terminalValue,
        CumulativeCost: p.cumulativeCost,
      })),
    [scenario.chartSeries],
  );

  return (
    <Card data-testid={`card-exit-scenario-${scenario.scenario.key}`} className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <span className={cn("rounded px-2 py-0.5 text-xs", colors.chip)} data-testid={`chip-scenario-${scenario.scenario.key}`}>
              {scenario.scenario.label}
            </span>
            <span className="text-sm text-muted-foreground font-normal">
              {fieldLabel("adrGrowthRate", "ADR Growth Rate")}: {formatPct(scenario.scenario.noiGrowthRate)}
            </span>
          </CardTitle>
        </div>
        <CardDescription className="text-xs">
          {fieldLabel("exitCapRate", "Exit Cap Rate")} applied to year-N NOI; loan balance from amortization.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid={`table-exit-scenario-${scenario.scenario.key}`}>
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-2 font-medium text-muted-foreground">Metric</th>
                {scenario.horizons.map((h) => (
                  <th
                    key={h.horizonYears}
                    className="text-right py-2 px-2 font-medium text-muted-foreground"
                    data-testid={`th-horizon-${scenario.scenario.key}-${h.horizonYears}`}
                  >
                    {h.horizonYears} yr
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/50">
                <td className="py-2 pr-2 text-muted-foreground">Sale Price</td>
                {scenario.horizons.map((h) => (
                  <td
                    key={h.horizonYears}
                    className="text-right py-2 px-2 tabular-nums"
                    data-testid={`text-sale-price-${scenario.scenario.key}-${h.horizonYears}`}
                  >
                    {formatMoney(h.salePrice)}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-2 pr-2 text-muted-foreground">Selling Costs</td>
                {scenario.horizons.map((h) => (
                  <td
                    key={h.horizonYears}
                    className="text-right py-2 px-2 tabular-nums"
                    data-testid={`cell-selling-costs-${scenario.scenario.key}-${h.horizonYears}`}
                  >
                    <SellingCostsCell total={h.sellingCosts.total} breakdown={h.sellingCosts} />
                  </td>
                ))}
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-2 pr-2 text-muted-foreground">Loan Balance</td>
                {scenario.horizons.map((h) => (
                  <td
                    key={h.horizonYears}
                    className="text-right py-2 px-2 tabular-nums"
                    data-testid={`text-loan-balance-${scenario.scenario.key}-${h.horizonYears}`}
                  >
                    {formatMoney(h.loanBalance)}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-2 pr-2 text-muted-foreground">Net Proceeds</td>
                {scenario.horizons.map((h) => (
                  <td
                    key={h.horizonYears}
                    className="text-right py-2 px-2 tabular-nums"
                    data-testid={`text-net-proceeds-${scenario.scenario.key}-${h.horizonYears}`}
                  >
                    {formatMoney(h.netProceeds)}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-2 pr-2 text-muted-foreground">Total Cash Invested</td>
                {scenario.horizons.map((h) => (
                  <td
                    key={h.horizonYears}
                    className="text-right py-2 px-2 tabular-nums"
                    data-testid={`text-cash-invested-${scenario.scenario.key}-${h.horizonYears}`}
                  >
                    {formatMoney(h.totalCashInvested)}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-2 pr-2 text-muted-foreground">Profit / Loss</td>
                {scenario.horizons.map((h) => (
                  <td
                    key={h.horizonYears}
                    className={cn("text-right py-2 px-2 tabular-nums", profitClass(h.profitLoss))}
                    data-testid={`text-profit-loss-${scenario.scenario.key}-${h.horizonYears}`}
                  >
                    {formatMoney(h.profitLoss)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2 pr-2 text-muted-foreground">Annualized ROI</td>
                {scenario.horizons.map((h) => (
                  <td
                    key={h.horizonYears}
                    className={cn("text-right py-2 px-2 tabular-nums", profitClass(h.annualizedRoi))}
                    data-testid={`text-annualized-roi-${scenario.scenario.key}-${h.horizonYears}`}
                  >
                    {formatPct(h.annualizedRoi)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <div
          className="text-xs text-muted-foreground border-t border-border pt-3"
          data-testid={`text-breakeven-${scenario.scenario.key}`}
        >
          <span className="font-medium text-foreground">Breakeven Hold Period:</span>{" "}
          {scenario.breakevenYears !== null
            ? `${(Math.round(scenario.breakevenYears * 10) / 10).toFixed(1)} yr${scenario.breakevenYears === 1 ? "" : "s"}`
            : "Does not break even within 30-year horizon"}
        </div>

        <div className="h-40" data-testid={`chart-terminal-vs-cost-${scenario.scenario.key}`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`grad-tv-${scenario.scenario.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={colors.fill} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={colors.fill} stopOpacity={0} />
                </linearGradient>
                <linearGradient id={`grad-cc-${scenario.scenario.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="year" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => formatMoney(v)} width={56} />
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  borderColor: "hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "hsl(var(--foreground))",
                }}
                formatter={(value: number, name: string) => [formatMoney(value), name]}
              />
              <Area
                type="monotone"
                dataKey="CumulativeCost"
                name="Cumulative Cost"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={1.5}
                fill={`url(#grad-cc-${scenario.scenario.key})`}
              />
              <Area
                type="monotone"
                dataKey="TerminalValue"
                name="Terminal Value at Sale"
                stroke={colors.stroke}
                strokeWidth={2}
                fill={`url(#grad-tv-${scenario.scenario.key})`}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ExitScenariosSection({ property, global }: Props) {
  const queryKey = useMemo(
    () => buildExitScenariosQueryKey(property.id, property, global),
    [property, global],
  );

  const { data, isLoading, isError, error } = useQuery({
    queryKey,
    queryFn: () => fetchPropertyExitScenarios(property, global),
    enabled: !!property && !!global,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <Card data-testid="card-exit-scenarios-loading">
        <CardHeader>
          <CardTitle className="text-base">Exit Scenarios</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          Computing exit scenarios…
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card data-testid="card-exit-scenarios-error">
        <CardHeader>
          <CardTitle className="text-base">Exit Scenarios</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-accent-pop">
          {error instanceof Error ? error.message : "Could not compute exit scenarios."}
        </CardContent>
      </Card>
    );
  }

  const { scenarios, earlyExitRisk } = data.exitScenarios;

  return (
    <section className="space-y-4" data-testid="section-exit-scenarios">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Exit Scenarios</h2>
        <p className="text-sm text-muted-foreground">
          Three NOI-growth assumptions × four hold horizons. Hover any selling-cost cell for the
          jurisdiction-specific breakdown.
        </p>
      </div>

      {earlyExitRisk.triggered && (
        <div
          className="flex items-start gap-3 rounded-lg border border-accent-pop/30 bg-accent-pop/5 p-4"
          data-testid="callout-early-exit-risk"
        >
          <IconAlertTriangle className="w-5 h-5 text-accent-pop flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold text-accent-pop">Early-Exit Risk</div>
            <div className="text-foreground/80 mt-0.5">{earlyExitRisk.message}</div>
            <div className="text-xs text-muted-foreground mt-1">
              At least one scenario takes more than five years to break even.
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {scenarios.map((s) => (
          <ScenarioCard key={s.scenario.key} scenario={s} />
        ))}
      </div>
    </section>
  );
}
