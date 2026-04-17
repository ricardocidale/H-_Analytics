/**
 * TabActions.tsx — Post-save warnings panel for Company Assumptions tabs.
 *
 * History: this file used to render a per-tab action bar with the Analyst
 * and Save buttons inline. As of the v2 refactor (April 2026) those buttons
 * live in the tab strip's `rightContent` slot (see `CurrentThemeTab` in
 * `client/src/components/ui/tabs.tsx`), and only the post-save validation
 * warnings remain here.
 *
 * Behavior:
 *   • If a saved field falls outside The Analyst's recommended range we
 *     surface inline "Adjust" / "Keep my value" prompts.
 *   • "Keep" writes to assumption_change_log with source = "user_override"
 *     so the override is auditable.
 *   • Renders nothing (returns null) when there are no warnings.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { OrbitalDots } from "@/components/ui/ai-loader";
import { IconAlertTriangle, IconCheck } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";

export interface TabValidationWarning {
  fieldName: string;
  fieldLabel: string;
  currentValue: number;
  rangeLow: number;
  rangeHigh: number;
  display: string;
}

interface TabWarningsPanelProps {
  warnings: TabValidationWarning[];
  onDismissWarning: (fieldName: string) => void;
}

export function TabWarningsPanel({ warnings, onDismissWarning }: TabWarningsPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [keepingField, setKeepingField] = useState<string | null>(null);

  if (warnings.length === 0) return null;

  const handleKeep = async (w: TabValidationWarning) => {
    setKeepingField(w.fieldName);
    try {
      // 1) Audit trail — append-only record of the override decision.
      // 2) Acknowledgment — keyed snapshot the warning generator reads
      //    on the next save to suppress re-flagging the same value while
      //    it remains inside the acknowledged window. Cleared when the
      //    user edits the field (handled in CompanyAssumptions on change).
      const [logRes, ackRes] = await Promise.all([
        fetch("/api/assumption-change-log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entityType: "company",
            entityId: 0,
            fieldName: w.fieldName,
            newValue: w.currentValue,
            changeSource: "user_override",
            reason: `User kept value outside recommended range ${w.display}`,
          }),
        }),
        fetch("/api/assumption-acknowledgments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entityType: "company",
            entityId: 0,
            fieldName: w.fieldName,
            valueAtAck: w.currentValue,
            rangeLowAtAck: w.rangeLow,
            rangeHighAtAck: w.rangeHigh,
          }),
        }),
      ]);
      // Fail loudly if either write rejected — silently dismissing a
      // warning whose persistence failed would silently desync the UI
      // from the database and re-surface the same flag on next reload.
      if (!logRes.ok || !ackRes.ok) {
        throw new Error(
          `Override write failed (log:${logRes.status} ack:${ackRes.status})`,
        );
      }
      // Refresh the ack cache so the warning generator + RangePillsLayer
      // see the new ack on the next render without waiting for a refetch
      // window.
      await queryClient.invalidateQueries({
        queryKey: ["assumption-acknowledgments", "company", 0],
      });
      toast({ title: "Value kept", description: `${w.fieldLabel} recorded as an intentional override.` });
      onDismissWarning(w.fieldName);
    } catch {
      toast({ title: "Couldn't log override", variant: "destructive" });
    } finally {
      setKeepingField(null);
    }
  };

  const handleAdjust = (w: TabValidationWarning) => {
    const el = document.querySelector<HTMLElement>(`[data-field="${w.fieldName}"], [data-testid*="${w.fieldName}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-destructive", "ring-offset-2");
      setTimeout(() => el.classList.remove("ring-2", "ring-destructive", "ring-offset-2"), 2500);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
        <IconAlertTriangle className="w-4 h-4" />
        The Analyst flagged {warnings.length} value{warnings.length === 1 ? "" : "s"} outside the expected range
      </div>
      <ul className="space-y-1.5">
        {warnings.map((w) => (
          <li
            key={w.fieldName}
            className="flex items-center justify-between gap-3 text-sm"
            data-testid={`warning-${w.fieldName}`}
          >
            <span className="text-foreground">
              <span className="font-medium">{w.fieldLabel}</span> at{" "}
              <span className="font-mono">{w.currentValue}</span> is outside the
              expected range of <span className="font-mono">{w.display}</span>.
            </span>
            <span className="flex items-center gap-1 shrink-0">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleAdjust(w)}
                data-testid={`button-adjust-${w.fieldName}`}
              >
                Adjust
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={keepingField === w.fieldName}
                onClick={() => handleKeep(w)}
                data-testid={`button-keep-${w.fieldName}`}
              >
                {keepingField === w.fieldName ? <OrbitalDots size={14} /> : <IconCheck className="w-3.5 h-3.5" />}
                Keep my value
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
