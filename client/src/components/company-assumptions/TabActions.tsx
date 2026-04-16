/**
 * TabActions.tsx — Per-tab action bar for Company Assumptions.
 *
 * Each of the 7 tabs renders its own TabActions row with:
 *   • "Ask the Analyst" — pulsating AI button that fires domain-specific
 *     research (shares the same company-research endpoint — the tab label
 *     is just UI framing).
 *   • Save — saves only the fields dirty within this tab (per-tab save
 *     semantics, not global-save).
 *   • Post-save validation warnings — after a save, if any saved field
 *     fell outside The Analyst's recommended range, we surface inline
 *     "Adjust" / "Keep my value" prompts. "Keep" writes to
 *     assumption_change_log with source = "user_override".
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SaveButton } from "@/components/ui/save-button";
import { OrbitalDots } from "@/components/ui/ai-loader";
import { IconPlay, IconAlertTriangle, IconCheck } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";

export interface TabValidationWarning {
  fieldName: string;
  fieldLabel: string;
  currentValue: number;
  rangeLow: number;
  rangeHigh: number;
  display: string;
}

interface TabActionsProps {
  tabLabel: string;
  hasChanges: boolean;
  isSaving: boolean;
  isAnalystRunning: boolean;
  onSave: () => void;
  onAskAnalyst: () => void;
  askAnalystDisabled?: boolean;
  askAnalystDisabledReason?: string;
  warnings: TabValidationWarning[];
  onDismissWarning: (fieldName: string) => void;
}

export function TabActions({
  tabLabel,
  hasChanges,
  isSaving,
  isAnalystRunning,
  onSave,
  onAskAnalyst,
  askAnalystDisabled,
  askAnalystDisabledReason,
  warnings,
  onDismissWarning,
}: TabActionsProps) {
  const { toast } = useToast();
  const [keepingField, setKeepingField] = useState<string | null>(null);

  const handleKeep = async (w: TabValidationWarning) => {
    setKeepingField(w.fieldName);
    try {
      await fetch("/api/assumption-change-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: "company",
          entityId: 0,
          fieldName: w.fieldName,
          newValue: w.currentValue,
          changeSource: "user_override",
          reason: `User kept value outside Analyst range ${w.display}`,
        }),
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
    <div className="space-y-3 pt-4 border-t border-border/40">
      {warnings.length > 0 && (
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
      )}

      <div className="flex items-center justify-end gap-2">
        <div className="relative inline-flex">
          {!isAnalystRunning && !askAnalystDisabled && (
            <span
              aria-hidden
              className="absolute inset-0 rounded-md animate-ping bg-primary/30"
              style={{ animationDuration: "2s" }}
            />
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onAskAnalyst}
            disabled={askAnalystDisabled || isAnalystRunning}
            title={askAnalystDisabled ? askAnalystDisabledReason : `Research ${tabLabel.toLowerCase()}`}
            className="relative z-10"
            data-testid={`button-ask-analyst-${tabLabel.toLowerCase().replace(/\s+/g, "-")}`}
          >
            {isAnalystRunning ? <OrbitalDots size={14} /> : <IconPlay className="w-3.5 h-3.5" />}
            {isAnalystRunning ? "Consulting..." : `Ask the Analyst — ${tabLabel}`}
          </Button>
        </div>
        <SaveButton
          onClick={onSave}
          isPending={isSaving}
          hasChanges={hasChanges}
          size="sm"
          data-testid={`button-save-tab-${tabLabel.toLowerCase().replace(/\s+/g, "-")}`}
        >
          Save {tabLabel}
        </SaveButton>
      </div>
    </div>
  );
}
