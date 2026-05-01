import { useState } from "react";
import { ChevronDown, ChevronUp, Target, TrendingUp } from "lucide-react";
import type { RebeccaContext } from "@/lib/panel-manager";
import { cn } from "@/lib/utils";

interface RebeccaContextCardProps {
  context: RebeccaContext;
}

function formatRate(v: number | null | undefined): string {
  if (v == null) return "—";
  if (Math.abs(v) < 1) return `${(v * 100).toFixed(1)}%`;
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function RebeccaContextCard({ context }: RebeccaContextCardProps) {
  const [expanded, setExpanded] = useState(false);

  const hasRange =
    context.guidanceLow != null ||
    context.guidanceMid != null ||
    context.guidanceHigh != null;

  if (!context.fieldName) return null;

  return (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      className={cn(
        "w-full text-left px-4 py-2.5 border-b border-border/40 bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer",
        expanded && "pb-3"
      )}
      data-testid="rebecca-context-card"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Target className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="text-xs font-medium truncate" data-testid="rebecca-context-field">
            {context.fieldName}
          </span>
          {context.entityType && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary capitalize shrink-0">
              {context.entityType}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        )}
      </div>

      {expanded && (
        <div className="mt-2 space-y-1.5 pl-5.5">
          {context.currentValue != null && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Current:</span>
              <span className="font-medium" data-testid="rebecca-context-current-value">
                {formatRate(context.currentValue)}
              </span>
            </div>
          )}
          {hasRange && (
            <div className="flex items-center gap-2 text-xs">
              <TrendingUp className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Range:</span>
              <span className="font-medium" data-testid="rebecca-context-range">
                {formatRate(context.guidanceLow)} — {formatRate(context.guidanceMid)} — {formatRate(context.guidanceHigh)}
              </span>
            </div>
          )}
        </div>
      )}
    </button>
  );
}
