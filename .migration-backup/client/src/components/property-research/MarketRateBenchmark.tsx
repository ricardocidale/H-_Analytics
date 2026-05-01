import { useFREDRates, type FREDRateDataResponse } from "@/lib/api/market-rates";
import { RateSparkline } from "./RateSparkline";
import { ProvenanceBadge } from "./ProvenanceBadge";
import { Button } from "@/components/ui/button";
import { Loader2 } from "@/components/icons/themed-icons";

const RATE_META: Record<string, { label: string; unit: string; color: string; description: string }> = {
  sofr: { label: "SOFR", unit: "%", color: "hsl(var(--chart-1))", description: "Secured Overnight Financing Rate" },
  treasury2y: { label: "2Y Treasury", unit: "%", color: "hsl(var(--chart-2))", description: "2-Year Treasury Yield" },
  treasury5y: { label: "5Y Treasury", unit: "%", color: "hsl(var(--chart-4))", description: "5-Year Treasury Yield" },
  treasury10y: { label: "10Y Treasury", unit: "%", color: "hsl(var(--accent-pop))", description: "10-Year Treasury Yield" },
  primeRate: { label: "Prime Rate", unit: "%", color: "hsl(var(--destructive))", description: "US Prime Lending Rate" },
  cpi: { label: "CPI", unit: "", color: "hsl(var(--primary))", description: "Consumer Price Index" },
};

interface MarketRateBenchmarkProps {
  onApplyRate?: (key: string, value: number) => void;
  applicableRates?: string[];
  compact?: boolean;
}

export function MarketRateBenchmark({
  onApplyRate,
  applicableRates,
  compact = false,
}: MarketRateBenchmarkProps) {
  const { data: fredRates, isLoading } = useFREDRates();

  if (isLoading) {
    return (
      <div data-testid="market-rates-loading" className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading market rates...
      </div>
    );
  }

  if (!fredRates || Object.keys(fredRates).length === 0) {
    return (
      <div data-testid="market-rates-empty" className="p-4 text-sm text-muted-foreground rounded-xl bg-muted/50">
        FRED API key not configured — market rate benchmarks unavailable.
      </div>
    );
  }

  const entries = Object.entries(fredRates).filter(
    ([key]) => RATE_META[key]
  ) as [string, FREDRateDataResponse][];

  if (compact) {
    return (
      <div data-testid="market-rates-compact" className="flex flex-wrap gap-3">
        {entries.map(([key, rate]) => {
          const meta = RATE_META[key];
          const isApplicable = applicableRates?.includes(key);
          return (
            <div
              key={key}
              data-testid={`rate-compact-${key}`}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/60 dark:bg-white/5 border border-primary/10"
            >
              <div>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{meta.label}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold font-display">{rate.current.value.toFixed(2)}{meta.unit}</span>
                  <ProvenanceBadge provenance="verified" className="scale-75 -ml-0.5" />
                </div>
              </div>
              <div className="w-16">
                <RateSparkline data={rate.history} color={meta.color} height={24} showTooltip={false} />
              </div>
              {isApplicable && onApplyRate && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  data-testid={`apply-rate-${key}`}
                  onClick={() => onApplyRate(key, rate.current.value)}
                >
                  Apply
                </Button>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div data-testid="market-rates-benchmark" className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-sm font-semibold text-foreground">Live Market Rates</h3>
        <ProvenanceBadge provenance="verified" />
        <span className="text-[10px] text-muted-foreground ml-auto">Source: FRED (Federal Reserve)</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {entries.map(([key, rate]) => {
          const meta = RATE_META[key];
          const isApplicable = applicableRates?.includes(key);
          return (
            <div
              key={key}
              data-testid={`rate-card-${key}`}
              className="p-4 rounded-2xl bg-white/60 dark:bg-white/5 backdrop-blur-xl border border-primary/10 shadow-sm"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{meta.label}</span>
                <ProvenanceBadge provenance="verified" className="scale-75" />
              </div>
              <div className="flex items-baseline gap-1.5 mb-1">
                <span className="text-xl font-display font-bold">{rate.current.value.toFixed(2)}{meta.unit}</span>
              </div>
              <p className="text-[10px] text-muted-foreground mb-2">{meta.description}</p>
              <RateSparkline data={rate.history} color={meta.color} height={48} />
              <div className="flex items-center justify-between mt-2">
                <span className="text-[10px] text-muted-foreground">
                  {rate.current.publishedAt ? `As of ${rate.current.publishedAt}` : ""}
                </span>
                {isApplicable && onApplyRate && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-3 text-xs"
                    data-testid={`apply-rate-${key}`}
                    onClick={() => onApplyRate(key, rate.current.value)}
                  >
                    Apply current rate
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
