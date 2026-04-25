/**
 * factory-source-badge.tsx — "Where did this number come from?" pill.
 *
 * Renders a small inline badge such as `"1.8% — Texas overlay"` next to a
 * value driven by the model-constants registry. Backed by the registry's
 * `describeFactorySource` helper so Property Edit, the Yearly Income
 * Statement, and the PP&E Cost-Basis Schedule always describe the same
 * underlying value the same way.
 *
 * Hovering the badge surfaces a longer tooltip explaining the cascade
 * (property override → US state overlay → country default → United States
 * baseline) — see Task #604.
 */
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  describeFactorySource,
  type RegisteredConstantKey,
  type FactorySourceKind,
} from "@shared/model-constants-registry";

interface FactorySourceBadgeProps {
  constantKey: RegisteredConstantKey;
  country?: string | null;
  subdivision?: string | null;
  /** Per-property stored value, if any. `undefined`/`null` means "not set". */
  propertyOverride?: number | null;
  className?: string;
}

function tooltipFor(kind: FactorySourceKind, country: string, subdivision: string | null): string {
  switch (kind) {
    case "propertyOverride":
      return "This value is stored on the property and overrides the locality default. Clear the field to fall back to the country / state default.";
    case "stateOverlay":
      return `Applied because this property is in ${subdivision ?? "this state"} (United States). The state overlay sits on top of the United States baseline.`;
    case "countryDefault":
      return `Default for properties in ${country}. Comes from the country defaults table — change country in Property Edit to use a different one.`;
    case "baseline":
      return "Falls back to the United States baseline because no country / state default is registered for this property's locality.";
  }
}

export function FactorySourceBadge({
  constantKey,
  country,
  subdivision,
  propertyOverride,
  className,
}: FactorySourceBadgeProps) {
  const source = describeFactorySource(
    constantKey,
    country,
    subdivision,
    propertyOverride ?? undefined,
  );

  const help = tooltipFor(source.kind, source.country, source.subdivision);

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={`cursor-help text-[10px] font-medium px-2 py-0.5 ${className ?? ""}`}
          data-testid={`badge-factory-source-${constantKey}`}
        >
          {source.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="center"
        className="max-w-xs text-xs leading-relaxed"
        data-testid={`badge-factory-source-tooltip-${constantKey}`}
      >
        {help}
      </TooltipContent>
    </Tooltip>
  );
}
