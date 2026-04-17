/**
 * AnalystCheckDialog — centered, focus-trapped modal that surfaces watchdog
 * findings in Analyst voice with preset clickable answers.
 *
 * Triggered after a Company Assumptions tab Save when the deterministic
 * evaluator returns `severity !== "ok"`. No free-text input, no Rebecca
 * link — Analyst and Rebecca are separate agents.
 *
 * Default focus is on the conservative action (Adjust if present, then Got it,
 * with Save Anyway intentionally never the default).
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
import type { WatchdogResult, WatchdogAction, WatchdogActionKind } from "../../../../engine/watchdog/capitalRaiseEvaluator";

export interface AnalystCheckDialogProps {
  open: boolean;
  result: WatchdogResult | null;
  /** Friendly name of the tab that triggered the check (e.g. "Funding"). */
  tabLabel?: string;
  onAction: (action: WatchdogAction) => void;
  onOpenChange: (open: boolean) => void;
}

const VARIANT_BY_KIND: Record<WatchdogActionKind, "default" | "outline" | "ghost"> = {
  adjust: "default",
  ack: "outline",
  save_anyway: "ghost",
};

/**
 * Pure helper extracted for unit testing — returns the index of the action
 * the dialog should focus by default. Conservative-first ordering: Adjust
 * before Got it; Save Anyway is intentionally never the default.
 */
export function pickDefaultActionIndex(actions: WatchdogAction[]): number {
  const adjustIdx = actions.findIndex((a) => a.kind === "adjust");
  if (adjustIdx >= 0) return adjustIdx;
  const ackIdx = actions.findIndex((a) => a.kind === "ack");
  return ackIdx >= 0 ? ackIdx : -1;
}

export function AnalystCheckDialog({
  open,
  result,
  tabLabel,
  onAction,
  onOpenChange,
}: AnalystCheckDialogProps) {
  const defaultActionRef = useRef<HTMLButtonElement | null>(null);

  // Default focus on the conservative action: Adjust > Got it > (never) Save Anyway.
  const defaultActionIndex = useMemo(() => {
    if (!result) return -1;
    const adjustIdx = result.suggestedActions.findIndex((a) => a.kind === "adjust");
    if (adjustIdx >= 0) return adjustIdx;
    const ackIdx = result.suggestedActions.findIndex((a) => a.kind === "ack");
    return ackIdx >= 0 ? ackIdx : -1;
  }, [result]);

  useEffect(() => {
    if (!open) return;
    // Defer to next paint so Radix has wired up the focus trap.
    const t = setTimeout(() => defaultActionRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open, result]);

  if (!result) return null;

  const isAlert = result.severity === "alert";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        data-testid="dialog-analyst-check"
        data-severity={result.severity}
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
            {result.verdict}
          </DialogDescription>
        </DialogHeader>

        {result.reasoning.length > 0 && (
          <ul className="mt-2 space-y-2 text-sm text-muted-foreground" data-testid="list-analyst-reasoning">
            {result.reasoning.map((bullet, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1.5 inline-block w-1 h-1 rounded-full bg-current flex-shrink-0" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter className="gap-2 sm:gap-2 sm:justify-end mt-4">
          {result.suggestedActions.map((action, i) => (
            <Button
              key={`${action.kind}-${i}`}
              ref={i === defaultActionIndex ? defaultActionRef : undefined}
              variant={VARIANT_BY_KIND[action.kind]}
              onClick={() => onAction(action)}
              className={cn(action.kind === "save_anyway" && "text-muted-foreground")}
              data-testid={`button-analyst-action-${action.kind}`}
            >
              {action.label}
            </Button>
          ))}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
