import { IconTarget } from "@/components/icons";
import type { RebeccaContext } from "@/lib/panel-manager";

interface RebeccaContextCardProps {
  context: RebeccaContext;
}

function formatRate(v: number | null | undefined): string {
  if (v == null) return "—";
  if (Math.abs(v) < 1) return `${(v * 100).toFixed(1)}%`;
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function RebeccaContextCard({ context }: RebeccaContextCardProps) {
  if (!context.fieldName) return null;

  const hasRange =
    context.guidanceLow != null ||
    context.guidanceMid != null ||
    context.guidanceHigh != null;

  return (
    <div
      className="mx-3 my-2 rounded-lg border border-border/40 border-l-2 border-l-primary bg-primary/[0.05] px-3 py-2.5"
      data-testid="rebecca-context-card"
    >
      {/* Label + entity type pill */}
      <div className="flex items-center gap-1.5 mb-1">
        <IconTarget className="w-3 h-3 text-primary shrink-0" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-primary/70">
          Grounded on
        </span>
        {context.entityType && (
          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary capitalize font-medium shrink-0">
            {context.entityType}
          </span>
        )}
      </div>

      {/* Field name */}
      <p
        className="text-sm font-semibold text-foreground leading-snug"
        data-testid="rebecca-context-field"
      >
        {context.fieldName}
      </p>

      {/* Entity name */}
      {context.entityName && (
        <p className="text-xs text-muted-foreground mt-0.5">{context.entityName}</p>
      )}

      {/* Current value + guidance range */}
      {(context.currentValue != null || hasRange) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-2 text-xs">
          {context.currentValue != null && (
            <span>
              <span className="text-muted-foreground">Current </span>
              <span className="font-semibold text-foreground" data-testid="rebecca-context-current-value">
                {formatRate(context.currentValue)}
              </span>
            </span>
          )}
          {hasRange && (
            <span>
              <span className="text-muted-foreground">Range </span>
              <span className="font-medium" data-testid="rebecca-context-range">
                {formatRate(context.guidanceLow)}–{formatRate(context.guidanceMid)}–{formatRate(context.guidanceHigh)}
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
