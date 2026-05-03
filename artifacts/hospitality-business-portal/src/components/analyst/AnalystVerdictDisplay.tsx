/**
 * AnalystVerdictDisplay — renders an `AnalystVerdict` (the frozen unified
 * Specialist contract from `engine/analyst/contracts/verdict.ts`) as a
 * structured card stack: one card per dimension, plus a top-level voice
 * banner and a meta footer.
 *
 * Visual language mirrors `AnalystRangeIndicator` (severity-tinted accents,
 * Analyst voice) but at full-card scale so the user can read the Analyst's
 * structured argument inline below the inputs that produced it.
 *
 * Action handling: each dimension can carry `actions[]` (e.g. `set-value`,
 * `accept-range`, `view-source`, `dismiss`). For v1, actions render as
 * compact buttons that fire `onAction(dimension, action)` — wiring
 * specific behaviors (jump to field, write a value, open admin) is the
 * caller's responsibility so this component stays presentational.
 */
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IconSparkles, IconCheckCircle, IconAlertTriangle } from "@/components/icons";
import { ExternalLink } from "@/components/icons/themed-icons";
import type {
  AnalystVerdict,
  VerdictDimension,
  VerdictAction,
  Severity,
} from "@engine/analyst/contracts/verdict";
import { getFieldRegistryEntry } from "@engine/analyst/registry/field-registry";
import { resolveFieldMountPoint } from "@/lib/analyst-mount-points";

interface AnalystVerdictDisplayProps {
  verdict: AnalystVerdict | null | undefined;
  /** Optional action callback. If omitted, action buttons are inert. */
  onAction?: (dimension: VerdictDimension, action: VerdictAction) => void;
  /**
   * The property currently in scope (when the surface that owns this
   * display is property-scoped, e.g. PropertyEdit). Threaded through to
   * the mount-point resolver so `property-edit/*` slugs can produce a
   * working "Open this field" deep link. Omit on company-level surfaces;
   * the CTA simply hides for property-scoped fields when no id is in scope.
   */
  propertyId?: string | number;
}

const SEVERITY_THEME: Record<
  Severity,
  { ring: string; chip: string; iconBg: string; iconColor: string; label: string }
> = {
  ok: {
    ring: "border-emerald-500/30 bg-emerald-500/5",
    chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    iconBg: "bg-emerald-500/15",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    label: "On target",
  },
  advisory: {
    ring: "border-sky-500/30 bg-sky-500/5",
    chip: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
    iconBg: "bg-sky-500/15",
    iconColor: "text-sky-600 dark:text-sky-400",
    label: "Advisory",
  },
  warning: {
    ring: "border-amber-500/40 bg-amber-500/5",
    chip: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    iconBg: "bg-amber-500/15",
    iconColor: "text-amber-700 dark:text-amber-400",
    label: "Worth a second look",
  },
  block: {
    ring: "border-red-500/40 bg-red-500/5",
    chip: "bg-red-500/10 text-red-700 dark:text-red-400",
    iconBg: "bg-red-500/15",
    iconColor: "text-red-600 dark:text-red-400",
    label: "Blocking",
  },
};

function formatRange(range: VerdictDimension["range"]): string | null {
  if (!range) return null;
  const fmt = (n: number) => {
    // Opus returns % dimensions as decimal fractions (0.20 = 20%) per the prompt contract.
    // Multiply by 100 before display.
    if (range.unit === "%") return `${(n * 100).toFixed(1)}%`;
    if (range.unit === "$") return `$${n.toLocaleString()}`;
    return `${n}${range.unit ? ` ${range.unit}` : ""}`;
  };
  return `${fmt(range.low)}–${fmt(range.high)}`;
}

function severityIcon(severity: Severity) {
  if (severity === "ok") return <IconCheckCircle className="h-4 w-4" />;
  if (severity === "warning" || severity === "block")
    return <IconAlertTriangle className="h-4 w-4" />;
  return <IconSparkles className="h-4 w-4" />;
}

function DimensionCard({
  dimension,
  index,
  onAction,
  propertyId,
}: {
  dimension: VerdictDimension;
  index: number;
  onAction?: (d: VerdictDimension, a: VerdictAction) => void;
  propertyId?: string | number;
}) {
  const theme = SEVERITY_THEME[dimension.severity];
  const range = formatRange(dimension.range);

  // Resolve the field's edit-screen deep link via the registry mount point.
  // Hidden when the field isn't registered (no broken-link risk on
  // fallback-heuristic fields) or when the slug requires context the
  // surface doesn't have (e.g. property-edit slug on a company surface).
  // The dimension's `field` is threaded through as `fieldId` so the target
  // URL carries `?focus=<fieldId>` and the destination page can scroll +
  // focus the matching form input rather than only the section anchor.
  const registryEntry = getFieldRegistryEntry(dimension.field);
  const mountTarget = registryEntry
    ? resolveFieldMountPoint(registryEntry.mountPoint, {
        propertyId,
        fieldId: dimension.field,
      })
    : null;

  // Default click handler for verdict actions when the parent didn't pass
  // an explicit `onAction`. For "consult-cognitive" (the "Adjust" CTA),
  // this jumps the user to the field's mount point — closing the
  // registry's deep-link loop (task #751). All other action kinds remain
  // inert without an explicit handler so a missing wire-up is loud rather
  // than silently navigating somewhere unexpected.
  const handleAction = (action: VerdictAction) => {
    if (onAction) {
      onAction(dimension, action);
      return;
    }
    if (action.kind === "consult-cognitive" && mountTarget) {
      mountTarget.navigate();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: 0.05 + index * 0.04, ease: "easeOut" }}
      className={cn(
        "rounded-lg border p-4 shadow-sm backdrop-blur-sm",
        theme.ring,
      )}
      data-testid={`verdict-dimension-${dimension.field}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className={cn(
              "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
              theme.iconBg,
              theme.iconColor,
            )}
          >
            {severityIcon(dimension.severity)}
          </span>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4
                className="font-display text-sm text-foreground"
                data-testid={`verdict-headline-${dimension.field}`}
              >
                {dimension.voice.headline}
              </h4>
              <Badge
                variant="secondary"
                className={cn("border-transparent text-[10px] uppercase tracking-wide", theme.chip)}
                data-testid={`verdict-severity-${dimension.field}`}
              >
                {theme.label}
              </Badge>
              {mountTarget ? (
                <a
                  href={mountTarget.href}
                  onClick={(e) => {
                    // Let modifier-clicks (cmd/ctrl/middle/shift) fall through to
                    // the browser's native open-in-new-tab behavior; intercept
                    // only the bare primary click for SPA-friendly nav.
                    if (
                      e.defaultPrevented ||
                      e.button !== 0 ||
                      e.metaKey ||
                      e.ctrlKey ||
                      e.shiftKey ||
                      e.altKey
                    ) {
                      return;
                    }
                    e.preventDefault();
                    mountTarget.navigate();
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline focus:underline focus:outline-none"
                  data-testid={`link-verdict-open-field-${dimension.field}`}
                >
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  Open this field
                </a>
              ) : null}
            </div>
            {dimension.voice.detail ? (
              <p
                className="text-xs text-muted-foreground leading-relaxed"
                data-testid={`verdict-detail-${dimension.field}`}
              >
                {dimension.voice.detail}
              </p>
            ) : null}
          </div>
        </div>
        {range ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "shrink-0 rounded-md px-2 py-1 text-[11px] font-medium tabular-nums cursor-help",
                  theme.chip,
                )}
                data-testid={`verdict-range-${dimension.field}`}
              >
                {range}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">
              <p className="font-semibold mb-1">The Analyst suggests {range}</p>
              {dimension.range?.mid != null ? (
                <p className="text-muted-foreground">
                  Midpoint: {dimension.range.unit === "%"
                    ? `${(dimension.range.mid * 100).toFixed(1)}%`
                    : dimension.range.unit === "$"
                      ? `$${dimension.range.mid.toLocaleString()}`
                      : dimension.range.mid}
                </p>
              ) : null}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      {dimension.actions.length > 0 ? (
        <div
          className="mt-3 flex flex-wrap gap-2"
          data-testid={`verdict-actions-${dimension.field}`}
        >
          {dimension.actions.map((action, ai) => (
            <Button
              key={`${action.kind}-${ai}`}
              size="sm"
              variant={action.kind === "dismiss" ? "ghost" : "outline"}
              className="h-7 text-xs"
              onClick={() => handleAction(action)}
              data-testid={`button-verdict-action-${dimension.field}-${action.kind}`}
            >
              {action.label}
            </Button>
          ))}
        </div>
      ) : null}
    </motion.div>
  );
}

export function AnalystVerdictDisplay({
  verdict,
  onAction,
  propertyId,
}: AnalystVerdictDisplayProps) {
  if (!verdict) return null;

  const overallTheme = SEVERITY_THEME[verdict.overallSeverity];
  const generated = (() => {
    try {
      return new Date(verdict.generatedAt).toLocaleString();
    } catch {
      return verdict.generatedAt;
    }
  })();

  return (
    <AnimatePresence>
      <motion.section
        key={verdict.generatedAt}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
        className="space-y-3"
        data-testid="analyst-verdict-display"
      >
        <div
          className={cn(
            "rounded-lg border p-4 shadow-sm",
            overallTheme.ring,
          )}
          data-testid="analyst-verdict-overall"
        >
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                overallTheme.iconBg,
                overallTheme.iconColor,
              )}
            >
              <IconSparkles className="h-5 w-5" />
            </span>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3
                  className="font-display text-base text-foreground"
                  data-testid="analyst-verdict-headline"
                >
                  {verdict.voice.headline}
                </h3>
                <Badge
                  variant="secondary"
                  className={cn("border-transparent text-[10px] uppercase tracking-wide", overallTheme.chip)}
                >
                  {overallTheme.label}
                </Badge>
              </div>
              {verdict.voice.detail ? (
                <p
                  className="text-sm text-muted-foreground leading-relaxed"
                  data-testid="analyst-verdict-detail"
                >
                  {verdict.voice.detail}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {verdict.dimensions.map((d, idx) => (
            <DimensionCard
              key={d.field}
              dimension={d}
              index={idx}
              onAction={onAction}
              propertyId={propertyId}
            />
          ))}
        </div>

        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] uppercase tracking-wide text-muted-foreground"
          data-testid="analyst-verdict-meta"
        >
          <span>Tier {verdict.meta.tier}</span>
          <span>·</span>
          <span>Quality {Math.round(verdict.overallQualityScore)}/100</span>
          <span>·</span>
          <span>{Math.round(verdict.meta.durationMs)} ms</span>
          <span>·</span>
          <span>{generated}</span>
          {verdict.meta.fallbackReason ? (
            <>
              <span>·</span>
              <span className="text-amber-700 dark:text-amber-400">
                Fallback: {verdict.meta.fallbackReason.replace(/_/g, " ")}
              </span>
            </>
          ) : null}
        </div>
      </motion.section>
    </AnimatePresence>
  );
}
