/**
 * AnalystCheckDialog — centered, focus-trapped modal that surfaces
 * Analyst findings (post-Phase-3b: from a real `AnalystVerdict`).
 *
 * Triggered after a Company Assumptions tab Save when the Surface Router
 * returns `verdict.overallSeverity !== "ok"`. No free-text input, no
 * Rebecca link — Analyst and Rebecca are separate agents.
 *
 * All user-facing strings come from the Voice Renderer (`voice.headline` /
 * `voice.detail`). The dialog never crafts persona-bearing text itself.
 *
 * Action mapping (Phase 3b lock):
 *   - consult-cognitive → primary "Adjust" button (rolls back the save +
 *     scrolls to the field; parent owns the side-effects)
 *   - dismiss           → outline "Got it" button (closes only)
 *   - "Save Anyway"     → ghost button rendered SEPARATELY from the
 *     verdict.actions[] array. The verdict contract has no save-anyway
 *     kind by design; this is a UI-only affordance the parent opts into
 *     by passing `onProceedAnyway`.
 */
import { useEffect, useMemo, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { IconAlertTriangle, IconSparkles } from "@/components/icons";
import { cn } from "@/lib/utils";
import type {
  AnalystVerdict,
  VerdictAction,
  VerdictActionKind,
} from "../../../../engine/analyst/contracts/verdict";

export interface AnalystCheckDialogProps {
  open: boolean;
  verdict: AnalystVerdict | null;
  /** Friendly name of the tab that triggered the check (e.g. "Funding"). */
  tabLabel?: string;
  onAction: (action: VerdictAction) => void;
  /** Optional escape hatch — when provided, a separate "Save Anyway" button
   *  is rendered for non-ok verdicts. The save itself has already landed
   *  server-side, so this just closes + signals "user accepted divergence". */
  onProceedAnyway?: () => void;
  onOpenChange: (open: boolean) => void;
}

const VARIANT_BY_KIND: Partial<Record<VerdictActionKind, "default" | "outline" | "ghost">> = {
  "consult-cognitive": "default",
  "set-value": "default",
  "accept-range": "default",
  "open-admin": "outline",
  "view-source": "outline",
  "dismiss": "outline",
};

function actionDedupeKey(action: VerdictAction): string {
  // Stable key for de-duping repeated actions across dimensions. Uses kind
  // + payload field/url where present so distinct fields stay separate.
  switch (action.kind) {
    case "consult-cognitive":
    case "set-value":
    case "accept-range":
      return `${action.kind}:${action.payload.field}`;
    case "open-admin":
      return `${action.kind}:${action.payload.tableName}`;
    case "view-source":
      return `${action.kind}:${action.payload.url}`;
    case "dismiss":
      return action.kind;
  }
}

/** Pure helper extracted for unit testing — flattens + dedupes verdict
 *  dimension actions in declaration order. */
export function flattenActions(verdict: AnalystVerdict): VerdictAction[] {
  const out: VerdictAction[] = [];
  const seen = new Set<string>();
  for (const dim of verdict.dimensions) {
    for (const a of dim.actions) {
      const key = actionDedupeKey(a);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(a);
    }
  }
  return out;
}

/** Pure helper extracted for unit testing — returns the index of the
 *  action the dialog should focus by default. Conservative-first ordering:
 *  consult-cognitive > dismiss; "Save Anyway" is intentionally never the
 *  default because it lives outside actions[]. */
export function pickDefaultActionIndex(actions: VerdictAction[]): number {
  const adjustIdx = actions.findIndex((a) => a.kind === "consult-cognitive");
  if (adjustIdx >= 0) return adjustIdx;
  const dismissIdx = actions.findIndex((a) => a.kind === "dismiss");
  return dismissIdx >= 0 ? dismissIdx : -1;
}

export function AnalystCheckDialog({
  open,
  verdict,
  tabLabel,
  onAction,
  onProceedAnyway,
  onOpenChange,
}: AnalystCheckDialogProps) {
  const defaultActionRef = useRef<HTMLButtonElement | null>(null);

  const actions = useMemo<VerdictAction[]>(
    () => (verdict ? flattenActions(verdict) : []),
    [verdict],
  );
  const defaultActionIndex = useMemo(() => pickDefaultActionIndex(actions), [actions]);

  // Per-dimension bullets surfaced under the headline. We show only the
  // non-ok dimension headlines (Voice-Renderer-composed) so the user gets
  // the "what + why" breakdown directly from the persona-rule chokepoint.
  const flaggedHeadlines = useMemo(() => {
    if (!verdict) return [] as string[];
    return verdict.dimensions
      .filter((d) => d.severity !== "ok")
      .map((d) => d.voice.headline);
  }, [verdict]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => defaultActionRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open, verdict]);

  if (!verdict) return null;

  const isAlert = verdict.overallSeverity === "warning" || verdict.overallSeverity === "block";
  const showProceedAnyway = !!onProceedAnyway && verdict.overallSeverity !== "ok";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        data-testid="dialog-analyst-check"
        data-severity={verdict.overallSeverity}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-left">
            {isAlert ? (
              <IconAlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
            ) : (
              <IconSparkles className="w-5 h-5 text-accent-pop flex-shrink-0" />
            )}
            <span>
              Analyst Check
              {tabLabel ? <span className="text-muted-foreground font-normal"> — {tabLabel}</span> : null}
            </span>
          </DialogTitle>
          <DialogDescription className="text-left text-foreground/90 pt-1" data-testid="text-analyst-verdict">
            {verdict.voice.headline}
          </DialogDescription>
        </DialogHeader>

        {flaggedHeadlines.length > 0 && (
          <ul className="mt-2 space-y-2 text-sm text-muted-foreground" data-testid="list-analyst-reasoning">
            {flaggedHeadlines.map((bullet, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1.5 inline-block w-1 h-1 rounded-full bg-current flex-shrink-0" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter className="gap-2 sm:gap-2 sm:justify-end mt-4">
          {actions.map((action, i) => (
            <Button
              key={`${action.kind}-${i}`}
              ref={i === defaultActionIndex ? defaultActionRef : undefined}
              variant={VARIANT_BY_KIND[action.kind] ?? "outline"}
              onClick={() => onAction(action)}
              data-testid={`button-analyst-action-${action.kind}`}
            >
              {action.label}
            </Button>
          ))}
          {showProceedAnyway && (
            <Button
              variant="ghost"
              onClick={onProceedAnyway}
              className={cn("text-muted-foreground")}
              data-testid="button-analyst-action-save_anyway"
            >
              Save Anyway
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
