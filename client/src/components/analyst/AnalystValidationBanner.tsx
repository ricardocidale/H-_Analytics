import { Button } from "@/components/ui/button";
import { IconAlertTriangle, IconSparkles } from "@/components/icons";
import type { Property } from "@shared/schema";

interface GuidanceRecord {
  assumptionKey: string;
  valueLow: number | null;
  valueMid: number | null;
  valueHigh: number | null;
  confidence: string | null;
  reasoning: string | null;
}

interface AnalystValidationBannerProps {
  property: Property;
  guidance?: GuidanceRecord[];
  isGenerating?: boolean;
  onTriggerResearch?: () => void;
  onAcceptRange?: (key: string, value: number) => void;
}

function formatVal(key: string, val: number): string {
  const pctFields = [
    "taxRate", "costRateTaxes", "costRateRooms", "costRateFB", "costRateAdmin",
    "costRateMarketing", "costRatePropertyOps", "costRateUtilities", "costRateIT",
    "costRateFFE", "costRateOther", "costRateInsurance", "exitCapRate",
    "startOccupancy", "maxOccupancy", "adrGrowthRate", "inflationRate",
  ];
  if (pctFields.includes(key)) return `${(val * 100).toFixed(1)}%`;
  if (key === "startAdr") return `$${val.toFixed(0)}`;
  if (key === "depreciationYears") return `${val} yrs`;
  return String(val);
}

export function AnalystValidationBanner({ property, guidance = [], isGenerating, onTriggerResearch, onAcceptRange }: AnalystValidationBannerProps) {
  const status = property.validationStatus;

  if (status === "pending_validation") {
    return (
      <div
        data-testid="banner-pending-validation"
        className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 flex items-center gap-3"
      >
        <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
          <IconSparkles className="w-4 h-4 text-amber-600" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">The Analyst hasn't reviewed this property yet.</p>
          <p className="text-xs text-muted-foreground mt-0.5">Running intelligence analysis to validate your assumptions against market data.</p>
        </div>
        {onTriggerResearch && !isGenerating && (
          <Button size="sm" variant="outline" onClick={onTriggerResearch} data-testid="button-trigger-validation">
            <IconSparkles className="w-3.5 h-3.5 mr-1.5" />
            Run Analysis
          </Button>
        )}
      </div>
    );
  }

  if (status === "flagged") {
    const flagCount = property.flaggedFieldCount ?? 0;
    const flaggedGuidance = guidance.filter(g => {
      if (g.valueLow == null || g.valueHigh == null) return false;
      const currentVal = (property as Record<string, unknown>)[g.assumptionKey];
      if (typeof currentVal !== "number") return false;
      return currentVal < g.valueLow || currentVal > g.valueHigh;
    });

    return (
      <div
        data-testid="banner-flagged"
        className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 space-y-3"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
            <IconAlertTriangle className="w-4 h-4 text-red-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              The Analyst flagged {flagCount} assumption{flagCount !== 1 ? "s" : ""} that need review
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Some values fall outside expected ranges for this market.</p>
          </div>
        </div>
        {flaggedGuidance.length > 0 && (
          <div className="space-y-1.5 pl-11">
            {flaggedGuidance.slice(0, 5).map(g => {
              const currentVal = (property as Record<string, unknown>)[g.assumptionKey];
              const hasVal = typeof currentVal === "number";
              return (
                <div key={g.assumptionKey} className="flex items-center gap-2 text-xs" data-testid={`flag-${g.assumptionKey}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                  <span className="text-foreground font-medium">{g.assumptionKey}</span>
                  {hasVal && <span className="text-muted-foreground">({formatVal(g.assumptionKey, currentVal as number)})</span>}
                  <span className="text-muted-foreground">— The Analyst suggests {formatVal(g.assumptionKey, g.valueLow!)}–{formatVal(g.assumptionKey, g.valueHigh!)}</span>
                  {onAcceptRange && g.valueMid != null && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1.5 text-[10px] text-primary hover:text-primary"
                      onClick={() => onAcceptRange(g.assumptionKey, g.valueMid!)}
                      data-testid={`button-accept-${g.assumptionKey}`}
                    >
                      Accept
                    </Button>
                  )}
                </div>
              );
            })}
            {flaggedGuidance.length > 5 && (
              <p className="text-xs text-muted-foreground">+{flaggedGuidance.length - 5} more flagged fields</p>
            )}
          </div>
        )}
      </div>
    );
  }

  if (status === "stale") {
    const lastValidated = property.lastValidatedAt
      ? Math.floor((Date.now() - new Date(property.lastValidatedAt).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    return (
      <div
        data-testid="banner-stale"
        className="rounded-lg border border-gray-500/20 bg-gray-500/5 p-4 flex items-center gap-3"
      >
        <div className="w-8 h-8 rounded-full bg-gray-500/10 flex items-center justify-center shrink-0">
          <IconSparkles className="w-4 h-4 text-gray-500" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">
            Last reviewed {lastValidated != null ? `${lastValidated} days ago` : "over 30 days ago"} — consider refreshing
          </p>
        </div>
        {onTriggerResearch && (
          <Button size="sm" variant="outline" onClick={onTriggerResearch} data-testid="button-refresh-intelligence">
            <IconSparkles className="w-3.5 h-3.5 mr-1.5" />
            Refresh Intelligence
          </Button>
        )}
      </div>
    );
  }

  return null;
}
