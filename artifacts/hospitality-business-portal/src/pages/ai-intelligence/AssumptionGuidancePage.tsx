/**
 * AssumptionGuidancePage — Analyst-generated calibration output.
 *
 * Doctrine (binding):
 *   hplus-admin-nav-ia — Assumption Guidance is research RUN OUTPUT from
 *     the Analyst, not a data source. It lives in AI Intelligence, not Admin → Sources.
 *
 * Shows AI-generated suggested ranges with sources for financial assumptions.
 * These are the Analyst's recommended calibration values that the admin can
 * accept or reject before they flow into the financial engine defaults.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconActivity, IconSparkles } from "@/components/icons";

export default function AssumptionGuidancePage() {
  return (
    <div className="space-y-6" data-testid="page-assumption-guidance">
      {/* What this is */}
      <Card className="border-border/40 bg-muted/10">
        <CardContent className="py-4">
          <div className="flex items-start gap-3 text-sm text-muted-foreground">
            <IconActivity className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-medium text-foreground/80">
                Assumption Guidance — Analyst-generated calibration output
              </p>
              <p>
                After research runs complete, the Analyst synthesizes findings into
                suggested value ranges with cited sources for each financial assumption.
                These suggestions appear here for admin review before being applied to
                the Steady State defaults.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pending state */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-base flex items-center gap-2">
            <IconSparkles className="w-4 h-4 text-accent-pop" aria-hidden="true" />
            Pending Guidance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              No guidance proposals are pending review.
            </p>
            <p className="text-xs text-muted-foreground/70">
              Guidance proposals appear here after research Specialists complete their runs.
              Trigger research from{" "}
              <span className="font-medium text-foreground/70">Admin → Sources</span>{" "}
              to generate new calibration suggestions.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
