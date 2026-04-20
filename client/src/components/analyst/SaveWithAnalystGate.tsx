/**
 * SaveWithAnalystGate — the Save-time soft-gate.
 *
 * Wraps a parent's Save action. On click:
 *   1. Compute violations against Analyst guidance for the canonical field list.
 *   2. If no "blunt" violations → invoke onSave directly (no modal, no friction).
 *   3. Otherwise → open a dialog that restates the violations, lists the
 *      Analyst's ranges + reasoning, and offers three explicit actions:
 *          [Cancel]  [Save Anyway]  [Analyst ✨]
 *
 * When the user picks Analyst ✨, onAnalystRerun fires and the dialog stays
 * open with a running indicator. When the rerun completes (analystRunning
 * transitions true→false), violations are re-computed from the freshly-
 * invalidated guidance; if the new draft is now within band, the dialog
 * auto-closes and Save proceeds. Otherwise the dialog restates the
 * remaining violations and the user can still Save Anyway.
 *
 * This component DOES NOT own the Save mutation — it just intercepts the
 * click. The parent stays the source of truth for dirty state, loading
 * spinners, and the actual API call.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button, type ButtonProps } from "@/components/ui/button";
import { AnalystActionButton } from "./AnalystActionButton";
import {
  computeAnalystViolations,
  type AnalystViolation,
} from "./analyst-violations";
import type { AnalystGuidanceRecord } from "./useAnalystRefresh";

export interface SaveWithAnalystGateProps {
  /** Current form state. Flat keys only — pre-flatten envelopes if needed. */
  draft: Record<string, unknown>;
  /** Guidance records for the relevant scope (company / property / etc). */
  guidance: AnalystGuidanceRecord[];
  /** Canonical assumption keys covered by this Save action. */
  fields: readonly string[];
  /** Invoked when the Save should proceed (either silently or via "Save Anyway"). */
  onSave: () => void;
  /** Fires a scoped Analyst rerun. Called when the user picks "Analyst ✨". */
  onAnalystRerun: (fields?: string[]) => void;
  /** Parent-driven run + cooldown state from `useAnalystRefresh`. */
  analystRunning?: boolean;
  analystCooldownMs?: number;
  /** Passed through to the inner Save button. */
  saveLabel?: string;
  saveVariant?: ButtonProps["variant"];
  saveSize?: ButtonProps["size"];
  saveDisabled?: boolean;
  saveClassName?: string;
  testIdSuffix?: string;
}

function formatPct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/** Human-ish display for the draft value and the band — no unit knowledge
 *  here; we show raw numbers. Callers whose fields need "%" or "$" display
 *  can render a richer row themselves via a follow-up iteration. */
function renderBand(v: AnalystViolation): string {
  return `value ${v.value} vs Analyst range [${v.low} – ${v.high}]`;
}

export function SaveWithAnalystGate(props: SaveWithAnalystGateProps) {
  const {
    draft,
    guidance,
    fields,
    onSave,
    onAnalystRerun,
    analystRunning = false,
    analystCooldownMs = 0,
    saveLabel = "Save",
    saveVariant = "default",
    saveSize,
    saveDisabled = false,
    saveClassName,
    testIdSuffix,
  } = props;

  const [open, setOpen] = useState(false);
  // True only while the user is waiting for an in-dialog rerun to finish.
  // Separate from analystRunning so a background rerun triggered from a
  // header button doesn't auto-close the dialog.
  const [awaitingRerun, setAwaitingRerun] = useState(false);

  const { violations, shouldInterrupt } = useMemo(
    () => computeAnalystViolations({ draft, guidance, fields }),
    [draft, guidance, fields],
  );

  // Track the analystRunning transition to detect "rerun just finished".
  const prevRunning = useRef<boolean>(analystRunning);
  useEffect(() => {
    const justFinished = prevRunning.current && !analystRunning;
    prevRunning.current = analystRunning;
    if (!justFinished) return;
    if (!awaitingRerun) return;

    setAwaitingRerun(false);
    // Recompute from the freshest guidance prop (already propagated via
    // query invalidation in useAnalystRefresh). If the draft is now
    // within band, auto-close and save.
    const { shouldInterrupt: stillInterrupt } = computeAnalystViolations({
      draft,
      guidance,
      fields,
    });
    if (!stillInterrupt) {
      setOpen(false);
      onSave();
    }
  }, [analystRunning, awaitingRerun, draft, guidance, fields, onSave]);

  const handleSaveClick = () => {
    if (!shouldInterrupt) {
      onSave();
      return;
    }
    setOpen(true);
  };

  const handleSaveAnyway = () => {
    setOpen(false);
    onSave();
  };

  const handleRerun = () => {
    setAwaitingRerun(true);
    onAnalystRerun([...fields]);
  };

  const handleCancel = () => {
    setOpen(false);
    setAwaitingRerun(false);
  };

  const testIdSave = testIdSuffix
    ? `button-save-${testIdSuffix}`
    : "button-save";

  return (
    <>
      <Button
        type="button"
        variant={saveVariant}
        size={saveSize}
        className={saveClassName}
        disabled={saveDisabled}
        onClick={handleSaveClick}
        data-testid={testIdSave}
      >
        {saveLabel}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) handleCancel();
          else setOpen(next);
        }}
      >
        <DialogContent data-testid="dialog-analyst-gate">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Values look far from the Analyst's range
            </DialogTitle>
            <DialogDescription>
              {violations.length === 1
                ? "One field is outside a high-confidence range. You can save anyway, re-run the Analyst, or cancel."
                : `${violations.length} fields are outside high-confidence ranges. You can save anyway, re-run the Analyst, or cancel.`}
            </DialogDescription>
          </DialogHeader>

          <ul
            className="mt-2 space-y-3 max-h-72 overflow-y-auto"
            data-testid="list-analyst-violations"
          >
            {violations.map((v) => (
              <li
                key={v.field}
                className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm"
                data-testid={`violation-${v.field}`}
              >
                <div className="font-medium text-foreground">{v.field}</div>
                <div className="text-muted-foreground">{renderBand(v)}</div>
                <div className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                  {formatPct(v.outOfBandPct)} {v.direction} range
                  {v.sourceName ? ` · source: ${v.sourceName}` : ""}
                </div>
                {v.reasoning && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {v.reasoning}
                  </div>
                )}
              </li>
            ))}
          </ul>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={handleCancel}
              data-testid="button-gate-cancel"
              disabled={awaitingRerun}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleSaveAnyway}
              data-testid="button-gate-save-anyway"
              disabled={awaitingRerun}
            >
              Save Anyway
            </Button>
            <AnalystActionButton
              variant="modal"
              onClick={handleRerun}
              running={analystRunning || awaitingRerun}
              cooldownRemainingMs={analystCooldownMs}
              testIdSuffix="gate"
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
