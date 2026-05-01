import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/financialEngine";
import type { ScenarioResult } from "./types";

interface KPISummaryStripProps {
  baseResult: ScenarioResult;
  adjustedResult: ScenarioResult;
  hasAdjustments: boolean;
  onReset: () => void;
}

function pctChange(adjusted: number, base: number) {
  if (base === 0) return 0;
  return ((adjusted - base) / Math.abs(base)) * 100;
}

export function KPISummaryStrip({ baseResult, adjustedResult, hasAdjustments, onReset }: KPISummaryStripProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="bg-card border border-border rounded-xl p-4 flex flex-col justify-center shadow-sm">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Base IRR</span>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-mono font-bold text-foreground">{(baseResult.irr * 100).toFixed(1)}%</span>
          {hasAdjustments && (
            <span className={`text-xs font-bold ${(adjustedResult.irr - baseResult.irr) >= 0 ? "text-primary" : "text-destructive"}`}>
              { (adjustedResult.irr - baseResult.irr) >= 0 ? "+" : "" }
              {((adjustedResult.irr - baseResult.irr) * 100).toFixed(1)}pp
            </span>
          )}
        </div>
      </div>
      <div className="bg-card border border-border rounded-xl p-4 flex flex-col justify-center shadow-sm">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Base NOI</span>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-mono font-bold text-foreground">{formatMoney(baseResult.totalNOI)}</span>
          {hasAdjustments && (
            <span className={`text-xs font-bold ${pctChange(adjustedResult.totalNOI, baseResult.totalNOI) >= 0 ? "text-primary" : "text-destructive"}`}>
              { pctChange(adjustedResult.totalNOI, baseResult.totalNOI) >= 0 ? "+" : "" }
              {pctChange(adjustedResult.totalNOI, baseResult.totalNOI).toFixed(1)}%
            </span>
          )}
        </div>
      </div>
      <div className="bg-card border border-border rounded-xl p-4 flex flex-col justify-center shadow-sm">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Exit Value</span>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-mono font-bold text-foreground">{formatMoney(baseResult.exitValue)}</span>
          {hasAdjustments && (
            <span className={`text-xs font-bold ${pctChange(adjustedResult.exitValue, baseResult.exitValue) >= 0 ? "text-primary" : "text-destructive"}`}>
              { pctChange(adjustedResult.exitValue, baseResult.exitValue) >= 0 ? "+" : "" }
              {pctChange(adjustedResult.exitValue, baseResult.exitValue).toFixed(1)}%
            </span>
          )}
        </div>
      </div>
      <div className="bg-card border border-border rounded-xl p-4 flex flex-col justify-center shadow-sm">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Adjusted IRR</span>
        <div className="flex items-center justify-between">
          <span className={`text-2xl font-mono font-bold ${hasAdjustments ? (adjustedResult.irr >= baseResult.irr ? "text-primary" : "text-destructive") : "text-foreground"}`}>
            {(adjustedResult.irr * 100).toFixed(1)}%
          </span>
          {hasAdjustments && (
            <Button 
              variant="link"
              size="sm"
              onClick={onReset}
              className="text-[10px] font-bold text-primary hover:underline h-auto p-0"
              data-testid="button-reset-kpi"
            >
              RESET
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
