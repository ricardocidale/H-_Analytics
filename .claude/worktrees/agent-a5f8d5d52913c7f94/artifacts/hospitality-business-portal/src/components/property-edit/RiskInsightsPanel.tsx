import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { IconAlertTriangle, IconShield } from "@/components/icons";
import { Loader2, ChevronDown } from "@/components/icons/themed-icons";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface RiskFactor {
  label: string;
  severity: "high" | "medium" | "low";
  description: string;
}

interface StrengthFactor {
  label: string;
  description: string;
}

interface RiskBrief {
  riskGrade: string;
  riskScore: number;
  topRisks: RiskFactor[];
  strengths: StrengthFactor[];
  summary: string;
}

const GRADE_COLORS: Record<string, string> = {
  A: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  B: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  C: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  D: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  F: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const SEVERITY_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  low: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
};

export default function RiskInsightsPanel({ propertyId }: { propertyId: number }) {
  const [isOpen, setIsOpen] = useState(false);

  const { data: brief, isLoading, isError } = useQuery<RiskBrief>({
    queryKey: [`/api/risk/property/${propertyId}/brief`],
    enabled: !!propertyId,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="py-4 flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading risk analysis…
        </CardContent>
      </Card>
    );
  }

  if (isError || !brief) return null;

  const gradeColor = GRADE_COLORS[brief.riskGrade?.[0]] ?? GRADE_COLORS.C;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="bg-card border-border" data-testid="risk-insights-panel">
        <CollapsibleTrigger className="w-full text-left" data-testid="trigger-risk-insights">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <IconShield className="w-5 h-5 text-primary" />
              <CardTitle className="text-sm font-semibold">Risk Insights</CardTitle>
              <Badge variant="secondary" className={cn("text-xs font-bold", gradeColor)} data-testid="text-risk-grade">
                Grade {brief.riskGrade} · {brief.riskScore}/100
              </Badge>
            </div>
            <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {brief.summary && (
              <p className="text-sm text-muted-foreground">{brief.summary}</p>
            )}

            {brief.topRisks?.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Top Risks</h4>
                <div className="space-y-2">
                  {brief.topRisks.slice(0, 5).map((risk, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 rounded-md bg-muted/30" data-testid={`risk-factor-${i}`}>
                      <IconAlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{risk.label}</span>
                          <Badge variant="outline" className={cn("text-[10px]", SEVERITY_COLORS[risk.severity])}>
                            {risk.severity}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{risk.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {brief.strengths?.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Strengths</h4>
                <div className="space-y-1.5">
                  {brief.strengths.slice(0, 3).map((s, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm" data-testid={`strength-factor-${i}`}>
                      <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
                      <div>
                        <span className="font-medium text-foreground">{s.label}</span>
                        {s.description && <span className="text-muted-foreground"> — {s.description}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
