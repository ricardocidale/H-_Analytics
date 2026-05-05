/**
 * WaterfallPanel.tsx — Read-only LP/GP waterfall economics panel.
 *
 * Displays the LP/GP waterfall split from the server-computed WaterfallOutput.
 * Renders a compact card with LP totals, GP totals, multiples, preferred return
 * status, and return of capital. Shows a soft null state when waterfall is not
 * configured (no lpEquityPct on the property, or waterfallResult is absent).
 *
 * Data source: serverFinancials.waterfallResult from the single-property
 * compute endpoint (/api/finance/property/:id), attached by the route handler
 * alongside the monthly/yearly engine output.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/financialEngine";
import { formatPercent } from "@/components/graphics/formatters";
import { cn } from "@/lib/utils";
import type { WaterfallOutput } from "@calc/analysis/waterfall";

interface WaterfallPanelProps {
  waterfallResult?: WaterfallOutput | null;
  /** LP share of total equity (0–1). Sourced from property.lpEquityPct. */
  lpEquityPct?: number | null;
}

interface MetricCellProps {
  label: string;
  value: string;
  emphasis?: boolean;
}

function MetricCell({ label, value, emphasis }: MetricCellProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "text-sm font-semibold font-mono",
          emphasis ? "text-primary" : "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export default function WaterfallPanel({ waterfallResult, lpEquityPct }: WaterfallPanelProps) {
  const hasData = !!waterfallResult && lpEquityPct != null;

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm font-display">LP/GP Waterfall</CardTitle>
          {hasData && lpEquityPct != null && (
            <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              LP {formatPercent(lpEquityPct, 0)}
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {!hasData ? (
          <p className="text-sm text-muted-foreground">
            Waterfall not configured — add LP equity % and tranche structure in property settings.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            <MetricCell
              label="LP Total"
              value={formatMoney(waterfallResult.total_to_lp)}
              emphasis
            />
            <MetricCell
              label="LP Multiple"
              value={`${waterfallResult.lp_multiple.toFixed(2)}×`}
            />
            <MetricCell
              label="Return of Capital"
              value={formatMoney(waterfallResult.return_of_capital)}
            />
            <MetricCell
              label="GP Total"
              value={formatMoney(waterfallResult.total_to_gp)}
            />
            <MetricCell
              label="GP Multiple"
              value={`${waterfallResult.gp_multiple.toFixed(2)}×`}
            />
            <MetricCell
              label="Preferred Return"
              value={
                waterfallResult.preferred_return_shortfall > 0
                  ? `${formatMoney(waterfallResult.preferred_return_amount)} (shortfall)`
                  : `${formatMoney(waterfallResult.preferred_return_amount)} satisfied`
              }
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
