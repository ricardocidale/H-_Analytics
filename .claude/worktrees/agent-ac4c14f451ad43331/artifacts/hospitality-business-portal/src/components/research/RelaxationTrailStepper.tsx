import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, ChevronDown, ChevronUp } from "lucide-react";
import * as React from "react";

interface RelaxationStep {
  level: number;
  criteriaActive: Record<string, unknown>;
  compsFound: number;
  evidenceScore: number;
  retained?: string[];
  relaxed?: string[];
}

interface RelaxationTrailStepperProps {
  traces: RelaxationStep[];
  finalLevel: number;
  className?: string;
}

const LEVEL_LABELS: Record<number, string> = {
  0: "Exact Match",
  1: "Drop Nice Amenities",
  2: "Star ±1, Type Family, MSA",
  3: "Star ±1, Any Type, Must Only",
  4: "Star ±1, State/Region",
  5: "Star Bucket, Country",
};

function RelaxationTrailStepper({ traces, finalLevel, className }: RelaxationTrailStepperProps) {
  const [expandedLevel, setExpandedLevel] = React.useState<number | null>(null);

  if (!traces || traces.length === 0) {
    return (
      <div className={cn("text-sm text-muted-foreground italic py-4 text-center", className)} data-testid="relaxation-trail-empty">
        No relaxation trace available
      </div>
    );
  }

  return (
    <div className={cn("space-y-0", className)} data-testid="relaxation-trail-stepper">
      {traces.map((step, idx) => {
        const isSelected = step.level === finalLevel;
        const isPast = step.level < finalLevel;
        const isFuture = step.level > finalLevel;
        const isExpanded = expandedLevel === step.level;

        return (
          <div key={step.level} className="relative" data-testid={`relaxation-step-${step.level}`}>
            {idx < traces.length - 1 && (
              <div className={cn(
                "absolute left-[11px] top-[28px] bottom-0 w-0.5",
                isPast ? "bg-green-500/40" : isSelected ? "bg-accent-pop/40" : "bg-border"
              )} />
            )}

            <button
              type="button"
              onClick={() => setExpandedLevel(isExpanded ? null : step.level)}
              className="flex items-start gap-3 w-full text-left py-2 px-1 rounded-md hover:bg-accent/30 transition-colors"
              data-testid={`relaxation-step-toggle-${step.level}`}
            >
              <span className="mt-0.5 shrink-0">
                {isPast || isSelected ? (
                  <CheckCircle2 className={cn(
                    "h-[22px] w-[22px]",
                    isSelected ? "text-accent-pop" : "text-green-500"
                  )} />
                ) : (
                  <Circle className="h-[22px] w-[22px] text-muted-foreground/40" />
                )}
              </span>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "text-sm font-medium",
                    isSelected ? "text-accent-pop" : isFuture ? "text-muted-foreground/60" : "text-foreground"
                  )}>
                    L{step.level}: {LEVEL_LABELS[step.level] ?? `Level ${step.level}`}
                  </span>
                  {isSelected && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-accent-pop bg-accent-pop/10 px-1.5 py-0.5 rounded">
                      Selected
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                  <span>{step.compsFound} comps</span>
                  <span>Score: {(step.evidenceScore * 100).toFixed(0)}%</span>
                </div>
              </div>

              <span className="mt-1 text-muted-foreground/60">
                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </span>
            </button>

            {isExpanded && (
              <div className="ml-[35px] mb-2 p-2.5 rounded-md bg-muted/40 border border-border/40 text-xs space-y-1.5" data-testid={`relaxation-detail-${step.level}`}>
                {step.retained && step.retained.length > 0 && (
                  <div>
                    <span className="font-medium text-green-600">Retained: </span>
                    <span className="text-muted-foreground">{step.retained.join(", ")}</span>
                  </div>
                )}
                {step.relaxed && step.relaxed.length > 0 && (
                  <div>
                    <span className="font-medium text-amber-600">Relaxed: </span>
                    <span className="text-muted-foreground">{step.relaxed.join(", ")}</span>
                  </div>
                )}
                <div>
                  <span className="font-medium">Criteria: </span>
                  <span className="text-muted-foreground">{JSON.stringify(step.criteriaActive)}</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

RelaxationTrailStepper.displayName = "RelaxationTrailStepper";

export { RelaxationTrailStepper };
export type { RelaxationStep, RelaxationTrailStepperProps };
