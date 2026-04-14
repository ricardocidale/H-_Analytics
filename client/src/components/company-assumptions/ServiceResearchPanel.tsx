
import { IconBookOpen } from "@/components/icons";
import { computeServiceFee } from "@calc/research/service-fee";
import { computeMarkupWaterfall } from "@calc/research/markup-waterfall";
import type { ServiceTemplate } from "@shared/schema";

export function ServiceResearchPanel({ template }: { template: ServiceTemplate }) {
  const sampleRevenue = 1_500_000;
  const feeBench = computeServiceFee({ propertyRevenue: sampleRevenue, serviceType: template.name });
  const currentRate = template.defaultRate ?? 0;
  const currentFee = sampleRevenue * currentRate;
  const markup = template.serviceMarkup ?? 0;
  const waterfall = template.serviceModel === "centralized"
    ? computeMarkupWaterfall({ vendorCost: currentFee / (1 + markup), markupPct: markup, serviceType: template.name })
    : null;

  return (
    <div className="mt-3 pt-3 border-t border-border/60 space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <IconBookOpen className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground uppercase tracking-wider">Industry Benchmarks</span>
        <span className="text-[10px] text-muted-foreground ml-auto">at $1.5M sample revenue</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-2.5">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Fee Range</div>
          <div className="text-sm font-semibold font-mono text-foreground mt-1">
            {(feeBench.lowRate * 100).toFixed(1)}%–{(feeBench.highRate * 100).toFixed(1)}%
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            ${feeBench.lowFee.toLocaleString()}–${feeBench.highFee.toLocaleString()}
          </div>
        </div>

        <div className={`rounded-lg p-2.5 border ${
          currentRate >= feeBench.lowRate && currentRate <= feeBench.highRate
            ? "bg-primary/10 border-primary/30"
            : currentRate < feeBench.lowRate
            ? "bg-muted/50 border-border/60"
            : "bg-primary/5 border-primary/20"
        }`}>
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Your Rate</div>
          <div className="text-sm font-semibold font-mono text-foreground mt-1">{(currentRate * 100).toFixed(1)}%</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {currentRate >= feeBench.lowRate && currentRate <= feeBench.highRate
              ? "Within range"
              : currentRate < feeBench.lowRate ? "Below market" : "Above market"}
          </div>
        </div>

        {waterfall && (
          <>
            <div className="bg-muted/50 border border-border/60 rounded-lg p-2.5">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Vendor Cost</div>
              <div className="text-sm font-semibold font-mono text-foreground mt-1">${Math.round(waterfall.vendorCost).toLocaleString()}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                at {(markup * 100).toFixed(0)}% markup
              </div>
            </div>
            <div className="bg-primary/10 border border-primary/30 rounded-lg p-2.5">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Gross Profit</div>
              <div className="text-sm font-semibold font-mono text-primary mt-1">${Math.round(waterfall.grossProfit).toLocaleString()}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {(waterfall.effectiveMargin * 100).toFixed(1)}% effective margin
              </div>
            </div>
          </>
        )}

        {!waterfall && (
          <div className="bg-muted/50 border border-border/60 rounded-lg p-2.5 col-span-2">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Direct Service</div>
            <div className="text-sm font-mono text-foreground mt-1">Full fee = revenue</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">No vendor cost (oversight only)</div>
          </div>
        )}
      </div>

      {waterfall?.industryMarkupRange && (
        <div className="text-xs text-muted-foreground bg-card rounded-lg p-2 border border-border">
          Industry markup for {template.name.toLowerCase()}: {(waterfall.industryMarkupRange.low * 100).toFixed(0)}%–{(waterfall.industryMarkupRange.high * 100).toFixed(0)}%
          (mid: {(waterfall.industryMarkupRange.mid * 100).toFixed(0)}%).
          {markup < waterfall.industryMarkupRange.low
            ? " Your markup is below typical range."
            : markup > waterfall.industryMarkupRange.high
            ? " Your markup is above typical range."
            : " Your markup is within range."}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground">{feeBench.notes}</p>
    </div>
  );
}
