/**
 * AnalystUnsavedChangesDialog — three-button dialog shown when an admin
 * presses the page-level AnalystButton with unsaved form changes on
 * Company Assumptions.
 *
 * The Analyst evaluates only what's persisted in the GlobalAssumptions
 * row — it cannot see in-flight form edits. So when the form is dirty,
 * the user has three choices:
 *
 *   1. Save and analyze        — persist the active tab first, then run
 *                                the Analyst against the fresh state.
 *   2. Continue with last-saved — ignore unsaved edits and run the
 *                                Analyst against the current persisted
 *                                row (useful for "what would you say
 *                                about what I have on disk?").
 *   3. Cancel                  — close the dialog, keep editing.
 *
 * Voice convention: this dialog speaks AS the Analyst (concise, plain,
 * decision-prompting). It does NOT scold the user for being dirty.
 */
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { IconSparkles } from "@/components/icons";
import { Loader2 } from "@/components/icons/themed-icons";

export interface AnalystUnsavedChangesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveAndAnalyze: () => void | Promise<void>;
  onContinueWithLastSaved: () => void;
  isSaving?: boolean;
  /** Human label for which tab will be saved (e.g. "Funding"). */
  tabLabel?: string;
}

export function AnalystUnsavedChangesDialog({
  open,
  onOpenChange,
  onSaveAndAnalyze,
  onContinueWithLastSaved,
  isSaving = false,
  tabLabel,
}: AnalystUnsavedChangesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isSaving) onOpenChange(v); }}>
      <DialogContent
        className="sm:max-w-md overflow-hidden"
        data-testid="dialog-analyst-unsaved-changes"
      >
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary">
                <IconSparkles className="h-4 w-4" />
              </span>
              You have unsaved changes
            </DialogTitle>
            <DialogDescription className="label-text">
              The Analyst can only see what's saved. Save your{" "}
              {tabLabel ? (
                <span className="font-medium text-foreground">
                  {tabLabel}
                </span>
              ) : (
                "current"
              )}
              {" "}edits first, or run the Analyst against the last-saved
              state.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-4 flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
              data-testid="button-analyst-unsaved-cancel"
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={onContinueWithLastSaved}
              disabled={isSaving}
              data-testid="button-analyst-unsaved-continue"
            >
              Continue with last-saved
            </Button>
            <Button
              variant="default"
              onClick={() => void onSaveAndAnalyze()}
              disabled={isSaving}
              data-testid="button-analyst-unsaved-save-and-analyze"
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save and analyze"
              )}
            </Button>
          </DialogFooter>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
