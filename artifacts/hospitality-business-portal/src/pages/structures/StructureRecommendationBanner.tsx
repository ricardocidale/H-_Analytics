import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { StructureMetrics } from "@calc/analysis/structure-comparison";
import { RISK_BADGE, fmtIrr, fmtMoney, fmtMoic } from "./structure-comparison-utils";

interface StructureRecommendationBannerProps {
  recommended: StructureMetrics;
  propertyName: string;
  isCloseCall: boolean;
  recommendationRationale: string;
}

export function StructureRecommendationBanner({
  recommended,
  propertyName,
  isCloseCall,
  recommendationRationale,
}: StructureRecommendationBannerProps) {
  return (
    <Card
      className={isCloseCall ? "border-amber-500/40 bg-amber-500/5" : "border-primary/40 bg-primary/5"}
      data-testid="card-recommendation"
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Recommended structure for {propertyName}
            </p>
            <CardTitle className="text-2xl mt-1" data-testid="text-recommendation-label">
              {recommended.label}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {isCloseCall && (
              <Badge
                className="bg-amber-500/15 text-amber-700 dark:text-amber-400"
                data-testid="badge-close-call"
              >
                Close call
              </Badge>
            )}
            <Badge
              className={RISK_BADGE[recommended.riskProfile]?.className}
              data-testid="badge-recommendation-risk"
            >
              {RISK_BADGE[recommended.riskProfile]?.label} risk
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground" data-testid="text-recommendation-description">
          {recommended.description}
        </p>
        <p
          className="text-sm text-foreground/90 leading-relaxed border-l-2 border-primary/40 pl-3"
          data-testid="text-recommendation-rationale"
        >
          {recommendationRationale}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div>
            <p className="text-xs text-muted-foreground">Unlevered IRR</p>
            <p className="text-lg font-semibold" data-testid="text-recommendation-unlevered-irr">
              {fmtIrr(recommended.unleveredIrr)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Levered IRR</p>
            <p className="text-lg font-semibold" data-testid="text-recommendation-levered-irr">
              {fmtIrr(recommended.leveredIrr)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Equity Multiple</p>
            <p className="text-lg font-semibold" data-testid="text-recommendation-moic">
              {fmtMoic(recommended.equityMultiple)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Avg NOI</p>
            <p className="text-lg font-semibold" data-testid="text-recommendation-avg-noi">
              {fmtMoney(recommended.avgNoi)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
