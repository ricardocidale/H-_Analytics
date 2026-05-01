/**
 * SaveWithAnalystGate — the Save-time soft-gate.
 *
 * Two shapes:
 *   1. `<SaveWithAnalystGate />` — a drop-in wrapper that renders its own
 *      Save button and dialog. Best for surfaces that own the Save button
 *      locally (property edit page, CompanyAssumptions).
 *   2. `useAnalystSaveGate({...})` — returns `{ requestSave, dialog }`.
 *      Use when the Save button lives elsewhere (e.g. `ModelDefaultsTab`
 *      lifts Save to the parent AdminPage via a save-state bridge).
 *
 * Doctrine: the Save click is intercepted. If no "blunt" violations are
 * found the save proceeds silently. If there are violations the dialog
 * opens with three actions: [Cancel] [Save Anyway] [Analyst ✨]. When
 * the user picks Analyst ✨ from inside the dialog the rerun fires,
 * violations are recomputed against the fresh guidance, and — if the
 * draft is now within band — the dialog auto-closes and Save proceeds.
 * A rerun triggered from the header button does NOT auto-close the
 * dialog (we track `awaitingRerun` to distinguish).
 *
 * The component does NOT own the Save mutation — it just intercepts
 * the click.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import {
  toGuidanceKeys,
  type AnalystFieldSpec,
} from "@/components/admin/model-defaults/analyst-fields";

export interface UseAnalystSaveGateOptions {
  /** Current form state. Flat keys only — pre-flatten envelopes if needed. */
  draft: Record<string, unknown>;
  /** Guidance records for the relevant scope. */
  guidance: AnalystGuidanceRecord[];
  /** Canonical field specs covered by this Save action (guidance-key ↔ draft-key pairs). */
  fields: readonly AnalystFieldSpec[];
  /** Invoked when the Save should proceed (silently or via "Save Anyway"). */
  onSave: () => void;
  /** Fires a scoped Analyst rerun. Called when the user picks "Analyst ✨". */
  onAnalystRerun: (fields?: string[]) => void;
  /** Parent-driven run + cooldown state from `useAnalystRefresh`. */
  analystRunning?: boolean;
  analystCooldownMs?: number;
}

export interface UseAnalystSaveGateResult {
  /** Invoke in place of the raw onSave — runs the gate. */
  requestSave: () => void;
  /** Render this somewhere in the tree. It's a controlled dialog. */
  dialog: ReactNode;
  /** Current violation list (empty if none). */
  violations: AnalystViolation[];
  /** True when the current draft would trigger the gate on Save. */
  shouldInterrupt: boolean;
}

function formatPct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

function renderBand(v: AnalystViolation): string {
  return `value ${v.value} vs Analyst range [${v.low} – ${v.high}]`;
}

export function useAnalystSaveGate(
  options: UseAnalystSaveGateOptions,
): UseAnalystSaveGateResult {
  const {
    draft,
    guidance,
    fields,
    onSave,
    onAnalystRerun,
    analystRunning = false,
    analystCooldownMs = 0,
  } = options;

  const [open, setOpen] = useState(false);
  // Separate from analystRunning so a background rerun (from a header
  // button) doesn't auto-close the dialog.
  const [awaitingRerun, setAwaitingRerun] = useState(false);

  const { violations, shouldInterrupt } = useMemo(
    () => computeAnalystViolations({ draft, guidance, fields }),
    [draft, guidance, fields],
  );

  // Watch for "rerun just finished" — only matters while we're waiting.
  const prevRunning = useRef<boolean>(analystRunning);
  useEffect(() => {
    const justFinished = prevRunning.current && !analystRunning;
    prevRunning.current = analystRunning;
    if (!justFinished || !awaitingRerun) return;

    setAwaitingRerun(false);
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

  const requestSave = useCallback(() => {
    if (!shouldInterrupt) {
      onSave();
      return;
    }
    setOpen(true);
  }, [shouldInterrupt, onSave]);

  const handleSaveAnyway = useCallback(() => {
    setOpen(false);
    onSave();
  }, [onSave]);

  const handleRerun = useCallback(() => {
    setAwaitingRerun(true);
    onAnalystRerun(toGuidanceKeys(fields));
  }, [onAnalystRerun, fields]);

  const handleCancel = useCallback(() => {
    setOpen(false);
    setAwaitingRerun(false);
  }, []);

  const dialog = (
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
  );

  return { requestSave, dialog, violations, shouldInterrupt };
}

export interface SaveWithAnalystGateProps extends UseAnalystSaveGateOptions {
  saveLabel?: string;
  saveVariant?: ButtonProps["variant"];
  saveSize?: ButtonProps["size"];
  saveDisabled?: boolean;
  saveClassName?: string;
  testIdSuffix?: string;
}

export function SaveWithAnalystGate(props: SaveWithAnalystGateProps) {
  const {
    saveLabel = "Save",
    saveVariant = "default",
    saveSize,
    saveDisabled = false,
    saveClassName,
    testIdSuffix,
    ...gateOptions
  } = props;

  const { requestSave, dialog } = useAnalystSaveGate(gateOptions);
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
        onClick={requestSave}
        data-testid={testIdSave}
      >
        {saveLabel}
      </Button>
      {dialog}
    </>
  );
}
